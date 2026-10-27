import type {
  CommandOutcome,
  ConflictResolution,
  EditSession,
  EditorEventMap,
  EditorOptions,
  EntityKey,
  SessionConflict,
  SessionListener,
  SessionMode,
  SessionPhase,
  SessionSnapshot,
  SubmitOutcome,
  UncertainMutationRecord,
  ValidationReport,
  ValidationState,
  MutationContext,
  MutationOutcome,
  ReflectionStatus,
  BatchMutationOutcome,
  MultiChangeSet,
} from './types.js';
import {
  aborted,
  changes,
  identifier,
  terminal,
  transition,
} from './changes.js';
import { configurationError, editorError } from './errors.js';
import { validateCandidate, serverIssues } from './validation.js';

export interface SessionEnvironment<T> {
  readonly options: EditorOptions<T>;
  destroyed(): boolean;
  emit<K extends keyof EditorEventMap<T>>(
    event: K,
    payload: EditorEventMap<T>[K],
  ): void;
  uncertain(record: UncertainMutationRecord): void;
  confirmed(record: UncertainMutationRecord): void;
  canonical(entity: T, record: UncertainMutationRecord): void;
  reflect(
    previous: T | null,
    current: T,
    sessionId: string,
  ): Promise<ReflectionStatus>;
}

export class Session<T> implements EditSession<T> {
  readonly id = identifier();
  readonly controller = new AbortController();
  phase: SessionPhase = 'opening';
  revision = 0;
  baselines: T[];
  candidates: T[];
  readonly overrides = new Map<string, unknown>();
  validation: ValidationState = { status: 'unvalidated' };
  issues: ValidationReport['issues'] = [];
  conflict: SessionConflict<T> | undefined;
  private conflicts = new Map<EntityKey, SessionConflict<T>>();
  private batchResult: BatchMutationOutcome<T> | undefined;
  private batchRecords: readonly UncertainMutationRecord[] = [];
  private listeners = new Set<SessionListener<T>>();
  private validationOperation:
    | {
        id: string;
        controller: AbortController;
        obsolete: 'stale' | 'aborted' | undefined;
      }
    | undefined;
  private activeOperationId: string | undefined;
  private clientMutationId = identifier();
  private pendingRecord: UncertainMutationRecord | undefined;
  private draftCache:
    | Pick<SessionSnapshot<T>, 'revision' | 'draft' | 'changeSet' | 'dirty'>
    | undefined;

  constructor(
    readonly mode: SessionMode,
    entities: readonly T[],
    readonly env: SessionEnvironment<T>,
  ) {
    this.baselines = [...entities];
    this.candidates = [...entities];
  }

  ready(entities?: readonly T[]): void {
    if (this.phase !== 'opening' || this.env.destroyed()) return;
    if (entities) {
      this.baselines = [...entities];
      this.candidates = [...entities];
      this.draftCache = undefined;
    }
    this.move('editing');
    this.publish();
  }

  private move(to: SessionPhase): void {
    this.phase = transition(this.phase, to);
  }

  snapshot(): SessionSnapshot<T> {
    const data =
      this.draftCache?.revision === this.revision
        ? this.draftCache
        : (this.draftCache = this.snapshotDraft());
    return {
      ...data,
      ...(this.batchResult ? { batch: this.batchResult } : {}),
      externalChangePolicy: this.env.options.externalChangePolicy ?? 'notify',
      sessionId: this.id,
      mode: this.mode,
      phase: this.phase,
      validation: this.validation,
      issues: [...this.issues],
      ...(this.conflict ? { conflict: this.conflict } : {}),
      ...(this.activeOperationId
        ? { activeOperationId: this.activeOperationId }
        : {}),
    };
  }

