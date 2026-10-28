import { expect, it, vi } from 'vitest';
import {
  createEditor,
  textField,
  numberField,
  checkboxField,
  radioField,
  selectField,
} from '@omnidataeditor/core';
import { dialog } from '@omnidataeditor/presentation-dialog';
import { createRendererRegistry, formatMessage } from '@omnidataeditor/dom';

it('waits for field teardown after a dialog has already closed', async () => {
  let finish!: () => void;
  const cleanup = new Promise<void>((resolve) => {
    finish = resolve;
  });
  const registry = createRendererRegistry();
  registry.register('@example/delayed', {
    create() {
      const element = document.createElement('input');
      return {
        element,
        setValue() {},
        setDisabled() {},
        setReadOnly() {},
        setVisible() {},
        setIssues() {},
        destroy: () => cleanup,
      };
    },
  });
  const fields = [
    { ...textField<{ name: string }>('name'), renderer: '@example/delayed' },
  ];
  const editor = createEditor({ fields });
  editor.use(dialog({ fields, registry }));
  const session = editor.edit({ name: 'Ada' });
  session.cancel();
  const done = vi.fn(),
    pending = editor.destroy().then(done);
  await Promise.resolve();
  await Promise.resolve();
  expect(done).not.toHaveBeenCalled();
  finish();
  await pending;
  expect(done).toHaveBeenCalledTimes(1);
});

it('keeps disabled, read only and hidden fields distinct and renders native radio choices', async () => {
  type Entity = {
    name: string;
    amount: number;
    active: boolean;
    office: string;
  };
  const fields = [
    textField<Entity>('name', { readOnlyWhen: () => true }),
    numberField<Entity>('amount', { enabledWhen: () => false }),
    checkboxField<Entity>('active', { visibleWhen: () => false }),
    radioField<Entity>('office', {
      readOnlyWhen: () => true,
      options: [
        { value: 'Tokyo', label: 'Tokyo' },
        { value: 'Osaka', label: 'Osaka' },
      ],
    }),
  ];
  const editor = createEditor({ fields });
  editor.use(dialog({ fields }));
  editor.edit({ name: 'Ada', amount: 2, active: true, office: 'Tokyo' });
  expect(
    document.querySelector<HTMLInputElement>('input[type=text]')?.readOnly,
  ).toBe(true);
  expect(
    document.querySelector<HTMLInputElement>('[inputmode=decimal]')?.disabled,
  ).toBe(true);
  expect(
    document
      .querySelector<HTMLInputElement>('input[type=checkbox]')
      ?.closest<HTMLElement>('.omnidataeditor-field')?.hidden,
  ).toBe(true);
  expect(
    document.querySelector<HTMLInputElement>('input[type=radio]')?.checked,
  ).toBe(true);
  const radios =
    document.querySelectorAll<HTMLInputElement>('input[type=radio]');
  radios[1]!.click();
  expect(radios[0]!.checked).toBe(true);
  expect(radios[1]!.checked).toBe(false);
  await editor.destroy();
});

it('preserves incomplete numeric input and displays server field issues', async () => {
  type Entity = { name: string; amount: number };
  const fields = [textField<Entity>('name'), numberField<Entity>('amount')];
  const update = vi.fn(async () => ({
    ok: false as const,
    kind: 'validation' as const,
    issues: [
      { code: 'duplicate', fieldId: 'name', message: 'Name already exists.' },
    ],
  }));
  const editor = createEditor({ fields, persistence: { update } });
  editor.use(dialog({ fields }));
  const session = editor.edit({ name: 'Ada', amount: 2 });
  const amount = document.querySelector<HTMLInputElement>(
    '[inputmode=decimal]',
  )!;
  amount.value = '-';
  amount.dispatchEvent(new Event('input', { bubbles: true }));
  session.set('name', 'Grace');
  expect(amount.value).toBe('-');
  document.querySelector<HTMLFormElement>('form')!.requestSubmit();
  expect(update).not.toHaveBeenCalled();
  amount.value = '4';
  amount.dispatchEvent(new Event('input', { bubbles: true }));
  document.querySelector<HTMLFormElement>('form')!.requestSubmit();
  await vi.waitFor(() =>
    expect(document.querySelector('.omnidataeditor-issues')?.textContent).toBe(
      'Name already exists.',
    ),
  );
  await editor.destroy();
});

it('persists cleared optional controls as empty semantic values', async () => {
  type Entity = { amount?: number; choice?: number };
  const fields = [
    numberField<Entity>('amount'),
    selectField<Entity, number>('choice', {
      options: [{ value: 1, label: 'One' }],
    }),
  ];
  const update = vi.fn(async ({ candidate }: { candidate: Entity }) => ({
    ok: true as const,
    entity: candidate,
  }));
  const editor = createEditor({ fields, persistence: { update } });
  editor.use(dialog({ fields }));
  const session = editor.edit({ amount: 2, choice: 1 });
  for (const control of document.querySelectorAll<
    HTMLInputElement | HTMLSelectElement
  >('[inputmode=decimal], select')) {
    control.value = '';
    control.dispatchEvent(new Event('input', { bubbles: true }));
  }
  document.querySelector<HTMLFormElement>('form')!.requestSubmit();
  await vi.waitFor(() => expect(session.snapshot().phase).toBe('committed'));
  expect(update.mock.calls[0]?.[0].candidate).toEqual({
    amount: undefined,
    choice: undefined,
  });
  await editor.destroy();
});

