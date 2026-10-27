import { expect, it, vi } from 'vitest';
import { createEditor, textField, numberField } from '../src/index.js';
import type {
  BatchMutationOutcome,
  MutationContext,
  MultiChangeSet,
} from '../src/index.js';
type Entity = { id: number; name: string; salary: number; extra: string };
const entities: Entity[] = [
  { id: 1, name: 'Ada', salary: 10, extra: 'first' },
  { id: 2, name: 'Grace', salary: 15, extra: 'second' },
];
const fields = [textField<Entity>('name'), numberField<Entity>('salary')];
const identity = (entity: Entity) => entity.id;

it('preserves mixed untouched values and retries only unsuccessful entities', async () => {
  const requests: {
    request: { readonly changes: MultiChangeSet<Entity> };
    context: MutationContext;
  }[] = [];
  const updateMany = vi.fn(
    async (
      request: { readonly changes: MultiChangeSet<Entity> },
      context: MutationContext,
    ): Promise<BatchMutationOutcome<Entity>> => {
      requests.push({ request, context });
      return {
        atomicity: 'non-atomic',
        items: request.changes.entities.map((entity) => ({
          key: entity.key,
          outcome:
            requests.length === 1 && entity.key === 2
              ? {
                  ok: false,
                  kind: 'validation',
                  issues: [{ code: 'salary', fieldId: 'salary' }],
                }
              : { ok: true, entity: { ...entity.candidate, salary: 22 } },
        })),
      };
    },
  );
  const session = createEditor({
    fields,
    identity,
    batchPersistence: { updateMany },
  }).editMany(entities);
  session.set('salary', 20);
  const first = await session.submit();
  expect(first.status).toBe('batch');
  expect(session.snapshot().phase).toBe('editing');
  expect(session.snapshot().changeSet).toMatchObject({
    entities: [{ changes: [] }, { changes: [{ fieldId: 'salary' }] }],
  });
  await session.submit();
  expect(session.snapshot().phase).toBe('committed');
  expect(
    requests[1]?.request.changes.entities.map((entity) => entity.key),
  ).toEqual([2]);
  expect(requests[0]?.context.clientMutationId).toBe(
    requests[1]?.context.clientMutationId,
  );
  expect(
    requests[0]?.request.changes.entities.map((entity) => [
      entity.candidate.name,
      entity.candidate.extra,
    ]),
  ).toEqual([
    ['Ada', 'first'],
    ['Grace', 'second'],
  ]);
});

it('retains conflicts per entity and resolves them without losing other targets', async () => {
  const editor = createEditor({
    fields,
    identity,
    batchPersistence: {
      async updateMany({ changes }) {
        return {
          atomicity: 'non-atomic',
          items: changes.entities.map((entity) => ({
            key: entity.key,
            outcome: {
              ok: false,
              kind: 'conflict',
              remote: { ...entity.original, name: 'Remote' },
            },
          })),
        };
      },
    },
  });
  const session = editor.editMany(entities);
  session.set('salary', 20);
  await session.submit();
  expect(session.snapshot().conflict?.entityKey).toBe(1);
  session.resolveConflict({ kind: 'rebase-local' });
  expect(session.snapshot().conflict?.entityKey).toBe(2);
  session.resolveConflict({ kind: 'accept-remote' });
  expect(session.snapshot().conflict).toBeUndefined();
  const draft = session.snapshot().draft;
  if (draft.mode !== 'multi-edit')
    throw new Error('Expected multiple entity draft.');
  expect(draft.fields.get('salary')?.draft).toEqual({ kind: 'mixed' });
  expect(session.snapshot().changeSet).toMatchObject({
    entities: [{ candidate: { name: 'Remote', salary: 20 } }, { changes: [] }],
  });
  session.reset('salary');
  expect(session.snapshot().dirty).toBe(false);
});

