export type EntityKey = string | number;
export type EntityIdentity<T> = (entity: T) => EntityKey;
export type FieldPath = readonly (string | number)[];
export type RendererKey = string;
export type Unsubscribe = () => void;
export type Disposer = () => void | Promise<void>;
export type MessageLike = string | MessageDescriptor;
export interface MessageDescriptor {
  readonly key: string;
  readonly defaultMessage?: string;
  readonly params?: Readonly<Record<string, unknown>>;
}

export interface FieldPredicateContext<T> {
  readonly candidate: T;
  readonly fieldId: string;
  readonly mode: SessionMode;
  readonly revision: number;
  readonly values: ReadonlyMap<string, unknown>;
}
export type FieldPredicate<T> = (context: FieldPredicateContext<T>) => boolean;

/** Domain accessors, validation and renderer selection for one registered field. */
export interface FieldDefinition<T, V = unknown> {
  readonly id: string;
  readonly path: FieldPath;
  readonly label?: MessageLike;
  readonly read: (entity: T) => V;
  readonly write: (entity: T, value: V) => T;
  readonly equals?: (a: V, b: V) => boolean;
  readonly validators?: readonly FieldValidator<T, V>[];
  readonly renderer: RendererKey;
  readonly presentation?: Readonly<Record<string, unknown>>;
  readonly visibleWhen?: FieldPredicate<T>;
  readonly enabledWhen?: FieldPredicate<T>;
  readonly readOnlyWhen?: FieldPredicate<T>;
}

export type SessionMode = 'create' | 'edit' | 'multi-edit';
/** The legacy failed value is reserved for source compatibility. Runtime failures return to editing or cancel the session. */
export type SessionPhase =
  | 'opening'
  | 'editing'
  | 'validating'
  | 'submitting'
  | 'committed'
  | 'cancelled'
  | 'failed';
export interface SingleDraftSnapshot<T> {
  readonly mode: 'create' | 'edit';
  readonly entity: T | null;
  readonly candidate: T;
  readonly values: ReadonlyMap<string, unknown>;
  readonly dirtyFields: ReadonlySet<string>;
}
export type MultiFieldBaseline<V> =
  { readonly kind: 'uniform'; readonly value: V } | { readonly kind: 'mixed' };
export type MultiFieldDraft<V> =
  | { readonly kind: 'unchanged' }
  | { readonly kind: 'mixed' }
  | { readonly kind: 'override'; readonly value: V };
export interface MultiFieldState<V> {
  readonly baseline: MultiFieldBaseline<V>;
  readonly draft: MultiFieldDraft<V>;
}
export interface MultiEditSnapshot<T> {
  readonly mode: 'multi-edit';
  readonly entities: readonly {
    readonly key: EntityKey;
    readonly baseline: T;
  }[];
  readonly fields: ReadonlyMap<string, MultiFieldState<unknown>>;
  readonly dirtyFields: ReadonlySet<string>;
}
export type DraftSnapshot<T> = SingleDraftSnapshot<T> | MultiEditSnapshot<T>;

export interface FieldChange<V = unknown> {
  readonly fieldId: string;
  readonly path: FieldPath;
  readonly before: V;
  readonly after: V;
}
export interface ChangeSet<T> {
  readonly original: T;
  readonly candidate: T;
  readonly changes: readonly FieldChange[];
  readonly dirty: boolean;
}
export interface EntityChangeSet<T> {
  readonly key: EntityKey;
  readonly original: T;
  readonly candidate: T;
  readonly changes: readonly FieldChange[];
}
export interface MultiChangeSet<T> {
  readonly entities: readonly EntityChangeSet<T>[];
  readonly dirty: boolean;
}

export interface ValidationIssue {
  readonly code: string;
  readonly path?: FieldPath;
  readonly fieldId?: string;
  readonly message?: string;
  readonly messageKey?: string;
  readonly params?: Readonly<Record<string, unknown>>;
  readonly severity?: 'error' | 'warning';
  readonly source?: 'field' | 'form' | 'schema' | 'server';
}
export interface ValidationContext<T> {
  readonly entity: T | null;
  readonly candidate: T;
  readonly fieldId: string;
  readonly revision: number;
  readonly signal: AbortSignal;
}
export type ValidatorResult =
  ValidationIssue | readonly ValidationIssue[] | null;
