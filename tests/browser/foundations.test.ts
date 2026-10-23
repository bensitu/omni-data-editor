import { expect, it } from 'vitest';
import { createEditor, textField } from '@omnidataeditor/core';
import { createRendererRegistry, numberCodec } from '@omnidataeditor/dom';
import { dialog } from '@omnidataeditor/presentation-dialog';

it('opens a native dialog with safe text, semantic input and focus restoration', async () => {
  const trigger = document.createElement('button');
  document.body.append(trigger);
  trigger.focus();
  const fields = [
    textField<{ id: number; name: string }>('name', { label: 'Name' }),
  ];
  const editor = createEditor({ fields });
  editor.use(dialog({ fields }));
  const session = editor.edit({ id: 1, name: '<img src=x onerror=alert(1)>' });
  expect(document.querySelector('dialog')?.open).toBe(true);
  expect(document.querySelector('dialog img')).toBeNull();
  const input = document.querySelector<HTMLInputElement>('dialog input')!;
  input.value = 'Grace';
  input.dispatchEvent(new Event('input', { bubbles: true }));
  expect(session.snapshot().draft).toMatchObject({
    candidate: { name: 'Grace' },
  });
  session.cancel();
  await Promise.resolve();
  await Promise.resolve();
  expect(document.querySelector('dialog')).toBeNull();
  expect(document.activeElement).toBe(trigger);
  await editor.destroy();
  trigger.remove();
});

it('reserves native renderer keys and keeps incomplete numbers out of entity values', () => {
  const registry = createRendererRegistry();
  const factory = {
    create() {
      throw new Error('Not invoked.');
    },
  };
  expect(() => registry.register('text', factory)).toThrow(/scoped/);
  registry.register('@example/currency', factory);
  expect(() => registry.register('@example/currency', factory)).toThrow(
    /registered/,
  );
  expect(numberCodec.parse('-')).toMatchObject({
    ok: false,
    kind: 'incomplete',
  });
  expect(numberCodec.parse('12.5')).toEqual({ ok: true, value: 12.5 });
});
