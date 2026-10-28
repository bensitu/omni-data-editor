import { expect, it, vi } from 'vitest';
import { createEditor, textField, numberField } from '../src/index.js';
import { writePath, readPath } from '../src/fields.js';

type Entity = { id: number; name: string; amount: number; version?: number };
const entity: Entity = { id: 1, name: 'Ada', amount: 10, version: 1 };
const fields = [textField<Entity>('name'), numberField<Entity>('amount')];
const identity = (value: Entity) => value.id;

it('refreshes unchanged registered values without interrupting local edits', () => {
  const editor = createEditor({ fields, identity });
  const session = editor.edit(entity);
  session.set('name', 'Grace');
  editor.notifyExternalEntity({ ...entity, version: 2 });
  expect(session.snapshot().conflict).toBeUndefined();
  expect(session.snapshot().draft).toMatchObject({
    candidate: { name: 'Grace', version: 2 },
  });
  expect(session.snapshot()).toBe(session.snapshot());
});

it('returns a superseded result when a server conflict is automatically rebased', async () => {
  const editor = createEditor({
    fields,
    identity,
    externalChangePolicy: 'rebase-clean',
    persistence: {
      update: async () => ({
        ok: false,
        kind: 'conflict',
        remote: { ...entity, amount: 20 },
      }),
    },
  });
  const session = editor.edit(entity);
  session.set('name', 'Grace');
  expect(await session.submit()).toMatchObject({ status: 'superseded' });
  expect(session.snapshot().conflict).toBeUndefined();
});

it('retains unknown-result diagnostics without blocking unrelated entity edits', async () => {
  const cause = new Error('Connection interrupted');
  const log = vi.fn();
  const editor = createEditor({
    fields,
    identity,
    logger: { log },
    persistence: {
      create: async () => {
        throw cause;
      },
    },
  });
  const outcome = await editor.create({ initial: entity }).submit();
  expect(outcome).toMatchObject({ status: 'uncertain', record: { cause } });
  expect(log).toHaveBeenCalledWith(
    'warn',
    'persistence-failed',
    expect.objectContaining({ cause }),
  );
  expect(() => editor.edit({ ...entity, id: 2 })).not.toThrow();
});

it('delivers reentrant edits in order and exposes only the supported session interface', () => {
  const session = createEditor({ fields }).edit(entity);
  const revisions: number[] = [];
  session.subscribe((snapshot) => {
    if (snapshot.revision === 1) session.set('amount', 20);
  });
  session.subscribe((snapshot) => revisions.push(snapshot.revision));
  session.set('name', 'Grace');
  expect(revisions).toEqual([2]);
  expect('candidates' in session).toBe(false);
});

it('allows opening a new session after an accessor fails during initialization', () => {
  let unavailable = true;
  const editor = createEditor({
    fields: [
      {
        ...fields[0]!,
        read: (value: Entity) => {
          if (unavailable) throw new Error('Accessor unavailable');
          return value.name;
        },
      },
    ],
  });
  expect(() => editor.edit(entity)).toThrow(/Accessor/);
  unavailable = false;
  expect(() => editor.edit(entity)).not.toThrow();
});

it('keeps malformed successful responses uncertain instead of committing missing data', async () => {
  const editor = createEditor({
    fields,
    identity,
    persistence: { update: vi.fn().mockResolvedValue({ ok: true }) },
  });
  const session = editor.edit(entity);
  expect(await session.submit()).toMatchObject({
    status: 'uncertain',
    record: { cause: { code: 'invalid-mutation-result' } },
  });
  expect(session.snapshot().draft).toMatchObject({ candidate: entity });
});

it('confirms an authoritative deletion without sending another delete request', async () => {
  const remove = vi.fn().mockResolvedValue({
    ok: false,
    kind: 'transport',
    retryable: true,
    certainty: 'unknown',
  });
  const editor = createEditor({
    fields,
    identity,
    persistence: { remove },
    reconciliation: {
      reconcile: async () => ({ kind: 'absent', authoritative: true }),
    },
  });
  const reflectRemove = vi.fn();
  editor.attach({
    capabilities: { reflection: { reflectRemove } },
    detach() {},
  });
  await editor.remove(entity);
  expect(await editor.remove(entity)).toMatchObject({ status: 'removed' });
  expect(remove).toHaveBeenCalledTimes(1);
  expect(reflectRemove).toHaveBeenCalledWith(entity);
});

it('rejects reconciliation data for a different business identity', async () => {
  const editor = createEditor({
    fields,
    identity,
    persistence: { update: async () => ({ ok: false, kind: 'unknown' }) },
    reconciliation: {
      reconcile: async () => ({
        kind: 'present',
        entity: { ...entity, id: 99 },
      }),
    },
  });
  await editor.edit(entity).submit();
  const next = editor.edit(entity);
  await vi.waitFor(() => expect(next.snapshot().phase).toBe('cancelled'));
  expect(next.snapshot().draft).toMatchObject({ candidate: entity });
});

it('skips hidden field validation and bounds concurrent entity validation', async () => {
  let active = 0,
    maximum = 0;
  const editor = createEditor({
    identity,
    validationConcurrency: 2,
    fields: [
      textField<Entity>('name', { required: true, visibleWhen: () => false }),
    ],
    validators: [
      async () => {
        active++;
        maximum = Math.max(maximum, active);
        await new Promise((resolve) => setTimeout(resolve, 1));
        active--;
        return null;
      },
    ],
  });
  const session = editor.editMany(
    Array.from({ length: 5 }, (_, id) => ({ ...entity, id, name: '' })),
  );
  expect((await session.validate()).valid).toBe(true);
  expect(maximum).toBe(2);
});

it('creates arrays for numeric paths and preserves sparse elements without traversing primitives', () => {
  const nested = writePath<{ items?: { name: string }[] }>(
    {},
    ['items', 2, 'name'],
    'Ada',
  );
  expect(Array.isArray(nested.items)).toBe(true);
  expect(nested.items?.[2]).toEqual({ name: 'Ada' });
  const items = new Array<string>(3);
  const result = writePath({ items }, ['items', 2], 'Ada');
  expect(0 in result.items).toBe(false);
  expect(() => writePath({ name: 'Ada' }, ['name', 'initial'], 'A')).toThrow(
    /plain objects/,
  );
  expect(() => writePath({ items }, ['items', 'length'], 0)).toThrow(/length/);
  expect(readPath({}, ['toString'])).toBeUndefined();
});
