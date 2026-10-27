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
import { createRendererRegistry } from '@omnidataeditor/dom';

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
