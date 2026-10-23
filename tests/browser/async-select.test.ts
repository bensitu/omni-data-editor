import { expect, it, vi } from 'vitest';
import { createEditor } from '@omnidataeditor/core';
import { createRendererRegistry } from '@omnidataeditor/dom';
import { dialog } from '@omnidataeditor/presentation-dialog';
import {
  asyncSelectField,
  asyncSelectRendererKey,
  createAsyncSelectRenderer,
} from '@omnidataeditor/field-async-select';
import type {
  AsyncSelectOption,
  AsyncSelectOptions,
} from '@omnidataeditor/field-async-select';
type Entity = { office: string };
const isValue = (value: unknown): value is string => typeof value === 'string';
function setup(load: AsyncSelectOptions<string>['load'], debounceMs = 0) {
  const registry = createRendererRegistry();
  registry.register(
    asyncSelectRendererKey,
    createAsyncSelectRenderer({
      isValue,
      getKey: (value) => value,
      load,
      debounceMs,
    }),
  );
  const fields = [asyncSelectField<Entity>('office', { label: 'Office' })];
  const editor = createEditor({ fields });
  editor.use(dialog({ fields, registry }));
  const session = editor.edit({ office: 'Tokyo' });
  const input = document.querySelector<HTMLInputElement>('[role=combobox]')!;
  return {
    editor,
    session,
    input,
    search(query: string) {
      input.value = query;
      input.dispatchEvent(new Event('input', { bubbles: true }));
    },
  };
}
it('rejects stale query results and commits the keyboard selected semantic value', async () => {
  let first!: (options: readonly AsyncSelectOption<string>[]) => void;
  const load = vi
    .fn<AsyncSelectOptions<string>['load']>()
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          first = resolve;
        }),
    )
    .mockResolvedValueOnce([{ value: 'osaka', label: 'Osaka office' }]);
  const test = setup(load);
  test.search('old');
  await vi.waitFor(() => expect(load).toHaveBeenCalledTimes(1));
  const signal = load.mock.calls[0]![1].signal;
  test.search('new');
  await vi.waitFor(() =>
    expect(document.querySelector('[role=option]')?.textContent).toBe(
      'Osaka office',
    ),
  );
  expect(signal.aborted).toBe(true);
  first([{ value: 'old', label: 'Old option' }]);
  await Promise.resolve();
  expect(document.querySelector('[role=option]')?.textContent).toBe(
    'Osaka office',
  );
  test.input.dispatchEvent(
    new KeyboardEvent('keydown', {
      key: 'Enter',
      bubbles: true,
      cancelable: true,
    }),
  );
  expect(test.session.snapshot().draft).toMatchObject({
    candidate: { office: 'osaka' },
  });
  expect(test.input.value).toBe('Osaka office');
  await test.editor.destroy();
});
it('debounces queries and distinguishes loading, empty and error states', async () => {
  const load = vi
    .fn<AsyncSelectOptions<string>['load']>()
    .mockResolvedValueOnce([])
    .mockRejectedValueOnce(new Error('Private server details'));
  const test = setup(load, 30);
  test.search('a');
  test.search('ab');
  expect(load).not.toHaveBeenCalled();
  await vi.waitFor(() =>
    expect(document.querySelector('[id$="-status"]')?.textContent).toBe(
      'No options found.',
    ),
  );
  expect(load).toHaveBeenCalledTimes(1);
  expect(load.mock.calls[0]?.[0]).toBe('ab');
  test.search('error');
  await vi.waitFor(() =>
    expect(document.querySelector('[id$="-status"]')?.textContent).toContain(
      'could not be loaded',
    ),
  );
  expect(document.body.textContent).not.toContain('Private server details');
  await test.editor.destroy();
});
it('cancels outstanding queries during disposal and never restores removed controls', async () => {
  let finish!: (options: readonly AsyncSelectOption<string>[]) => void;
  const load = vi.fn<AsyncSelectOptions<string>['load']>(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const test = setup(load);
  test.search('pending');
  await vi.waitFor(() => expect(load).toHaveBeenCalledTimes(1));
  expect(document.querySelector('[id$="-status"]')?.textContent).toContain(
    'Loading',
  );
  await test.editor.destroy();
  expect(load.mock.calls[0]?.[1].signal.aborted).toBe(true);
  finish([{ value: 'late', label: 'Late option' }]);
  await Promise.resolve();
  expect(document.querySelector('[role=combobox]')).toBeNull();
  expect(document.querySelector('[role=listbox]')).toBeNull();
});
