import { expect, it } from 'vitest';
import { TabulatorFull } from 'tabulator-tables';
import { tabulatorHost } from '@omnidataeditor/host-tabulator';
import { hostContract, type Entity } from '../host-contract/suite.js';
import 'tabulator-tables/dist/css/tabulator.css';

hostContract('Tabulator', async (notify) => {
  const element = document.createElement('div');
  element.style.height = '300px';
  document.body.append(element);
  const table = new TabulatorFull(element, {
    data: [
      { id: 1, name: 'Ada', obsolete: true },
      { id: 2, name: 'Grace' },
    ],
    columns: [{ field: 'name', title: 'Name' }],
    selectableRows: true,
  });
  await new Promise<void>((resolve) => table.on('tableBuilt', resolve));
  const connection = tabulatorHost<Entity>(table, {
    identity: (entity) => entity.id,
    selection: true,
    onExternalEntity: notify,
  });
  return {
    connection,
    data(key) {
      const row = table.getRow(key);
      return row ? (row.getData() as Entity) : undefined;
    },
    select(key) {
      table.selectRow(key);
    },
    async refresh(entity) {
      const data = table
        .getData()
        .map((value: Entity) => (value.id === entity.id ? entity : value));
      await table.replaceData(data);
    },
    async reorder() {
      table.setSort('name', 'desc');
    },
    async dispose() {
      connection.detach();
      table.destroy();
      element.remove();
    },
  };
});

it('requires an explicit host index mapping when it differs from business identity', async () => {
  const element = document.createElement('div');
  document.body.append(element);
  const table = new TabulatorFull(element, {
    index: 'record',
    data: [{ id: 1, record: 'record-a', name: 'Ada' }],
    columns: [{ field: 'name', title: 'Name' }],
  });
  await new Promise<void>((resolve) => table.on('tableBuilt', resolve));
  type Entity = { id: number; record: string; name: string };
  try {
    expect(() =>
      tabulatorHost<Entity>(table, { identity: (entity) => entity.id }),
    ).toThrow(/index/);
    const host = tabulatorHost<Entity>(table, {
      identity: (entity) => entity.id,
      index: (entity) => entity.record,
    });
    expect(host.capabilities.binding?.resolve(1)).toMatchObject({ key: 1 });
    await host.capabilities.reflection!.reflectUpdate(
      { id: 1, record: 'record-a', name: 'Ada' },
      { id: 2, record: 'record-b', name: 'Canonical' },
    );
    expect(table.getRow('record-a')).toBe(false);
    expect(table.getRow('record-b').getData()).toEqual({
      id: 2,
      record: 'record-b',
      name: 'Canonical',
    });
    host.detach();
  } finally {
    table.destroy();
    element.remove();
  }
});