export type FieldValidator<T, V> = (
  value: V,
  context: ValidationContext<T>,
) => ValidatorResult | Promise<ValidatorResult>;
export type EntityValidator<T> = (
  candidate: T,
  context: Omit<ValidationContext<T>, 'fieldId'>,
) => ValidatorResult | Promise<ValidatorResult>;
/** Validation result bound to a draft revision and operation identity. */
export interface ValidationReport {
  readonly operationId: string;
  readonly revision: number;
  readonly status: 'current' | 'stale' | 'aborted';
  readonly issues: readonly ValidationIssue[];
  readonly valid: boolean;
}
export type ValidationState =
  | { readonly status: 'unvalidated' }
  | {
      readonly status: 'pending';
      readonly revision: number;
      readonly operationId: string;
    }
  | { readonly status: 'current'; readonly report: ValidationReport }
  | { readonly status: 'stale' };

export interface StandardSchemaV1Like<Input = unknown, Output = Input> {
  readonly '~standard': {
    readonly version: 1;
    readonly vendor: string;
    readonly validate: (
      value: unknown,
      options?: { readonly libraryOptions?: Record<string, unknown> },
    ) =>
      | { readonly value: Output; readonly issues?: undefined }
      | { readonly issues: readonly StandardSchemaIssueLike[] }
      | Promise<
          | { readonly value: Output; readonly issues?: undefined }
          | { readonly issues: readonly StandardSchemaIssueLike[] }
        >;
  };
}
export interface StandardSchemaIssueLike {
  readonly message: string;
  readonly path?: readonly (PropertyKey | { readonly key: PropertyKey })[];
}

export type ErrorCategory =
  | 'configuration'
  | 'invariant'
  | 'validation'
  | 'mutation'
  | 'reconciliation'
  | 'host'
  | 'presentation'
  | 'renderer'
  | 'destroyed'
  | 'capability';
export interface EditorErrorInfo {
  readonly code: string;
  readonly category: ErrorCategory;
  readonly recoverable: boolean;
  readonly message: string;
  readonly cause?: unknown;
  readonly context?: Readonly<Record<string, unknown>>;
}
export type EditorError = Error & EditorErrorInfo;
export interface EditorLogger {
  log(
    level: 'debug' | 'info' | 'warn' | 'error',
    code: string,
    context?: Readonly<Record<string, unknown>>,
  ): void;
}
export type CommandOutcome =
  | { readonly status: 'ok' }
  | { readonly status: 'unchanged' }
  | { readonly status: 'busy'; readonly activeOperationId: string }
  | {
      readonly status: 'locked';
      readonly reason: 'submitting' | 'terminal' | 'destroyed';
    }
  | { readonly status: 'rejected'; readonly error: EditorError };

export type ConflictResolution =
  | { readonly kind: 'accept-remote' }
  | { readonly kind: 'rebase-local' }
  | {
      readonly kind: 'merge';
      readonly fields: Readonly<Record<string, 'local' | 'remote'>>;
    };
export type SessionConflict<T> =
  | {
      readonly kind: 'updated';
      readonly entityKey: EntityKey;
      readonly baseline: T;
      readonly localCandidate: T;
      readonly remote: T;
      readonly localDirtyFieldIds: readonly string[];
      readonly remoteChangedFieldIds: readonly string[];
      readonly conflictingFieldIds: readonly string[];
    }
  | {
      readonly kind: 'deleted';
      readonly entityKey: EntityKey;
      readonly baseline: T;
      readonly localCandidate: T;
      readonly localDirtyFieldIds: readonly string[];
    };

/** Observable session state. Applications must treat entity and field values as immutable. */
export interface SessionSnapshot<T> {
  readonly uncertainties?: readonly UncertainMutationRecord[];
  readonly batch?: BatchMutationOutcome<T>;
  readonly externalChangePolicy?: ExternalChangePolicy;
  readonly sessionId: string;
  readonly revision: number;
  readonly mode: SessionMode;
  readonly phase: SessionPhase;
  readonly draft: DraftSnapshot<T>;
  readonly changeSet?: ChangeSet<T> | MultiChangeSet<T>;
  readonly validation: ValidationState;
  readonly issues: readonly ValidationIssue[];
  readonly conflict?: SessionConflict<T>;
  readonly dirty: boolean;
  readonly activeOperationId?: string;
}
export type SessionListener<T> = (snapshot: SessionSnapshot<T>) => void;
export type EditorCommand =
  | { readonly type: 'set'; readonly fieldId: string; readonly value: unknown }
  | { readonly type: 'reset'; readonly fieldId?: string }
  | { readonly type: 'cancel'; readonly reason?: string }
  | {
      readonly type: 'resolve-conflict';
      readonly decision: ConflictResolution;
    };

