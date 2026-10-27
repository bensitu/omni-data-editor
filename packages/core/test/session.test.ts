import { describe, expect, it, vi } from 'vitest';
import {
  createEditor,
  field,
  textField,
  numberField,
  selectField,
} from '../src/index.js';
import type {
  MutationOutcome,
  UncertainMutationRecord,
  ValidationIssue,
} from '../src/index.js';
import { transition } from '../src/changes.js';

type Employee = { id: number; name: string; salary: number; extra?: string };
const employee: Employee = {
  id: 1,
  name: 'Ada',
  salary: 10,
  extra: 'preserved',
};
const fields = [textField<Employee>('name'), numberField<Employee>('salary')];
const identity = (entity: Employee) => entity.id;
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe('Entity sessions', () => {
  it('preserves deletion identity across reliable retries', async () => {
    const remove = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        kind: 'transport',
        retryable: true,
        certainty: 'not-committed',
      })
      .mockResolvedValueOnce({ ok: true });
    const editor = createEditor({ fields, identity, persistence: { remove } });
    expect((await editor.remove(employee)).status).toBe('failed');
    expect((await editor.remove(employee)).status).toBe('removed');
    expect(remove.mock.calls[0]?.[1].clientMutationId).toBe(
      remove.mock.calls[1]?.[1].clientMutationId,
    );
  });
  it('removes canonical entities and reports uncertain removal during destroy', async () => {
    const mutation = deferred<{ ok: true }>();
    const remove = vi.fn(() => mutation.promise);
    const editor = createEditor({ fields, identity, persistence: { remove } });
    const uncertain = vi.fn();
    editor.on('mutation:uncertain', uncertain);
    const pending = editor.remove(employee);
    expect(remove).toHaveBeenCalledTimes(1);
    const closing = editor.destroy();
    expect(uncertain).toHaveBeenCalledTimes(1);
    expect(await pending).toMatchObject({ status: 'uncertain' });
    await closing;
  });

  it('does not infer deletion from a conflict without remote data', async () => {
    const editor = createEditor<Employee>({
      fields,
      identity,
      persistence: { update: async () => ({ ok: false, kind: 'conflict' }) },
    });
    const session = editor.edit(employee);
    expect(await session.submit()).toMatchObject({ status: 'failed' });
    expect(session.snapshot().conflict).toBeUndefined();
  });

  it('automatically rebases equal concurrent values without a false conflict', () => {
    const editor = createEditor({
      fields,
      identity,
      externalChangePolicy: 'rebase-clean',
    });
    const session = editor.edit(employee);
    session.set('name', 'Grace');
    editor.notifyExternalEntity({ ...employee, name: 'Grace' });
    expect(session.snapshot().conflict).toBeUndefined();
    expect(session.snapshot().dirty).toBe(false);
  });
  it('preserves source entities, orders changes and uses canonical results', async () => {
    const update = vi.fn(async ({ candidate }: { candidate: Employee }) => ({
      ok: true as const,
      entity: { ...candidate, name: 'GRACE' },
    }));
    const editor = createEditor({ fields, persistence: { update } });
    const session = editor.edit(employee);
    session.set('salary', 20);
    session.set('name', 'Grace');
    const snapshot = session.snapshot();
    expect(snapshot.changeSet).toMatchObject({
      changes: [{ fieldId: 'name' }, { fieldId: 'salary' }],
    });
    expect(employee.name).toBe('Ada');
    expect(
      snapshot.draft.mode !== 'multi-edit' && snapshot.draft.candidate.extra,
    ).toBe('preserved');
    expect((await session.validate()).valid).toBe(true);
    expect(session.snapshot().phase).toBe('editing');
    expect(update).not.toHaveBeenCalled();
    expect(await session.submit()).toMatchObject({
      status: 'committed',
      entity: { name: 'GRACE' },
    });
    expect(session.snapshot().dirty).toBe(false);
    expect(session.set('name', 'Late')).toMatchObject({
      status: 'locked',
      reason: 'terminal',
    });
  });

  it('tracks equality, reset and detached snapshot maps', () => {
    const editor = createEditor<Employee>({ fields });
    const session = editor.edit(employee);
    expect(session.set('name', 'Ada').status).toBe('unchanged');
    session.set('name', 'Grace');
    const snapshot = session.snapshot();
    if (snapshot.draft.mode !== 'multi-edit')
      (snapshot.draft.values as Map<string, unknown>).set('name', 'Injected');
    expect(session.reset('name').status).toBe('ok');
    expect(session.snapshot().dirty).toBe(false);
    expect(session.set('unknown', 1).status).toBe('rejected');
    session.cancel();
  });

  it('requires a complete create candidate and identity for correlated operations', async () => {
    const editor = createEditor<Employee>({ fields });
    expect(() => editor.create()).toThrow(/initial/);
    expect(() => editor.editMany([employee])).toThrow(/identity/);
    await expect(editor.remove(employee)).rejects.toThrow(/identity/);
    const session = editor.create({ initial: employee });
    expect(session.snapshot().draft).toMatchObject({
      mode: 'create',
      entity: null,
      candidate: employee,
    });
    session.cancel();
    await editor.destroy();
  });

  it('supersedes submit validation when semantic values change', async () => {
    const validation = deferred<null>();
    const update = vi.fn();
    const editor = createEditor<Employee>({
      fields,
      validators: [() => validation.promise],
      persistence: { update },
    });
    const session = editor.edit(employee);
    const pending = session.submit();
    expect((await session.submit()).status).toBe('busy');
    session.set('name', 'Grace');
    expect(await pending).toMatchObject({ status: 'superseded' });
    validation.resolve(null);
    expect(update).not.toHaveBeenCalled();
    expect(session.snapshot().phase).toBe('editing');
  });

  it('isolates obsolete validation from a newer revision', async () => {
    const old = deferred<ValidationIssue | null>();
    const editor = createEditor<Employee>({
      fields,
      validators: [
        (candidate) => (candidate.name === 'Ada' ? old.promise : null),
      ],
    });
    const session = editor.edit(employee);
    const first = session.validate();
    session.set('name', 'Grace');
    expect((await session.validate()).status).toBe('current');
    old.resolve({ code: 'old-error' });
    expect((await first).status).toBe('stale');
    expect(session.snapshot().issues).toEqual([]);
  });

  it('dispatches once and locks fields while persistence is pending', async () => {
    const mutation = deferred<MutationOutcome<Employee>>();
    const update = vi.fn(() => mutation.promise);
    const session = createEditor({ fields, persistence: { update } }).edit(
      employee,
    );
    const pending = session.submit();
    await vi.waitFor(() => expect(update).toHaveBeenCalledTimes(1));
    expect(await session.submit()).toMatchObject({ status: 'busy' });
    expect(session.reset()).toMatchObject({
      status: 'locked',
      reason: 'submitting',
    });
    expect(session.set('name', 'Late').status).toBe('locked');
    mutation.resolve({ ok: true, entity: employee });
    expect((await pending).status).toBe('committed');
  });

  it('cancels before dispatch without recording an uncertain result', async () => {
    const update = vi.fn();
    const uncertain = vi.fn();
    const editor = createEditor<Employee>({
      fields,
      validators: [() => new Promise(() => undefined)],
      persistence: { update },
    });
    editor.on('mutation:uncertain', uncertain);
    const session = editor.edit(employee),
      pending = session.submit();
    session.cancel();
    expect(await pending).toEqual({
      status: 'cancelled',
      beforeDispatch: true,
    });
    expect(update).not.toHaveBeenCalled();
    expect(uncertain).not.toHaveBeenCalled();
  });

  it('records uncertain updates and requires authoritative data before reopening', async () => {
    const mutation = deferred<MutationOutcome<Employee>>();
    const update = vi.fn(() => mutation.promise);
    const editor = createEditor({ fields, identity, persistence: { update } });
    const uncertain = vi.fn();
    editor.on('mutation:uncertain', uncertain);
    const session = editor.edit(employee),
      pending = session.submit();
    await vi.waitFor(() => expect(update).toHaveBeenCalled());
    session.cancel();
    expect((await pending).status).toBe('uncertain');
    expect(uncertain).toHaveBeenCalledTimes(1);
    expect(() => editor.edit(employee)).toThrow(/Refresh/);
    mutation.resolve({ ok: true, entity: { ...employee, name: 'Canonical' } });
    await vi.waitFor(() => expect(() => editor.edit(employee)).not.toThrow());
    expect(session.snapshot().phase).toBe('cancelled');
  });

  it('reconciles uncertain creates by stable client mutation identity', async () => {
    let record: UncertainMutationRecord | undefined;
    const reconcile = vi.fn(async () => ({
      kind: 'absent' as const,
      authoritative: true as const,
    }));
    const editor = createEditor<Employee>({
      fields,
      reconciliation: { reconcile },
      persistence: {
        create: async () => ({
          ok: false,
          kind: 'transport',
          retryable: true,
          certainty: 'unknown',
        }),
      },
    });
    editor.on('mutation:uncertain', (value) => {
      record = value;
    });
    expect((await editor.create({ initial: employee }).submit()).status).toBe(
      'uncertain',
    );
    const next = editor.create({ initial: employee });
    await vi.waitFor(() => expect(next.snapshot().phase).toBe('editing'));
    expect(reconcile).toHaveBeenCalledWith(
      {
        kind: 'by-client-mutation-id',
        clientMutationId: record?.clientMutationId,
      },
      expect.anything(),
    );
  });

  it('retains uncertainty when reconciliation is unknown', async () => {
    const reconcile = vi.fn(async () => ({ kind: 'unknown' as const }));
    const editor = createEditor({
      fields,
      identity,
      reconciliation: { reconcile },
      persistence: {
        update: async () => ({
          ok: false as const,
          kind: 'transport' as const,
          retryable: true,
          certainty: 'unknown' as const,
        }),
      },
    });
    await editor.edit(employee).submit();
    const first = editor.edit(employee);
    await vi.waitFor(() => expect(first.snapshot().phase).toBe('cancelled'));
    const second = editor.edit(employee);
    await vi.waitFor(() => expect(second.snapshot().phase).toBe('cancelled'));
    expect(reconcile).toHaveBeenCalledTimes(2);
  });

  it('retains a logical mutation identity across reliable retries', async () => {
    const update = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        kind: 'transport',
        retryable: true,
        certainty: 'not-committed',
      })
      .mockResolvedValueOnce({ ok: true, entity: employee });
    const session = createEditor<Employee>({
      fields,
      persistence: { update },
    }).edit(employee);
    expect((await session.submit()).status).toBe('failed');
    expect((await session.submit()).status).toBe('committed');
    expect(update.mock.calls[0]?.[1].clientMutationId).toBe(
      update.mock.calls[1]?.[1].clientMutationId,
    );
    expect(update.mock.calls[0]?.[1].operationId).not.toBe(
      update.mock.calls[1]?.[1].operationId,
    );
  });

  it('maps schema paths exactly and ignores transformed output', async () => {
    const update = vi.fn(async ({ candidate }: { candidate: Employee }) => ({
      ok: true as const,
      entity: candidate,
    }));
    let invalid = true;
    const editor = createEditor({
      fields,
      persistence: { update },
      schema: {
        '~standard': {
          version: 1 as const,
          vendor: 'example',
          validate: () =>
            invalid
              ? {
                  issues: [
                    { message: 'Invalid name', path: [{ key: 'name' }] },
                    { message: 'Global', path: [Symbol('key')] },
                  ],
                }
              : { value: { ...employee, name: 'TRANSFORMED' } },
        },
      },
    });
    const session = editor.edit(employee);
    expect(await session.submit()).toMatchObject({
      status: 'invalid',
      issues: [{ fieldId: 'name' }, { message: 'Global' }],
    });
    expect(session.snapshot().issues[1]?.path).toBeUndefined();
    invalid = false;
    await session.submit();
    expect(update.mock.calls[0]?.[0].candidate.name).toBe('Ada');
  });

  it('normalizes server issues and validates them again on retry', async () => {
    const editor = createEditor<Employee>({
      fields,
      persistence: {
        update: async () => ({
          ok: false,
          kind: 'validation',
          issues: [{ code: 'duplicate', fieldId: 'name' }],
        }),
      },
    });
    const session = editor.edit(employee);
    expect((await session.submit()).status).toBe('invalid');
    expect(session.snapshot().validation).toMatchObject({
      status: 'current',
      report: { revision: 0, valid: false },
    });
    session.set('name', 'Grace');
    expect(session.snapshot().issues).toEqual([]);
  });

  it('rebases local fields and treats deletion as a separate conflict', () => {
    const editor = createEditor({ fields, identity });
    const session = editor.edit(employee);
    session.set('name', 'Grace');
    editor.notifyExternalEntity({ ...employee, salary: 20 });
    expect(session.snapshot().conflict).toMatchObject({
      kind: 'updated',
      conflictingFieldIds: [],
    });
    session.resolveConflict({ kind: 'rebase-local' });
    expect(session.snapshot().draft).toMatchObject({
      candidate: { name: 'Grace', salary: 20 },
    });
    editor.notifyExternalRemoval(1);
    expect(session.resolveConflict({ kind: 'merge', fields: {} }).status).toBe(
      'rejected',
    );
    expect(session.resolveConflict({ kind: 'accept-remote' }).status).toBe(
      'ok',
    );
    expect(session.snapshot().phase).toBe('cancelled');
  });

  it('preserves a canonical commit when reflection fails', async () => {
    const editor = createEditor({
      fields,
      identity,
      persistence: {
        update: async () => ({ ok: true as const, entity: employee }),
      },
    });
    editor.attach({
      capabilities: {
        reflection: {
          reflectUpdate: async () => {
            throw new Error('Host unavailable');
          },
        },
      },
      detach() {},
    });
    const session = editor.edit(employee);
    expect(await session.submit()).toMatchObject({
      status: 'committed',
      reflection: { status: 'failed' },
    });
    expect(session.snapshot().phase).toBe('committed');
  });

  it('destroys immediately and awaits idempotent asynchronous cleanup', async () => {
    const cleanup = deferred<void>(),
      destroy = vi.fn(() => cleanup.promise);
    const editor = createEditor<Employee>({ fields });
    editor.use({ requiredCapabilities: [], mount() {}, destroy });
    const session = editor.edit(employee);
    const first = editor.destroy(),
      second = editor.destroy();
    expect(first).toBe(second);
    expect(() => editor.edit(employee)).toThrow(/destroyed/);
    expect(session.set('name', 'Late')).toMatchObject({
      status: 'locked',
      reason: 'destroyed',
    });
    cleanup.resolve();
    await first;
    expect(destroy).toHaveBeenCalledTimes(1);
  });

  it('rejects unsafe paths and duplicate paths while preserving nested properties', () => {
    for (const name of ['__proto__', 'constructor', 'prototype'])
      expect(() =>
        textField<Employee>('bad', { path: ['nested', name] }),
      ).toThrow(/safe/);
    expect(() => createEditor({ fields: [fields[0]!, fields[0]!] })).toThrow(
      /unique/,
    );
    const nested = field<{ profile: { name: string; role: string } }, string>({
      id: 'name',
      path: ['profile', 'name'],
      renderer: 'text',
      read: (entity) => entity.profile.name,
      write: (entity, value) => ({
        ...entity,
        profile: { ...entity.profile, name: value },
      }),
    });
    const entity = { profile: { name: 'Ada', role: 'Engineer' } };
    const session = createEditor({ fields: [nested] }).edit(entity);
    session.set('name', 'Grace');
    expect(session.snapshot().draft).toMatchObject({
      candidate: { profile: { role: 'Engineer', name: 'Grace' } },
    });
    expect(entity.profile.name).toBe('Ada');
  });

  it('represents mixed values without overwriting untouched fields', () => {
    const editor = createEditor({ fields, identity });
    const session = editor.editMany([
      employee,
      { ...employee, id: 2, name: 'Grace' },
    ]);
    const snapshot = session.snapshot();
    if (snapshot.draft.mode !== 'multi-edit')
      throw new Error('Expected multiple entity draft.');
    expect(snapshot.draft.fields.get('name')).toEqual({
      baseline: { kind: 'mixed' },
      draft: { kind: 'unchanged' },
    });
    session.set('salary', 30);
    expect(session.snapshot().changeSet).toMatchObject({
      entities: [
        { changes: [{ fieldId: 'salary' }] },
        { changes: [{ fieldId: 'salary' }] },
      ],
    });
  });
});