  private snapshotDraft(): Pick<
    SessionSnapshot<T>,
    'revision' | 'draft' | 'changeSet' | 'dirty'
  > {
    const { fields, identity } = this.env.options;
    const first = this.candidates[0]!;
    const sets = this.candidates.map((candidate, index) =>
      changes(fields, this.baselines[index]!, candidate),
    );
    const dirtyFields = new Set(
      sets.flatMap((set) => set.changes.map((change) => change.fieldId)),
    );
    const draft =
      this.mode === 'multi-edit'
        ? {
            mode: 'multi-edit' as const,
            entities: this.baselines.map((baseline) => ({
              key: identity!(baseline),
              baseline,
            })),
            fields: new Map(
              fields.map((field) => {
                const value = field.read(this.baselines[0]!);
                const uniform = this.baselines.every((entity) =>
                  (field.equals ?? Object.is)(value, field.read(entity)),
                );
                const candidateValue = field.read(first);
                const candidatesUniform = this.candidates.every((entity) =>
                  (field.equals ?? Object.is)(
                    candidateValue,
                    field.read(entity),
                  ),
                );
                return [
                  field.id,
                  {
                    baseline: uniform
                      ? { kind: 'uniform' as const, value }
                      : { kind: 'mixed' as const },
                    draft: !dirtyFields.has(field.id)
                      ? { kind: 'unchanged' as const }
                      : candidatesUniform
                        ? {
                            kind: 'override' as const,
                            value: candidateValue,
                          }
                        : { kind: 'mixed' as const },
                  },
                ];
              }),
            ),
            dirtyFields,
          }
        : {
            mode: this.mode,
            entity: this.mode === 'create' ? null : this.baselines[0]!,
            candidate: first,
            values: new Map(
              fields.map((field) => [field.id, field.read(first)]),
            ),
            dirtyFields,
          };
    const changeSet =
      this.mode === 'multi-edit'
        ? {
            entities: sets.map((set) => ({
              key: identity!(set.original),
              original: set.original,
              candidate: set.candidate,
              changes: set.changes,
            })),
            dirty: dirtyFields.size > 0,
          }
        : sets[0]!;
    return {
      revision: this.revision,
      draft,
      changeSet,
      dirty: dirtyFields.size > 0,
    };
  }

  private publish(): void {
    const snapshot = this.snapshot();
    for (const listener of [...this.listeners]) {
      try {
        listener(snapshot);
      } catch {
        try {
          this.env.options.logger?.log('warn', 'observer-failed', {
            sessionId: this.id,
          });
        } catch {
          /* Diagnostics are isolated from command results. */
        }
      }
    }
    this.env.emit('session:changed', {
      sessionId: this.id,
      revision: this.revision,
    });
  }

