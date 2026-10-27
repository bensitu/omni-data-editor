import { expect, it, vi } from 'vitest';
import DataTable from 'datatables.net';
import 'datatables.net-select';
import { createEditor, textField } from '@omnidataeditor/core';
import { inline } from '@omnidataeditor/presentation-inline';
import { dataTablesHost } from '@omnidataeditor/host-datatables';
import { hostContract, type Entity } from '../host-contract/suite.js';

hostContract('DataTables', async (notify) => {
  const element = document.createElement('table');
  document.body.append(element);
  const table = new DataTable<Entity>(element, {
    data: [
      { id: 1, name: 'Ada', obsolete: true },
      { id: 2, name: 'Grace' },
    ],
    columns: [{ data: 'name', title: 'Name' }],
    select: true,
  });
  const connection = dataTablesHost(table, {
    identity: (entity) => entity.id,
    selection: true,
    onExternalEntity: notify,
  });
  const get = (key: number) =>
    table
      .rows()
      .data()
      .toArray()
      .find((entity) => entity.id === key);
  return {
    connection,
    data: get,
    select(key) {
      table.rows((_: number, entity: Entity) => entity.id === key).select();
    },
    async refresh(entity) {
      table
        .row((_, value) => value.id === entity.id)
        .data(entity)
        .draw(false);
    },
    async reorder() {
      table.order([0, 'desc']).draw();
    },
    async dispose() {
      connection.detach();
      table.destroy();
      element.remove();
    },
  };
});
it('does not expose selection when the extension is disabled', () => {
  const element = document.createElement('table');
  document.body.append(element);
  const table = new DataTable<Entity>(element, {
    data: [{ id: 1, name: 'Ada' }],
    columns: [{ data: 'name' }],
    select: false,
  });
  const connection = dataTablesHost(table, {
    identity: (entity) => entity.id,
    selection: false,
  });
  expect(connection.capabilities.selection).toBeUndefined();
  connection.detach();
  table.destroy();
  element.remove();
});

it('refreshes direct data replacements and activates the matching page for inline editing', async () => {
  const element = document.createElement('table');
  document.body.append(element);
  const data = Array.from({ length: 15 }, (_, index) => ({
    id: index + 1,
    name: `Person ${index + 1}`,
  }));
  const table = new DataTable<Entity>(element, {
    data,
    pageLength: 5,
    order: [],
    columns: [{ data: 'name', title: 'Name' }],
  });
  const updated = vi.fn();
  const host = dataTablesHost(table, {
    identity: (entity) => entity.id,
    selection: false,
    onExternalEntity: updated,
  });
  const fields = [textField<Entity>('name')];
  const editor = createEditor({
    fields,
    identity: (entity: Entity) => entity.id,
  });
  editor.attach(host);
  editor.use(inline({ fields }));
  try {
    table.row(0).data({ id: 101, name: 'Replacement' });
    host.refresh();
    expect(updated).toHaveBeenCalledWith({ id: 101, name: 'Replacement' });
    expect(host.capabilities.binding!.resolve(1)).toBeNull();
    expect(host.capabilities.binding!.resolve(101)).toMatchObject({
      entity: { name: 'Replacement' },
    });
    expect(
      host.capabilities.anchor!.resolveFieldAnchor(data[14]!, 'name'),
    ).toBeNull();
    const session = editor.edit(data[14]!);
    await vi.waitFor(() =>
      expect(element.querySelector('input')).not.toBeNull(),
    );
    expect(table.page()).toBe(2);
    expect(session.snapshot().phase).toBe('editing');
  } finally {
    await editor.destroy();
    table.destroy();
    element.remove();
  }
});
