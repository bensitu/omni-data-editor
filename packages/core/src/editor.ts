import type {
  EditorOptions,
  EditorRuntime,
  EditorEventMap,
  EntityKey,
  UncertainMutationRecord,
  ReflectionStatus,
  HostConnection,
  Presentation,
  PresentationContext,
  Disposer,
  RemoveOutcome,
  MutationContext,
  RemoveMutationOutcome,
  ReconciliationResult,
} from './types.js';
import { Session } from './session.js';
import { aborted, identifier, terminal } from './changes.js';
import { configurationError, destroyedError, editorError } from './errors.js';
import { safePath } from './fields.js';

interface Reflection<T> {
  reflectMany?(
    updates: readonly { readonly previous: T; readonly current: T }[],
  ): Promise<void>;
  reflectCreate(entity: T): Promise<void>;
  reflectUpdate(previous: T, current: T): Promise<void>;
  reflectRemove(entity: T): Promise<void>;
}

/** Create a headless editing runtime with one active session and explicit persistence. */
export function createEditor<T>(options: EditorOptions<T>): EditorRuntime<T> {
  if (
    options.validationConcurrency !== undefined &&
    (!Number.isSafeInteger(options.validationConcurrency) ||
      options.validationConcurrency < 1)
  )
    throw configurationError(
      'Validation concurrency must be a positive integer.',
    );
  const fieldIds = new Set<string>(),
    paths = new Set<string>();
  for (const field of options.fields) {
    safePath(field.path);
    const path = JSON.stringify(field.path);
    if (!field.id || fieldIds.has(field.id) || paths.has(path))
      throw configurationError('Field identifiers and paths must be unique.');
    fieldIds.add(field.id);
    paths.add(path);
  }
  let destroyed = false;
  let destruction: Promise<void> | undefined;
  let session: Session<T> | undefined;
  let host: HostConnection<T> | undefined;
  let presentation: Presentation<T> | undefined;
  let removing: string | undefined;
  const controllers = new Set<AbortController>();
  const removeRecords = new Map<string, UncertainMutationRecord>();
  const removeIdentities = new Map<EntityKey, string>();
  const disposers = new Set<Disposer>();
  const pendingDisposals = new Set<Promise<void>>();
  const mounts = new Map<Presentation<T>, Set<Promise<void>>>();
  const events = new Map<
    keyof EditorEventMap<T>,
    Set<(payload: never) => void>
  >();
  const uncertainties = new Map<string, UncertainMutationRecord>();
  const assertAlive = () => {
    if (destroyed) throw destroyedError();
  };
  const identity = (entity: T): EntityKey => {
    if (!options.identity)
      throw configurationError(
        'This operation requires stable entity identity.',
      );
    const key = options.identity(entity);
    if (
      (typeof key !== 'string' && typeof key !== 'number') ||
      (typeof key === 'number' && !Number.isFinite(key))
    )
      throw configurationError(
        'Entity identity must be a string or finite number.',
      );
    return key;
  };
  const log = (code: string, cause?: unknown) => {
    try {
      options.logger?.log('warn', code, { cause });
    } catch {
      /* Logging must not change command results. */
    }
  };
  const emit = <K extends keyof EditorEventMap<T>>(
    event: K,
    payload: EditorEventMap<T>[K],
  ) => {
    for (const listener of [...(events.get(event) ?? [])]) {
      try {
        listener(payload as never);
      } catch (cause) {
        log('observer-failed', cause);
      }
    }
  };
  const uncertaintyKey = (record: UncertainMutationRecord) =>
    `${record.operationId}:${typeof record.entityKey}:${record.entityKey ?? ''}`;
  const uncertain = (record: UncertainMutationRecord) => {
    const key = uncertaintyKey(record);
    if (uncertainties.has(key)) return;
    uncertainties.set(key, record);
    emit('mutation:uncertain', record);
  };
  const clear = (record: UncertainMutationRecord) => {
    for (const [key, value] of uncertainties)
      if (
        value.clientMutationId === record.clientMutationId &&
        value.entityKey === record.entityKey
      )
        uncertainties.delete(key);
  };
  const reflect = async (
    previous: T | null,
    current: T,
    sessionId: string,
    remove = false,
  ): Promise<ReflectionStatus> => {
    const reflection = (
      host?.capabilities as { reflection?: Reflection<T> } | undefined
    )?.reflection;
    if (!reflection || destroyed) return { status: 'skipped' };
    try {
      if (remove) await reflection.reflectRemove(current);
      else if (previous === null) await reflection.reflectCreate(current);
      else await reflection.reflectUpdate(previous, current);
      return { status: 'applied' };
    } catch (cause) {
      const error = editorError(
        'host',
        'reflection-failed',
        'The saved data could not be displayed by the host.',
        cause,
      );
      emit('host:reflection-failed', { sessionId, error });
      return { status: 'failed', error };
    }
  };
  const once = (dispose: Disposer): Disposer => {
    let promise: Promise<void> | undefined;
    const wrapped = () => {
      if (promise) return promise;
      disposers.delete(wrapped);
      let complete!: () => void, fail!: (cause: unknown) => void;
      promise = new Promise<void>((resolve, reject) => {
        complete = resolve;
        fail = reject;
      });
      pendingDisposals.add(promise);
      const tracked = promise;
      promise.then(
        () => pendingDisposals.delete(tracked),
        () => pendingDisposals.delete(tracked),
      );
      try {
        Promise.resolve(dispose()).then(complete, fail);
      } catch (cause) {
        fail(cause);
      }
      return promise;
    };
    disposers.add(wrapped);
    return wrapped;
  };
  const context = (current: Session<T>): PresentationContext<T> => ({
    signal: current.controller.signal,
    getSnapshot: () => current.snapshot(),
    subscribe: (listener) => current.subscribe(listener),
    capabilities: host?.capabilities ?? {},
    validate: () => current.validate(),
    submit: () => current.submit(),
    dispatch: (command) => {
      switch (command.type) {
        case 'set':
          return current.set(command.fieldId, command.value);
        case 'reset':
          return current.reset(command.fieldId);
        case 'resolve-conflict':
          return current.resolveConflict(command.decision);
        case 'cancel':
          current.cancel(command.reason);
          return { status: 'ok' };
      }
    },
  });
  const checkCapabilities = () => {
    for (const required of presentation?.requiredCapabilities ?? []) {
      if (!(
        host?.capabilities &&
        required in host.capabilities &&
        (host.capabilities as Record<string, unknown>)[required]
      ))
        throw editorError(
          'capability',
          'missing-capability',
          `Required capability unavailable: ${required}.`,
        );
    }
  };
  const mount = (current: Session<T>) => {
    if (
      !presentation ||
      destroyed ||
      terminal(current.phase) ||
      current.phase === 'opening'
    )
      return;
    const plugin = presentation;
    try {
      const result = plugin.mount(context(current));
      if (result === undefined) return;
      const pending = Promise.resolve(result).catch((cause) => {
        current.cancel('presentation-failed');
        log('presentation-failed', cause);
      });
      const operations = mounts.get(plugin) ?? new Set();
      mounts.set(plugin, operations);
      operations.add(pending);
      void pending.then(() => {
        operations.delete(pending);
      });
    } catch (cause) {
      current.cancel('presentation-failed');
      throw cause;
    }
  };
  const pendingFor = (entities: readonly T[], mode: string) =>
    [...uncertainties.values()].filter(
      (record) =>
        (record.entityKey === undefined &&
          (record.kind === 'create' ? mode === 'create' : mode !== 'create')) ||
        (mode !== 'create' &&
          entities.some((entity) => identity(entity) === record.entityKey)),
    );
  const reconcile = async (
    records: readonly UncertainMutationRecord[],
    entities: readonly T[],
    signal: AbortSignal,
    removal = false,
  ): Promise<T[]> => {
    const canonical = [...entities];
    for (const record of records) {
      const result: ReconciliationResult<T> = await aborted(
        options.reconciliation!.reconcile(
          record.entityKey === undefined
            ? {
                kind: 'by-client-mutation-id',
                clientMutationId: record.clientMutationId,
              }
            : {
                kind: 'by-key',
                entityKey: record.entityKey,
                operationId: record.operationId,
              },
          { signal },
        ),
        signal,
      );
      if (destroyed) throw destroyedError();
      if (signal.aborted)
        throw editorError(
          'reconciliation',
          'operation-cancelled',
          'The operation was cancelled.',
        );
      if (
        !result ||
        !['present', 'absent'].includes(result.kind) ||
        (result.kind === 'absent' && result.authoritative !== true) ||
        (result.kind === 'present' &&
          (result.entity == null ||
            (record.entityKey !== undefined &&
              identity(result.entity) !== record.entityKey)))
      )
        throw editorError(
          'reconciliation',
          'reconciliation-required',
          'An authoritative mutation result is required.',
        );
      clear(record);
      if (record.kind === 'create' && result.kind === 'present') {
        emit('mutation:committed', {
          sessionId: record.sessionId,
          operationId: record.operationId,
          entity: result.entity,
        });
        await reflect(null, result.entity, record.sessionId);
      }
      if (record.entityKey !== undefined) {
        const index = canonical.findIndex(
          (entity) => identity(entity) === record.entityKey,
        );
        if (index >= 0) {
          if (result.kind === 'absent' && removal) {
            canonical.splice(index, 1);
            continue;
          }
          if (result.kind !== 'present')
            throw editorError(
              'reconciliation',
              'entity-absent',
              'The entity no longer exists.',
            );
          canonical[index] = result.entity;
        }
      }
    }
    return canonical;
  };
  const open = (
    mode: 'create' | 'edit' | 'multi-edit',
    entities: readonly T[],
  ) => {
    assertAlive();
    if (removing || (session && !terminal(session.phase)))
      throw editorError(
        'mutation',
        'operation-busy',
        'Only one active operation is allowed per editor.',
      );
    if (mode === 'multi-edit' || (host && mode !== 'create'))
      entities.forEach(identity);
    if (host?.resolveEntity && mode !== 'create') {
      for (const entity of entities) {
        const resolved = host.resolveEntity(entity);
        if (resolved && resolved.key !== identity(entity))
          throw configurationError(
            'Host and editor identity functions must return the same business key.',
          );
      }
    }
    checkCapabilities();
    const records = pendingFor(entities, mode);
    if (records.length && !options.reconciliation)
      throw editorError(
        'reconciliation',
        'reconciliation-required',
        'Refresh canonical data before editing this entity.',
      );
    const current = new Session(mode, entities, {
      options,
      destroyed: () => destroyed,
      emit,
      uncertain,
      confirmed: clear,
      canonical(entity, record, previous) {
        if (destroyed || !uncertainties.has(uncertaintyKey(record))) return;
        clear(record);
        emit('mutation:committed', {
          sessionId: record.sessionId,
          operationId: record.operationId,
          entity,
        });
        void reflect(previous, entity, record.sessionId);
      },
      reflect,
      async reflectMany(updates, sessionId) {
        const reflection = (
          host?.capabilities as { reflection?: Reflection<T> } | undefined
        )?.reflection;
        if (!updates.length) return [];
        if (!reflection?.reflectMany || destroyed) {
          const results = [];
          for (const update of updates)
            results.push({
              key: update.key,
              reflection: await reflect(
                update.previous,
                update.current,
                sessionId,
              ),
            });
          return results;
        }
        let status: ReflectionStatus;
        try {
          await reflection.reflectMany(updates);
          status = { status: 'applied' };
        } catch (cause) {
          const error = editorError(
            'host',
            'reflection-failed',
            'The saved data could not be displayed by the host.',
            cause,
          );
          emit('host:reflection-failed', { sessionId, error });
          status = { status: 'failed', error };
        }
        return updates.map((update) => ({
          key: update.key,
          reflection: status,
        }));
      },
    });
    session = current;
    emit('session:opened', { sessionId: current.id, mode });
    if (records.length) {
      void reconcile(records, entities, current.controller.signal).then(
        (canonical) => {
          try {
            current.ready(canonical);
            if (!terminal(current.phase)) mount(current);
          } catch (cause) {
            current.cancel('presentation-failed');
            log('presentation-failed', cause);
          }
        },
        (cause) => {
          current.cancel('reconciliation-required');
          log('reconciliation-required', cause);
        },
      );
    } else {
      try {
        current.ready();
        mount(current);
      } catch (cause) {
        current.cancel('session-unavailable');
        throw cause;
      }
    }
    return Object.freeze({
      id: current.id,
      snapshot: () => current.snapshot(),
      set: current.set.bind(current),
      reset: current.reset.bind(current),
      validate: current.validate.bind(current),
      submit: current.submit.bind(current),
      resolveConflict: current.resolveConflict.bind(current),
      cancel: current.cancel.bind(current),
      subscribe: current.subscribe.bind(current),
    });
  };
  const runtime: EditorRuntime<T> = {
    edit(entity) {
      return open('edit', [entity]);
    },
    create(initial) {
      assertAlive();
      const entity = initial?.initial ?? options.createInitial?.();
      if (entity === undefined || entity === null)
        throw configurationError(
          'Create requires a complete initial entity or createInitial factory.',
        );
      return open('create', [entity]);
    },
    editMany(entities) {
      assertAlive();
      if (!entities.length)
        throw configurationError(
          'Multiple entity editing requires at least one entity.',
        );
      const keys = entities.map(identity);
      if (new Set(keys).size !== keys.length)
        throw configurationError(
          'Multiple entity editing requires unique keys.',
        );
      return open('multi-edit', entities);
    },
    async remove(entity): Promise<RemoveOutcome> {
      let entityKey: EntityKey;
      try {
        assertAlive();
        entityKey = identity(entity);
      } catch (cause) {
        return {
          status: 'failed',
          error:
            cause instanceof Error && 'category' in cause
              ? (cause as import('./types.js').EditorError)
              : configurationError('Remove requires a valid entity identity.'),
        };
      }
      if (!options.persistence?.remove)
        return {
          status: 'failed',
          error: configurationError('Remove persistence is required.'),
        };
      if (removing || (session && !terminal(session.phase)))
        return {
          status: 'failed',
          error: editorError(
            'mutation',
            'operation-busy',
            'An editing operation is already active.',
          ),
        };
      const operationId = identifier(),
        sessionId = identifier(),
        clientMutationId = removeIdentities.get(entityKey) ?? identifier();
      removeIdentities.set(entityKey, clientMutationId);
      removing = operationId;
      const controller = new AbortController();
      controllers.add(controller);
      const record: UncertainMutationRecord = {
        entityKey,
        operationId,
        sessionId,
        clientMutationId,
        kind: 'remove',
        reason: 'aborted-after-dispatch',
      };
      try {
        const records = pendingFor([entity], 'remove');
        if (records.length) {
          if (!options.reconciliation)
            return {
              status: 'failed',
              error: editorError(
                'reconciliation',
                'reconciliation-required',
                'Refresh canonical data before removing this entity.',
              ),
            };
          const canonical = await reconcile(
            records,
            [entity],
            controller.signal,
            true,
          );
          if (!canonical.length) {
            removeIdentities.delete(entityKey);
            const confirmed = records.find(
              (record) => record.entityKey === entityKey,
            )!;
            emit('mutation:removed', {
              sessionId: confirmed.sessionId,
              operationId: confirmed.operationId,
              entityKey,
            });
            return {
              status: 'removed',
              reflection: await reflect(
                null,
                entity,
                confirmed.sessionId,
                true,
              ),
            };
          }
          entity = canonical[0]!;
        }
        const ctx: MutationContext = {
          signal: controller.signal,
          operationId,
          sessionId,
          clientMutationId,
        };
        removeRecords.set(operationId, record);
        emit('mutation:started', ctx);
        let result: RemoveMutationOutcome;
        try {
          const request = Promise.resolve(
            options.persistence.remove({ entity }, ctx),
          ).then((outcome) => {
            if (
              !outcome ||
              typeof outcome.ok !== 'boolean' ||
              (!outcome.ok &&
                (!['conflict', 'forbidden', 'transport'].includes(
                  outcome.kind,
                ) ||
                  (outcome.kind === 'transport' &&
                    !['unknown', 'not-committed'].includes(outcome.certainty))))
            )
              throw editorError(
                'invariant',
                'invalid-mutation-result',
                'Persistence must return a structured deletion result.',
              );
            return outcome;
          });
          request.then(
            (outcome) => {
              if (!controller.signal.aborted || destroyed) return;
              if (outcome.ok) {
                clear(record);
                removeIdentities.delete(entityKey);
                emit('mutation:removed', { sessionId, operationId, entityKey });
              } else if (
                outcome.kind !== 'transport' ||
                outcome.certainty === 'not-committed'
              )
                clear(record);
            },
            () => undefined,
          );
          result = await aborted(request, controller.signal);
        } catch (cause) {
          log('persistence-failed', cause);
          result = {
            error: cause,
            ok: false,
            kind: 'transport',
            retryable: true,
            certainty: 'unknown',
          };
        }
        if (result.ok) {
          removeIdentities.delete(entityKey);
          clear(record);
          emit('mutation:removed', { sessionId, operationId, entityKey });
          return {
            status: 'removed',
            reflection: await reflect(null, entity, sessionId, true),
          };
        }
        if (result.kind === 'conflict' || result.kind === 'forbidden')
          removeIdentities.delete(entityKey);
        if (result.kind === 'conflict')
          return { status: 'conflict', entityKey };
        if (result.kind === 'transport' && result.certainty === 'unknown') {
          const unknown = {
            ...record,
            ...('error' in result ? { cause: result.error } : {}),
          };
          uncertain(unknown);
          return { status: 'uncertain', record: unknown };
        }
        return {
          status: 'failed',
          error: editorError(
            'mutation',
            'remove-failed',
            'The entity could not be removed.',
          ),
        };
      } catch (cause) {
        return {
          status: 'failed',
          error: editorError(
            'reconciliation',
            'reconciliation-required',
            'Canonical data could not be resolved.',
            cause,
          ),
        };
      } finally {
        removeRecords.delete(operationId);
        removing = undefined;
        controllers.delete(controller);
      }
    },
    attach(connection) {
      assertAlive();
      if (!options.identity)
        throw configurationError(
          'Host attachment requires stable entity identity.',
        );
      if (host || (session && !terminal(session.phase)))
        throw configurationError('Attach a host before opening a session.');
      host = connection;
      return once(() => {
        if (host === connection) {
          session?.cancel('host-detached');
          host = undefined;
        }
        return connection.detach();
      });
    },
    use(plugin) {
      assertAlive();
      if (presentation)
        throw configurationError('Only one presentation can be registered.');
      presentation = plugin;
      try {
        if (session && !terminal(session.phase)) {
          checkCapabilities();
          mount(session);
        }
      } catch (cause) {
        presentation = undefined;
        throw cause;
      }
      return once(() => {
        if (presentation === plugin) presentation = undefined;
        const pending = [...(mounts.get(plugin) ?? [])];
        let initial: Promise<void>;
        try {
          initial = Promise.resolve(plugin.destroy());
        } catch (cause) {
          initial = Promise.reject(cause);
        }
        return Promise.allSettled([initial, ...pending]).then(
          async (results) => {
            if (pending.length) await plugin.destroy();
            mounts.delete(plugin);
            const errors = results
              .filter((result) => result.status === 'rejected')
              .map((result) => result.reason);
            if (errors.length)
              throw new AggregateError(errors, 'Presentation cleanup failed.');
          },
        );
      });
    },
    on(event, listener) {
      assertAlive();
      const listeners = events.get(event) ?? new Set();
      events.set(event, listeners);
      listeners.add(listener as (payload: never) => void);
      return () => {
        listeners.delete(listener as (payload: never) => void);
      };
    },
    notifyExternalEntity(entity) {
      assertAlive();
      const key = identity(entity);
      for (const record of uncertainties.values())
        if (record.entityKey === key) clear(record);
      session?.external(entity, key);
    },
    notifyExternalRemoval(key) {
      assertAlive();
      removeIdentities.delete(key);
      for (const record of uncertainties.values())
        if (record.entityKey === key) clear(record);
      session?.external(undefined, key);
    },
    destroy() {
      if (destruction) return destruction;
      let complete!: () => void, fail!: (cause: unknown) => void;
      destruction = new Promise<void>((resolve, reject) => {
        complete = resolve;
        fail = reject;
      });
      destroyed = true;
      session?.dispose();
      for (const record of removeRecords.values()) uncertain(record);
      for (const controller of controllers) controller.abort();
      const tasks = [...disposers].map((dispose) => {
        try {
          return Promise.resolve(dispose());
        } catch (cause) {
          return Promise.reject(cause);
        }
      });
      void Promise.allSettled([
        ...new Set([...tasks, ...pendingDisposals]),
      ]).then((results) => {
        emit('runtime:destroyed', { completion: 'done' });
        events.clear();
        const errors = results
          .filter((result) => result.status === 'rejected')
          .map((result) => result.reason);
        if (errors.length)
          fail(new AggregateError(errors, 'Editor cleanup failed.'));
        else complete();
      }, fail);
      return destruction;
    },
  };
  return runtime;
}
