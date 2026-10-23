import { expect, it } from 'vitest';
import DataTable from 'datatables.net';
import 'datatables.net-select';
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