it('rejects unregistered presentation fields and releases a failed dialog mount', async () => {
  const fields = [textField<{ name: string }>('name')];
  const editor = createEditor({ fields });
  const dispose = editor.use(dialog({ fields: [textField('missing')] }));
  expect(() => editor.edit({ name: 'Ada' })).toThrow(/missing/);
  expect(document.querySelector('dialog')).toBeNull();
  await dispose();
  editor.use(dialog({ fields }));
  expect(() => editor.edit({ name: 'Ada' })).not.toThrow();
  await editor.destroy();
});

it('preserves numeric input spelling while applying semantic values', async () => {
  const fields = [numberField<{ amount: number }>('amount')];
  const editor = createEditor({ fields });
  editor.use(dialog({ fields }));
  const session = editor.edit({ amount: 10 });
  const input = document.querySelector<HTMLInputElement>(
    '[inputmode=decimal]',
  )!;
  for (const raw of ['-', '-0', '-0.', '-0.5']) {
    input.value = raw;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    expect(input.value).toBe(raw);
  }
  expect(session.snapshot().draft).toMatchObject({
    candidate: { amount: -0.5 },
  });
  input.value = 'invalid';
  input.dispatchEvent(new Event('input', { bubbles: true }));
  session.set('amount', 20);
  expect(input.checkValidity()).toBe(true);
  expect(input.getAttribute('aria-invalid')).toBe('false');
  await editor.destroy();
});

it('retains an unknown-result draft and lets the user dismiss the dialog', async () => {
  const fields = [textField<{ name: string }>('name')];
  const editor = createEditor({
    fields,
    persistence: {
      update: async () => {
        throw new Error('Connection interrupted');
      },
    },
  });
  editor.use(dialog({ fields }));
  const session = editor.edit({ name: 'Ada' });
  session.set('name', 'Grace');
  document.querySelector<HTMLFormElement>('form')!.requestSubmit();
  await vi.waitFor(() =>
    expect(session.snapshot().uncertainties?.length).toBe(1),
  );
  expect(document.querySelector<HTMLDialogElement>('dialog')?.open).toBe(true);
  expect(document.querySelector<HTMLInputElement>('dialog input')?.value).toBe(
    'Grace',
  );
  expect(
    document.querySelector('.omnidataeditor-summary')?.textContent,
  ).toContain('unknown');
  const close = [
    ...document.querySelectorAll<HTMLButtonElement>('dialog button'),
  ].find((button) => button.textContent === 'Close')!;
  close.click();
  expect(document.querySelector('dialog')).toBeNull();
  await editor.destroy();
});

it('renders resolvable conflicts under silent notification policy and preserves focused actions', async () => {
  const fields = [textField<{ id: number; name: string }>('name')];
  const editor = createEditor({
    fields,
    identity: (entity: { id: number }) => entity.id,
    externalChangePolicy: 'silent',
  });
  editor.use(dialog({ fields }));
  const session = editor.edit({ id: 1, name: 'Ada' });
  session.set('name', 'Grace');
  editor.notifyExternalEntity({ id: 1, name: 'Remote' });
  const action = document.querySelector<HTMLButtonElement>(
    '.omnidataeditor-conflict button',
  )!;
  expect(action).not.toBeNull();
  action.focus();
  await session.validate();
  expect(document.activeElement).toBe(action);
  action.click();
  expect(session.snapshot().conflict).toBeUndefined();
  await editor.destroy();
});

it('interpolates issue parameters and treats prototype names as ordinary message keys', async () => {
  expect(formatMessage({ key: 'constructor' }, {})).toBe('constructor');
  const fields = [
    textField<{ a: string; b: string }>('a'),
    textField<{ a: string; b: string }>('b'),
  ];
  const editor = createEditor({
    fields,
    validators: [
      () =>
        fields.map((field) => ({
          fieldId: field.id,
          code: 'short',
          params: { count: 3 },
        })),
    ],
  });
  editor.use(
    dialog({ fields, messages: { short: 'Enter {count} characters.' } }),
  );
  const session = editor.edit({ a: '', b: '' });
  await session.validate();
  expect(document.querySelector('.omnidataeditor-summary')?.textContent).toBe(
    'Enter 3 characters.',
  );
  expect(document.querySelector('.omnidataeditor-issues')?.textContent).toBe(
    'Enter 3 characters.',
  );
  document.querySelector<HTMLDialogElement>('dialog')!.close();
  await vi.waitFor(() => expect(session.snapshot().phase).toBe('cancelled'));
  await editor.destroy();
});