export interface EditorEventMap<T> {
  'mutation:removed': {
    sessionId: string;
    operationId: string;
    entityKey: EntityKey;
  };
  'session:opened': { sessionId: string; mode: SessionMode };
  'session:changed': { sessionId: string; revision: number };
  'validation:started': {
    sessionId: string;
    operationId: string;
    revision: number;
  };
  'validation:completed': { sessionId: string; report: ValidationReport };
  'mutation:started': {
    sessionId: string;
    operationId: string;
    clientMutationId: string;
  };
  'mutation:committed': { sessionId: string; operationId: string; entity: T };
  'mutation:failed': {
    sessionId: string;
    operationId: string;
    error: EditorError;
  };
  'mutation:uncertain': UncertainMutationRecord;
  'conflict:detected': { sessionId: string; conflict: SessionConflict<T> };
  'conflict:resolved': { sessionId: string; decision: ConflictResolution };
  'host:reflection-failed': { sessionId: string; error: EditorError };
  'session:cancelled': { sessionId: string; reason?: string };
  'runtime:destroyed': { completion: 'done' };
}
export type EditorEventName<T> = keyof EditorEventMap<T>;

export type ReflectionStatus =
  | { readonly status: 'applied' }
  | { readonly status: 'skipped' }
  | { readonly status: 'failed'; readonly error: EditorError };
/** Submission result, including per entity batch results and independent host reflection. */
export type SubmitOutcome<T> =
  | {
      readonly status: 'batch';
      readonly result: BatchMutationOutcome<T>;
      readonly reflections: readonly {
        readonly key: EntityKey;
        readonly reflection: ReflectionStatus;
      }[];
    }
  | {
      readonly status: 'committed';
      readonly entity: T;
      readonly reflection: ReflectionStatus;
    }
  | { readonly status: 'invalid'; readonly issues: readonly ValidationIssue[] }
  | { readonly status: 'busy'; readonly activeOperationId: string }
  | { readonly status: 'superseded'; readonly operationId: string }
  | { readonly status: 'conflict'; readonly conflict: SessionConflict<T> }
  | { readonly status: 'cancelled'; readonly beforeDispatch: true }
  | { readonly status: 'uncertain'; readonly record: UncertainMutationRecord }
  | { readonly status: 'failed'; readonly error: EditorError };
export type RemoveOutcome =
  | { readonly status: 'removed'; readonly reflection: ReflectionStatus }
  | { readonly status: 'conflict'; readonly entityKey: EntityKey }
  | { readonly status: 'uncertain'; readonly record: UncertainMutationRecord }
  | { readonly status: 'failed'; readonly error: EditorError };

export interface MutationContext {
  readonly signal: AbortSignal;
  readonly sessionId: string;
  readonly operationId: string;
  readonly clientMutationId: string;
}
export type MutationOutcome<T> =
  | { readonly ok: true; readonly entity: T; readonly meta?: unknown }
  | {
      readonly ok: false;
      readonly kind: 'validation';
      readonly issues: readonly ValidationIssue[];
    }
  | {
      readonly ok: false;
      readonly kind: 'conflict';
      readonly remote?: T;
      readonly message?: string;
    }
  | {
      readonly ok: false;
      readonly kind: 'forbidden';
      readonly message?: string;
    }
  | {
      readonly ok: false;
      readonly kind: 'transport';
      readonly retryable: boolean;
      readonly certainty: 'not-committed' | 'unknown';
      readonly error?: unknown;
    }
  | {
      readonly ok: false;
      readonly kind: 'unknown';
      readonly certainty?: 'not-committed' | 'unknown';
      readonly error?: unknown;
    };
export type RemoveMutationOutcome =
  | { readonly ok: true }
  | {
      readonly ok: false;
      readonly kind: 'conflict' | 'forbidden';
      readonly message?: string;
    }
  | {
      readonly ok: false;
      readonly kind: 'transport';
      readonly retryable: boolean;
      readonly certainty: 'not-committed' | 'unknown';
      readonly error?: unknown;
    };
