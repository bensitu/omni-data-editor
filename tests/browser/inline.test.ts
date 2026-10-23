import { expect, it, vi } from 'vitest';
import DataTable from 'datatables.net';
import { createEditor, textField } from '@omnidataeditor/core';
import { browserFocus, createRendererRegistry } from '@omnidataeditor/dom';
import { dataTablesHost } from '@omnidataeditor/host-datatables';
import { inline } from '@omnidataeditor/presentation-inline';

it('submits once when an explicit submit blur policy leaves the editor boundary', async () => {
  const fields = [textField<{ id: number; name: string }>('name')];
  const update = vi.fn(
    async ({ candidate }: { candidate: { id: number; name: string } }) => ({
      ok: true as const,
      entity: candidate,
    }),
  );
  const editor = createEditor({
    fields,
    identity: (entity: { id: number }) => entity.id,
    persistence: { update },
  });
  const anchor = document.createElement('div'),
    outside = document.createElement('button');
  document.body.append(anchor, outside);
  editor.attach({
    capabilities: {
      anchor: { resolveFieldAnchor: () => anchor },
      focus: browserFocus(),
    },
    detach() {},
  });
  editor.use(inline({ fields, blurBehavior: 'submit' }));
  const session = editor.edit({ id: 1, name: 'Ada' });
  await vi.waitFor(() => expect(anchor.querySelector('input')).not.toBeNull());
  outside.focus();
  await vi.waitFor(() => expect(session.snapshot().phase).toBe('committed'));
  expect(update).toHaveBeenCalledTimes(1);
  await editor.destroy();
  anchor.remove();
  outside.remove();
});

it('edits a real DataTables anchor after sorting and cancels if the anchor disappears', async () => {
  type Entity = { id: number; name: string };
  const element = document.createElement('table');
  document.body.append(element);
  const table = new DataTable<Entity>(element, {
    data: [
      { id: 1, name: 'Ada' },
      { id: 2, name: 'Grace' },
    ],
    columns: [{ data: 'name' }],
  });
  const fields = [textField<Entity>('name')];
  const editor = createEditor({
    fields,
    identity: (entity: Entity) => entity.id,
  });
  editor.attach(
    dataTablesHost(table, {
      identity: (entity) => entity.id,
      selection: false,
    }),
  );
  editor.use(inline({ fields }));
  table.order([0, 'desc']).draw();
  const session = editor.edit({ id: 1, name: 'Ada' });
  await vi.waitFor(() =>
    expect(element.querySelector('.omnidataeditor-inline')).not.toBeNull(),
  );
  const input = element.querySelector<HTMLInputElement>('input')!;
  input.value = 'Changed';
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.blur();
  expect(session.snapshot().phase).toBe('editing');
  table.search('Grace').draw();
  await vi.waitFor(() => expect(session.snapshot().phase).toBe('cancelled'));
  expect(document.querySelector('.omnidataeditor-inline')).toBeNull();
  await editor.destroy();
  table.destroy();
  element.remove();
});

it('supports basic anchors without a viewport and requires explicitly requested capabilities', async () => {
  const fields = [textField<{ id: number; name: string }>('name')];
  const editor = createEditor({
    fields,
    identity: (entity: { id: number }) => entity.id,
  });
  const anchor = document.createElement('div');
  document.body.append(anchor);
  editor.attach({
    capabilities: {
      anchor: { resolveFieldAnchor: () => anchor },
      focus: browserFocus(),
    },
    detach() {},
  });
  const dispose = editor.use(inline({ fields, reveal: 'required' }));
  expect(() => editor.edit({ id: 1, name: 'Ada' })).toThrow(/capability/);
  await dispose();
  editor.use(inline({ fields, reveal: 'if-supported' }));
  const session = editor.edit({ id: 1, name: 'Ada' });
  await vi.waitFor(() => expect(anchor.querySelector('form')).not.toBeNull());
  session.cancel();
  await editor.destroy();
  anchor.remove();
});

it('treats registered popup focus as internal and applies explicit boundary cancellation', async () => {
  const registry = createRendererRegistry(),
    popup = document.createElement('button');
  popup.textContent = 'Owned option';
  document.body.append(popup);
  registry.register('@example/popup', {
    create(context) {
      const element = document.createElement('input'),
        unregister = context.registerOwnedFocusSurface?.(popup);
      return {
        element,
        setValue() {},
        setDisabled() {},
        setReadOnly() {},
        setVisible() {},
        setIssues() {},
        focus() {
          element.focus();
        },
        destroy() {
          unregister?.();
          element.remove();
        },
      };
    },
  });
  const fields = [
    {
      ...textField<{ id: number; name: string }>('name'),
      renderer: '@example/popup',
    },
  ];
  const editor = createEditor({
    fields,
    identity: (entity: { id: number }) => entity.id,
  });
  const anchor = document.createElement('div'),
    outside = document.createElement('button');
  document.body.append(anchor, outside);
  editor.attach({
    capabilities: {
      anchor: { resolveFieldAnchor: () => anchor },
      focus: browserFocus(),
    },
    detach() {},
  });
  editor.use(inline({ fields, registry, blurBehavior: 'cancel' }));
  const session = editor.edit({ id: 1, name: 'Ada' });
  await vi.waitFor(() => expect(anchor.querySelector('input')).not.toBeNull());
  popup.focus();
  await Promise.resolve();
  expect(session.snapshot().phase).toBe('editing');
  outside.focus();
  await vi.waitFor(() => expect(session.snapshot().phase).toBe('cancelled'));
  await editor.destroy();
  anchor.remove();
  popup.remove();
  outside.remove();
});