it('treats inconsistent atomic results as uncertain for every dispatched entity', async () => {
  const editor = createEditor({
    fields,
    identity,
    batchPersistence: {
      async updateMany() {
        return {
          atomicity: 'atomic',
          items: [
            { key: 1, outcome: { ok: true, entity: entities[0]! } },
            { key: 2, outcome: { ok: false, kind: 'forbidden' } },
          ],
        };
      },
    },
  });
  const uncertain = vi.fn(),
    failed = vi.fn();
  editor.on('mutation:failed', failed);
  editor.on('mutation:uncertain', uncertain);
  const session = editor.editMany(entities);
  session.set('salary', 20);
  const outcome = await session.submit();
  expect(outcome.status).toBe('batch');
  expect(session.snapshot().phase).toBe('cancelled');
  expect(uncertain).toHaveBeenCalledTimes(2);
  expect(failed).toHaveBeenCalledWith(
    expect.objectContaining({
      error: expect.objectContaining({
        category: 'invariant',
        code: 'invalid-batch-result',
      }),
    }),
  );
  expect(() => editor.edit(entities[0]!)).toThrow(/Refresh/);
});

it('commits all canonical entities before awaiting reflection', async () => {
  let release!: () => void;
  const reflection = new Promise<void>((resolve) => {
    release = resolve;
  });
  const reflectUpdate = vi.fn(() => reflection);
  const editor = createEditor({
    fields,
    identity,
    batchPersistence: {
      async updateMany({ changes }) {
        return {
          atomicity: 'atomic',
          items: changes.entities.map((entity) => ({
            key: entity.key,
            outcome: { ok: true, entity: entity.candidate },
          })),
        };
      },
    },
  });
  editor.attach({
    capabilities: { reflection: { reflectUpdate } },
    detach() {},
  });
  const session = editor.editMany(entities);
  session.set('salary', 20);
  const result = session.submit();
  await vi.waitFor(() => expect(reflectUpdate).toHaveBeenCalledTimes(1));
  expect(session.snapshot().phase).toBe('committed');
  release();
  expect(await result).toMatchObject({
    status: 'batch',
    reflections: [{ key: 1 }, { key: 2 }],
  });
});

it('isolates cancellation and reconciles late successful batch results', async () => {
  let finish!: (outcome: BatchMutationOutcome<Entity>) => void;
  const updateMany = vi.fn(
    () =>
      new Promise<BatchMutationOutcome<Entity>>((resolve) => {
        finish = resolve;
      }),
  );
  const editor = createEditor({
    fields,
    identity,
    batchPersistence: { updateMany },
  });
  const committed = vi.fn();
  editor.on('mutation:committed', committed);
  const session = editor.editMany(entities);
  session.set('salary', 20);
  const result = session.submit();
  await vi.waitFor(() => expect(updateMany).toHaveBeenCalledTimes(1));
  expect((await session.submit()).status).toBe('busy');
  session.cancel();
  expect((await result).status).toBe('batch');
  finish({
    atomicity: 'atomic',
    items: entities.map((entity) => ({
      key: entity.id,
      outcome: { ok: true, entity: { ...entity, salary: 20 } },
    })),
  });
  await vi.waitFor(() => expect(committed).toHaveBeenCalledTimes(2));
  expect(session.snapshot().phase).toBe('cancelled');
  expect(() => editor.edit(entities[0]!)).not.toThrow();
});

it.each(['accept-remote', 'merge'] as const)(
  'displays canonical values after %s resolves every target',
  (kind) => {
    const editor = createEditor({ fields, identity });
    const session = editor.editMany(entities);
    session.set('salary', 20);
    for (const entity of entities) {
      editor.notifyExternalEntity({ ...entity, salary: 30 });
      session.resolveConflict(
        kind === 'merge' ? { kind, fields: { salary: 'remote' } } : { kind },
      );
    }
    const draft = session.snapshot().draft;
    if (draft.mode !== 'multi-edit')
      throw new Error('Expected multiple entity draft.');
    expect(draft.fields.get('salary')).toEqual({
      baseline: { kind: 'uniform', value: 30 },
      draft: { kind: 'unchanged' },
    });
    expect(session.snapshot().dirty).toBe(false);
  },
);