  subscribe(listener: SessionListener<T>): () => void {
    if (this.env.destroyed() || terminal(this.phase)) return () => undefined;
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private writable(): CommandOutcome | undefined {
    if (this.env.destroyed()) return { status: 'locked', reason: 'destroyed' };
    if (terminal(this.phase)) return { status: 'locked', reason: 'terminal' };
    if (this.phase === 'submitting')
      return { status: 'locked', reason: 'submitting' };
    if (this.phase === 'opening')
      return {
        status: 'rejected',
        error: editorError(
          'reconciliation',
          'session-opening',
          'The session is waiting for canonical data.',
        ),
      };
    return undefined;
  }

  private invalidate(): void {
    if (this.validationOperation) {
      this.validationOperation.obsolete = 'stale';
      this.validationOperation.controller.abort();
      this.validationOperation = undefined;
    }
    if (this.phase === 'validating') this.move('editing');
    this.activeOperationId = undefined;
    this.validation = { status: 'stale' };
    this.issues = [];
    this.revision++;
  }

  set(fieldId: string, value: unknown): CommandOutcome {
    const rejected = this.writable();
    if (rejected) return rejected;
    const field = this.env.options.fields.find((field) => field.id === fieldId);
    if (!field)
      return {
        status: 'rejected',
        error: configurationError(`Unknown field: ${fieldId}.`),
      };
    try {
      if (
        this.candidates.every((candidate) =>
          (field.equals ?? Object.is)(field.read(candidate), value),
        ) &&
        (this.mode !== 'multi-edit' || this.overrides.has(fieldId))
      )
        return { status: 'unchanged' };
      const candidates = this.candidates.map((candidate) =>
        field.write(candidate, value),
      );
      this.invalidate();
      this.candidates = candidates;
      this.overrides.set(fieldId, value);
      this.clientMutationId = identifier();
      for (const conflict of [...this.conflicts.values()])
        this.external(
          conflict.kind === 'updated' ? conflict.remote : undefined,
          conflict.entityKey,
        );
      this.publish();
      return { status: 'ok' };
    } catch (cause) {
      return {
        status: 'rejected',
        error: editorError(
          'validation',
          'field-write-failed',
          'The field value could not be applied.',
          cause,
        ),
      };
    }
  }

  reset(fieldId?: string): CommandOutcome {
    const rejected = this.writable();
    if (rejected) return rejected;
    const fields = this.env.options.fields.filter(
      (field) => fieldId === undefined || field.id === fieldId,
    );
    if (!fields.length && fieldId !== undefined)
      return {
        status: 'rejected',
        error: configurationError(`Unknown field: ${fieldId}.`),
      };
    const changed = fields.some((field) => this.overrides.has(field.id));
    if (!changed) return { status: 'unchanged' };
    try {
      this.candidates = this.candidates.map((candidate, index) =>
        fields.reduce(
          (value, field) =>
            field.write(value, field.read(this.baselines[index]!)),
          candidate,
        ),
      );
    } catch (cause) {
      return {
        status: 'rejected',
        error: editorError(
          'validation',
          'field-write-failed',
          'The fields could not be reset.',
          cause,
        ),
      };
    }
    for (const field of fields) this.overrides.delete(field.id);
    this.invalidate();
    this.clientMutationId = identifier();
    for (const conflict of [...this.conflicts.values()])
      this.external(
        conflict.kind === 'updated' ? conflict.remote : undefined,
        conflict.entityKey,
      );
    this.publish();
    return { status: 'ok' };
  }

  async validate(): Promise<ValidationReport> {
    if (
      this.phase === 'submitting' ||
      terminal(this.phase) ||
      this.phase === 'opening' ||
      this.env.destroyed()
    )
      return {
        operationId: identifier(),
        revision: this.revision,
        status: 'aborted',
        issues: [],
        valid: false,
      };
    if (this.activeOperationId)
      return {
        operationId: this.activeOperationId,
        revision: this.revision,
        status: 'aborted',
        issues: [],
        valid: false,
      };
    return this.performValidation();
  }

  private async performValidation(
    submitId?: string,
  ): Promise<ValidationReport> {
    if (this.validationOperation) {
      this.validationOperation.obsolete = 'stale';
      this.validationOperation.controller.abort();
    }
    const operation = {
      id: identifier(),
      controller: new AbortController(),
      obsolete: undefined as 'stale' | 'aborted' | undefined,
    };
    this.validationOperation = operation;
    const revision = this.revision;
    if (this.phase === 'editing') this.move('validating');
    this.validation = {
      status: 'pending',
      revision,
      operationId: operation.id,
    };
    this.env.emit('validation:started', {
      sessionId: this.id,
      operationId: operation.id,
      revision,
    });
    this.publish();
    let issues: ValidationReport['issues'];
    try {
      issues = (
        await aborted(
          Promise.all(
            this.candidates.map((candidate, index) =>
              validateCandidate(
                this.env.options,
                this.mode === 'create' ? null : this.baselines[index]!,
                candidate,
                revision,
                operation.controller.signal,
              ),
            ),
          ),
          operation.controller.signal,
        )
      ).flat();
    } catch {
      issues = operation.controller.signal.aborted
        ? []
        : [
            {
              code: 'validation-unavailable',
              messageKey: 'validation-unavailable',
              source: 'form',
            },
          ];
    }
    const status =
      operation.obsolete ??
      (this.controller.signal.aborted || this.env.destroyed()
        ? 'aborted'
        : this.validationOperation !== operation || revision !== this.revision
          ? 'stale'
          : 'current');
    const report: ValidationReport = {
      operationId: operation.id,
      revision,
      status,
      issues,
      valid:
        status === 'current' &&
        !issues.some((issue) => issue.severity !== 'warning'),
    };
    if (status === 'current') {
      this.validationOperation = undefined;
      this.validation = { status: 'current', report };
      this.issues = issues;
      if (!submitId || !report.valid) this.move('editing');
      this.publish();
    }
    this.env.emit('validation:completed', { sessionId: this.id, report });
    return report;
  }

  async submit(): Promise<SubmitOutcome<T>> {
    if (this.activeOperationId)
      return { status: 'busy', activeOperationId: this.activeOperationId };
    if (
      this.env.destroyed() ||
      terminal(this.phase) ||
      this.phase === 'opening'
    )
      return {
        status: 'failed',
        error: editorError(
          'mutation',
          'session-unavailable',
          'This session cannot be submitted.',
        ),
      };
    if (this.conflict) return { status: 'conflict', conflict: this.conflict };
    const operationId = identifier();
    this.activeOperationId = operationId;
    const report = await this.performValidation(operationId);
    if (this.controller.signal.aborted)
      return { status: 'cancelled', beforeDispatch: true };
    if (report.status !== 'current' || this.activeOperationId !== operationId)
      return { status: 'superseded', operationId };
    if (!report.valid) {
      this.activeOperationId = undefined;
      this.publish();
      return { status: 'invalid', issues: report.issues };
    }
    if (this.conflict) {
      this.move('editing');
      this.activeOperationId = undefined;
      return { status: 'conflict', conflict: this.conflict };
    }
    const context: MutationContext = {
      signal: this.controller.signal,
      sessionId: this.id,
      operationId,
      clientMutationId: this.clientMutationId,
    };
    if (this.mode === 'multi-edit') {
      return this.submitBatch(context);
    }
    const persistence = this.env.options.persistence;
    const original = this.baselines[0]!,
      candidate = this.candidates[0]!;
    if (!(this.mode === 'create' ? persistence?.create : persistence?.update)) {
      this.move('editing');
      this.activeOperationId = undefined;
      this.publish();
      return {
        status: 'failed',
        error: configurationError(
          'Persistence is required for this operation.',
        ),
      };
    }
    const record: UncertainMutationRecord = {
      sessionId: this.id,
      operationId,
      clientMutationId: this.clientMutationId,
      kind: this.mode === 'create' ? 'create' : 'update',
      reason: 'aborted-after-dispatch',
      ...(this.mode === 'edit' && this.env.options.identity
        ? { entityKey: this.env.options.identity(original) }
        : {}),
    };
    this.move('submitting');
    this.publish();
    if (this.controller.signal.aborted) {
      this.pendingRecord = undefined;
      return { status: 'cancelled', beforeDispatch: true };
    }
    this.pendingRecord = record;
    this.env.emit('mutation:started', context);
    let dispatched: Promise<MutationOutcome<T>>;
    try {
      dispatched = Promise.resolve(
        this.mode === 'create'
          ? persistence!.create!({ candidate }, context)
          : persistence!.update!(
              {
                original,
                candidate,
                changes: changes(this.env.options.fields, original, candidate),
              },
              context,
            ),
      );
    } catch (cause) {
      dispatched = Promise.reject(cause);
    }
    let definitive: MutationOutcome<T> | undefined;
    dispatched.then(
      (outcome) => {
        definitive = outcome;
        if (
          outcome.ok &&
          this.controller.signal.aborted &&
          !this.env.destroyed()
        )
          this.env.canonical(outcome.entity, record);
        else if (
          this.controller.signal.aborted &&
          !outcome.ok &&
          (!(outcome.kind === 'transport' || outcome.kind === 'unknown') ||
            outcome.certainty === 'not-committed')
        )
          this.env.confirmed(record);
      },
      () => undefined,
    );
    let outcome: MutationOutcome<T>;
    try {
      outcome = await aborted(dispatched, this.controller.signal);
    } catch {
      outcome = {
        ok: false,
        kind: 'transport',
        retryable: true,
        certainty: 'unknown',
      };
    }
    this.pendingRecord = undefined;
    if (this.controller.signal.aborted || this.env.destroyed()) {
      if (definitive?.ok)
        return {
          status: 'committed',
          entity: definitive.entity,
          reflection: { status: 'skipped' },
        };
      if (
        definitive &&
        !definitive.ok &&
        (!(definitive.kind === 'transport' || definitive.kind === 'unknown') ||
          definitive.certainty === 'not-committed')
      )
        return {
          status: 'failed',
          error: editorError(
            'mutation',
            'mutation-not-committed',
            'The mutation did not commit.',
          ),
        };
      this.env.uncertain(record);
      return { status: 'uncertain', record };
    }
    this.activeOperationId = undefined;
    if (outcome.ok) {
      this.baselines = [outcome.entity];
      this.candidates = [outcome.entity];
      this.overrides.clear();
      this.revision++;
      this.validation = { status: 'unvalidated' };
      this.issues = [];
      this.conflict = undefined;
      this.conflicts.clear();
      this.move('committed');
      this.publish();
      this.listeners.clear();
      this.env.emit('mutation:committed', {
        sessionId: this.id,
        operationId,
        entity: outcome.entity,
      });
      const reflection = await this.env.reflect(
        this.mode === 'create' ? null : original,
        outcome.entity,
        this.id,
      );
      return { status: 'committed', entity: outcome.entity, reflection };
    }
    this.move('editing');
    if (outcome.kind === 'validation') {
      this.issues = serverIssues(this.env.options, outcome.issues);
      this.validation = {
        status: 'current',
        report: {
          operationId,
          revision: this.revision,
          status: 'current',
          valid: false,
          issues: this.issues,
        },
      };
      this.publish();
      return { status: 'invalid', issues: this.issues };
    }
    if (
      outcome.kind === 'conflict' &&
      outcome.remote !== undefined &&
      this.env.options.identity
    ) {
      this.external(outcome.remote, this.env.options.identity(original));
      return { status: 'conflict', conflict: this.conflict! };
    }
    if (
      (outcome.kind === 'transport' || outcome.kind === 'unknown') &&
      outcome.certainty !== 'not-committed'
    ) {
      const unknown = { ...record, reason: 'transport-unknown' as const };
      this.env.uncertain(unknown);
      this.cancel('reconciliation-required');
      return { status: 'uncertain', record: unknown };
    }
    const error = editorError(
      'mutation',
      'mutation-failed',
      'The data could not be saved.',
    );
    this.env.emit('mutation:failed', {
      sessionId: this.id,
      operationId,
      error,
    });
    this.publish();
    return { status: 'failed', error };
  }

  private async submitBatch(
    context: MutationContext,
  ): Promise<SubmitOutcome<T>> {
    const persistence = this.env.options.batchPersistence?.updateMany;
    const identity = this.env.options.identity!;
    if (!persistence) {
      this.move('editing');
      this.activeOperationId = undefined;
      this.publish();
      return {
        status: 'failed',
        error: configurationError(
          'Multiple entity submission requires batchPersistence.updateMany.',
        ),
      };
    }
    const changeSet = this.snapshot().changeSet as MultiChangeSet<T>;
    const entities = changeSet.entities.filter(
      (entity) => entity.changes.length > 0,
    );
    const records = entities.map((entity) => ({
      sessionId: this.id,
      operationId: context.operationId,
      clientMutationId: context.clientMutationId,
      entityKey: entity.key,
      kind: 'updateMany' as const,
      reason: 'aborted-after-dispatch' as const,
    }));
    this.move('submitting');
    this.publish();
    if (this.controller.signal.aborted)
      return { status: 'cancelled', beforeDispatch: true };
    this.batchRecords = records;
    let result: BatchMutationOutcome<T>;
    if (!entities.length) result = { atomicity: 'non-atomic', items: [] };
    else {
      this.env.emit('mutation:started', context);
      let dispatched: Promise<BatchMutationOutcome<T>>;
      try {
        dispatched = Promise.resolve(
          persistence({ changes: { entities, dirty: true } }, context),
        );
      } catch (cause) {
        dispatched = Promise.reject(cause);
      }
      const requestedKeys = new Set(entities.map((entity) => entity.key));
      const valid = (outcome: BatchMutationOutcome<T>) =>
        outcome != null &&
        Array.isArray(outcome.items) &&
        outcome.items.length === entities.length &&
        outcome.items.every(
          (item) =>
            item != null &&
            item.outcome != null &&
            typeof item.outcome.ok === 'boolean',
        ) &&
        new Set(outcome.items.map((item) => item.key)).size ===
          entities.length &&
        outcome.items.every((item) => requestedKeys.has(item.key)) &&
        (outcome.atomicity === 'non-atomic' ||
          (outcome.atomicity === 'atomic' &&
            (outcome.items.every((item) => item.outcome.ok) ||
              outcome.items.every((item) => !item.outcome.ok))));
      dispatched = dispatched.then((outcome) => {
        if (!valid(outcome)) {
          const error = editorError(
            'invariant',
            'invalid-batch-result',
            'Batch persistence must return one result per key and consistent atomicity.',
          );
          this.env.emit('mutation:failed', {
            sessionId: this.id,
            operationId: context.operationId,
            error,
          });
          throw error;
        }
        return outcome;
      });
      let authoritative: BatchMutationOutcome<T> | undefined;
      dispatched.then(
        (outcome) => {
          authoritative = outcome;
          if (!this.controller.signal.aborted || this.env.destroyed()) return;
          for (const item of outcome.items) {
            const record = records.find(
              (record) => record.entityKey === item.key,
            )!;
            if (item.outcome.ok)
              this.env.canonical(item.outcome.entity, record);
            else if (
              !(
                item.outcome.kind === 'transport' ||
                item.outcome.kind === 'unknown'
              ) ||
              item.outcome.certainty === 'not-committed'
            )
              this.env.confirmed(record);
          }
        },
        () => undefined,
      );
      try {
        result = await aborted(dispatched, this.controller.signal);
      } catch (error) {
        result = authoritative ?? {
          atomicity: 'non-atomic',
          items: entities.map((entity) => ({
            key: entity.key,
            outcome: {
              ok: false,
              kind: 'transport',
              retryable: true,
              certainty: 'unknown',
              error,
            },
          })),
        };
      }
    }
    this.batchRecords = [];
    const reflections: { key: EntityKey; reflection: ReflectionStatus }[] = [];
    if (this.controller.signal.aborted || this.env.destroyed()) {
      for (const record of records) {
        const item = result.items.find((item) => item.key === record.entityKey);
        if (
          item &&
          (item.outcome.ok ||
            !(
              item.outcome.kind === 'transport' ||
              item.outcome.kind === 'unknown'
            ) ||
            item.outcome.certainty === 'not-committed')
        )
          this.env.confirmed(record);
        else this.env.uncertain(record);
      }
      return { status: 'batch', result, reflections };
    }
    this.batchResult = result;
    this.activeOperationId = undefined;
    const errors: ValidationReport['issues'][number][] = [];
    const committed: { key: EntityKey; previous: T; current: T }[] = [];
    const unresolved: UncertainMutationRecord[] = [];
    const conflicts: { key: EntityKey; remote: T }[] = [];
    let uncertain = false;
    const baselineIndices = new Map(
      this.baselines.map((entity, index) => [identity(entity), index]),
    );
    for (const item of result.items) {
      const index = baselineIndices.get(item.key)!;
      if (item.outcome.ok) {
        const previous = this.baselines[index]!;
        this.baselines[index] = item.outcome.entity;
        this.candidates[index] = item.outcome.entity;
        this.conflicts.delete(item.key);
        committed.push({
          key: item.key,
          previous,
          current: item.outcome.entity,
        });
      } else {
        const outcome = item.outcome;
        if (outcome.kind === 'validation')
          errors.push(
            ...serverIssues(this.env.options, outcome.issues).map((issue) => ({
              ...issue,
              source: 'server' as const,
              params: { ...issue.params, entityKey: item.key },
            })),
          );
        else if (outcome.kind === 'conflict' && outcome.remote !== undefined)
          conflicts.push({ key: item.key, remote: outcome.remote });
        else if (
          (outcome.kind === 'transport' || outcome.kind === 'unknown') &&
          outcome.certainty !== 'not-committed'
        ) {
          unresolved.push({
            ...records.find((record) => record.entityKey === item.key)!,
            reason: 'transport-unknown',
          });
          uncertain = true;
        } else
          errors.push({
            code: 'entity-save-failed',
            message: 'An entity could not be saved.',
            params: { entityKey: item.key },
          });
      }
    }
    this.revision++;
    this.validation = { status: 'stale' };
    this.issues = errors;
    const complete = result.items.every((item) => item.outcome.ok);
    this.conflict = this.conflicts.values().next().value;
    this.move(complete ? 'committed' : 'editing');
    if (complete) this.overrides.clear();
    for (const conflict of conflicts)
      this.external(conflict.remote, conflict.key);
    if (uncertain) this.cancel('reconciliation-required');
    else this.publish();
    if (complete) this.listeners.clear();
    for (const record of unresolved) this.env.uncertain(record);
    for (const item of committed) {
      this.env.emit('mutation:committed', {
        sessionId: this.id,
        operationId: context.operationId,
        entity: item.current,
      });
      reflections.push({
        key: item.key,
        reflection: await this.env.reflect(
          item.previous,
          item.current,
          this.id,
        ),
      });
    }
    return { status: 'batch', result, reflections };
  }

  external(remote: T | undefined, key: EntityKey): void {
    if (terminal(this.phase) || this.env.destroyed() || this.mode === 'create')
      return;
    const index = this.baselines.findIndex(
      (entity) => this.env.options.identity?.(entity) === key,
    );
    if (index < 0) return;
    const baseline = this.baselines[index]!,
      candidate = this.candidates[index]!;
    const localDirtyFieldIds = changes(
      this.env.options.fields,
      baseline,
      candidate,
    ).changes.map((change) => change.fieldId);
    const common = {
      entityKey: key,
      baseline,
      localCandidate: candidate,
      localDirtyFieldIds,
    };
    if (remote === undefined) this.conflict = { ...common, kind: 'deleted' };
    else {
      const remoteChangedFieldIds = changes(
        this.env.options.fields,
        baseline,
        remote,
      ).changes.map((change) => change.fieldId);
      const conflictingFieldIds = remoteChangedFieldIds.filter((id) => {
        const field = this.env.options.fields.find((field) => field.id === id)!;
        return (
          localDirtyFieldIds.includes(id) &&
          !(field.equals ?? Object.is)(
            field.read(candidate),
            field.read(remote),
          )
        );
      });
      this.conflict = {
        ...common,
        kind: 'updated',
        remote,
        remoteChangedFieldIds,
        conflictingFieldIds,
      };
      if (
        this.env.options.externalChangePolicy === 'rebase-clean' &&
        !conflictingFieldIds.length &&
        this.phase !== 'submitting'
      ) {
        this.resolveConflict({ kind: 'rebase-local' });
        return;
      }
    }
    if (this.phase === 'validating') this.invalidate();
    const detected = this.conflict;
    this.conflicts.set(key, detected);
    this.conflict = this.conflicts.values().next().value;
    this.env.emit('conflict:detected', {
      sessionId: this.id,
      conflict: detected,
    });
    this.publish();
  }

  resolveConflict(decision: ConflictResolution): CommandOutcome {
    const rejected = this.writable();
    if (rejected) return rejected;
    const conflict = this.conflict;
    if (!conflict) return { status: 'unchanged' };
    if (conflict.kind === 'deleted') {
      if (decision.kind !== 'accept-remote')
        return {
          status: 'rejected',
          error: editorError(
            'mutation',
            'remote-entity-deleted',
            'A deleted entity cannot be rebased or merged.',
          ),
        };
      this.conflict = undefined;
      this.cancel('remote-entity-deleted');
      return { status: 'ok' };
    }
    const index = this.baselines.findIndex(
      (entity) => this.env.options.identity?.(entity) === conflict.entityKey,
    );
    let candidate = conflict.remote;
    for (const field of this.env.options.fields) {
      if (
        decision.kind !== 'accept-remote' &&
        conflict.localDirtyFieldIds.includes(field.id) &&
        (decision.kind !== 'merge' || decision.fields[field.id] !== 'remote')
      )
        candidate = field.write(candidate, field.read(conflict.localCandidate));
    }
    this.baselines[index] = conflict.remote;
    this.candidates[index] = candidate;
    for (const field of this.env.options.fields) {
      if (
        !this.candidates.some(
          (entity, i) =>
            !(field.equals ?? Object.is)(
              field.read(entity),
              field.read(this.baselines[i]!),
            ),
        )
      )
        this.overrides.delete(field.id);
    }
    this.conflicts.delete(conflict.entityKey);
    this.conflict = this.conflicts.values().next().value;
    this.invalidate();
    this.clientMutationId = identifier();
    this.env.emit('conflict:resolved', { sessionId: this.id, decision });
    this.publish();
    return { status: 'ok' };
  }

  cancel(reason?: string): void {
    if (terminal(this.phase)) return;
    this.move('cancelled');
    if (this.validationOperation) {
      this.validationOperation.obsolete = 'aborted';
      this.validationOperation.controller.abort();
    }
    this.controller.abort();
    this.activeOperationId = undefined;
    this.validation = { status: 'stale' };
    if (this.pendingRecord) this.env.uncertain(this.pendingRecord);
    for (const record of this.batchRecords) this.env.uncertain(record);
    this.env.emit('session:cancelled', {
      sessionId: this.id,
      ...(reason !== undefined ? { reason } : {}),
    });
    this.publish();
    this.listeners.clear();
  }

  dispose(): void {
    this.cancel('runtime-destroyed');
    this.listeners.clear();
  }
}