/** Application persistence. Successful writes return canonical entities. */
export interface MutationPort<T> {
  create?(
    request: { readonly candidate: T },
    ctx: MutationContext,
  ): Promise<MutationOutcome<T>>;
  update?(
    request: {
      readonly original: T;
      readonly candidate: T;
      readonly changes: ChangeSet<T>;
    },
    ctx: MutationContext,
  ): Promise<MutationOutcome<T>>;
  remove?(
    request: { readonly entity: T },
    ctx: MutationContext,
  ): Promise<RemoveMutationOutcome>;
}
export interface EntityBatchResult<T> {
  readonly key: EntityKey;
  readonly outcome: MutationOutcome<T>;
}
export interface BatchMutationOutcome<T> {
  readonly atomicity: 'atomic' | 'non-atomic';
  readonly items: readonly EntityBatchResult<T>[];
}
export interface BatchMutationPort<T> {
  updateMany?(
    request: { readonly changes: MultiChangeSet<T> },
    ctx: MutationContext,
  ): Promise<BatchMutationOutcome<T>>;
}
export interface UncertainMutationRecord {
  readonly cause?: unknown;
  readonly sessionId: string;
  readonly operationId: string;
  readonly clientMutationId: string;
  readonly entityKey?: EntityKey;
  readonly kind: 'create' | 'update' | 'remove' | 'updateMany';
  readonly reason: 'aborted-after-dispatch' | 'transport-unknown';
}
export type ReconciliationRequest =
  | {
      readonly kind: 'by-key';
      readonly entityKey: EntityKey;
      readonly operationId?: string;
    }
  | {
      readonly kind: 'by-client-mutation-id';
      readonly clientMutationId: string;
    };
export type ReconciliationResult<T> =
  | { readonly kind: 'present'; readonly entity: T }
  | { readonly kind: 'absent'; readonly authoritative: true }
  | { readonly kind: 'unknown' };
/** Resolve an uncertain dispatched mutation using authoritative application evidence. */
export interface ReconciliationPort<T> {
  reconcile(
    request: ReconciliationRequest,
    context: { readonly signal: AbortSignal },
  ): Promise<ReconciliationResult<T>>;
}

export interface CreateSessionOptions<T> {
  readonly initial?: T;
}
export interface ExternalChangeMeta {
  readonly source: string;
}
export interface EditorOptions<T> {
  readonly validationConcurrency?: number;
  readonly identity?: EntityIdentity<T>;
  readonly fields: readonly FieldDefinition<T, unknown>[];
  readonly createInitial?: () => T;
  readonly schema?: StandardSchemaV1Like<T, unknown>;
  readonly persistence?: MutationPort<T>;
  readonly batchPersistence?: BatchMutationPort<T>;
  readonly reconciliation?: ReconciliationPort<T>;
  readonly validators?: readonly EntityValidator<T>[];
  readonly logger?: EditorLogger;
  readonly externalChangePolicy?: ExternalChangePolicy;
}
export type ExternalChangePolicy = 'notify' | 'silent' | 'rebase-clean';
export interface EditSession<T> {
  readonly id: string;
  snapshot(): SessionSnapshot<T>;
  set(fieldId: string, value: unknown): CommandOutcome;
  reset(fieldId?: string): CommandOutcome;
  validate(): Promise<ValidationReport>;
  submit(): Promise<SubmitOutcome<T>>;
  resolveConflict(decision: ConflictResolution): CommandOutcome;
  cancel(reason?: string): void;
  subscribe(listener: SessionListener<T>): Unsubscribe;
}

export interface HostConnection<T> {
  readonly resolveEntity?: (
    target: unknown,
  ) => { key: EntityKey; entity: T } | null;
  readonly capabilities: object;
  detach(): void | Promise<void>;
}
export interface PresentationContext<T> {
  readonly signal?: AbortSignal;
  getSnapshot(): SessionSnapshot<T>;
  subscribe(listener: SessionListener<T>): Unsubscribe;
  dispatch(command: EditorCommand): CommandOutcome;
  validate(): Promise<ValidationReport>;
  submit(): Promise<SubmitOutcome<T>>;
  readonly capabilities: object;
}
export interface Presentation<T> {
  readonly requiredCapabilities: readonly string[];
  mount(context: PresentationContext<T>): void | Promise<void>;
  destroy(): void | Promise<void>;
}
/** Coordinate sessions, integrations, external notifications and asynchronous disposal. */
export interface EditorRuntime<T> {
  edit(entity: T): EditSession<T>;
  create(options?: CreateSessionOptions<T>): EditSession<T>;
  editMany(entities: readonly T[]): EditSession<T>;
  remove(entity: T): Promise<RemoveOutcome>;
  attach(host: HostConnection<T>): Disposer;
  use(presentation: Presentation<T>): Disposer;
  on<K extends keyof EditorEventMap<T>>(
    event: K,
    listener: (payload: EditorEventMap<T>[K]) => void,
  ): Unsubscribe;
  notifyExternalEntity(entity: T, meta?: ExternalChangeMeta): void;
  notifyExternalRemoval(entityKey: EntityKey, meta?: ExternalChangeMeta): void;
  destroy(): Promise<void>;
}