describe('Session transitions', () => {
  it.each([
    ['opening', 'editing'],
    ['opening', 'cancelled'],
    ['editing', 'validating'],
    ['validating', 'editing'],
    ['validating', 'submitting'],
    ['submitting', 'committed'],
    ['submitting', 'editing'],
    ['editing', 'cancelled'],
    ['validating', 'cancelled'],
    ['submitting', 'cancelled'],
  ] as const)('allows %s to %s', (from, to) =>
    expect(transition(from, to)).toBe(to),
  );
  it.each(['committed', 'cancelled'] as const)(
    'rejects writes after %s',
    (from) => expect(() => transition(from, 'editing')).toThrow(/transition/),
  );
});

it('accepts empty optional values and reports required values during validation', async () => {
  type Entity = { amount?: number | null; choice?: number | null };
  const fields = [
    numberField<Entity>('amount'),
    selectField<Entity, number>('choice', {
      required: true,
      options: [{ value: 1, label: 'One' }],
    }),
  ];
  const session = createEditor({ fields }).edit({ amount: 2, choice: 1 });
  expect(session.set('amount', undefined).status).toBe('ok');
  expect(session.set('choice', null).status).toBe('ok');
  expect((await session.validate()).issues).toMatchObject([
    { fieldId: 'choice', code: 'required' },
  ]);
  session.set('choice', 1);
  expect((await session.validate()).valid).toBe(true);
  expect(() => selectField<Entity>('choice', {})).toThrow(/Options/);
});

it('publishes and reflects an authoritative created entity before opening another draft', async () => {
  const canonical = { ...employee, id: 2 };
  const editor = createEditor<Employee>({
    fields,
    identity,
    persistence: { create: async () => ({ ok: false, kind: 'unknown' }) },
    reconciliation: {
      reconcile: async () => ({ kind: 'present', entity: canonical }),
    },
  });
  const committed = vi.fn(),
    reflectCreate = vi.fn();
  editor.on('mutation:committed', committed);
  editor.attach({
    capabilities: { reflection: { reflectCreate } },
    detach() {},
  });
  expect((await editor.create({ initial: employee }).submit()).status).toBe(
    'uncertain',
  );
  const next = editor.create({ initial: { ...employee, name: 'New' } });
  await vi.waitFor(() => expect(next.snapshot().phase).toBe('editing'));
  expect(committed).toHaveBeenCalledWith(
    expect.objectContaining({ entity: canonical }),
  );
  expect(reflectCreate).toHaveBeenCalledWith(canonical);
  expect(next.snapshot().draft).toMatchObject({ candidate: { name: 'New' } });
  await editor.destroy();
});

it('uses a new deletion identity after a definitive refusal', async () => {
  const remove = vi
    .fn()
    .mockResolvedValueOnce({ ok: false, kind: 'forbidden' })
    .mockResolvedValueOnce({ ok: true });
  const editor = createEditor({ fields, identity, persistence: { remove } });
  await editor.remove(employee);
  await editor.remove(employee);
  expect(remove.mock.calls[0]?.[1].clientMutationId).not.toBe(
    remove.mock.calls[1]?.[1].clientMutationId,
  );
});
