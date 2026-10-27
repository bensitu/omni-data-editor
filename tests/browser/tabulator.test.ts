import { expect, it, vi } from 'vitest';
import { TabulatorFull } from 'tabulator-tables';
import { createEditor, textField } from '@omnidataeditor/core';
import { inline } from '@omnidataeditor/presentation-inline';
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

it('delivers external changes during reflection and tolerates a removed successor', async () => {
  const element = document.createElement('div');
  document.body.append(element);
  const table = new TabulatorFull(element, {
    data: [
      { id: 1, name: 'Ada' },
      { id: 2, name: 'Grace' },
      { id: 3, name: 'Lin' },
    ],
    columns: [{ field: 'name', title: 'Name' }],
  });
  await new Promise<void>((resolve) => table.on('tableBuilt', resolve));
  const updated = vi.fn(),
    removed = vi.fn();
  const host = tabulatorHost<Entity>(table, {
    identity: (entity) => entity.id,
    onExternalEntity: updated,
    onExternalRemoval: removed,
  });
  let release!: () => void;
  const paused = new Promise<void>((resolve) => {
    release = resolve;
  });
  const source = table.getRow(1),
    deleteRow = source.delete.bind(source);
  vi.spyOn(source, 'delete').mockImplementation(async () => {
    await deleteRow();
    await paused;
  });
  try {
    const reflecting = host.capabilities.reflection!.reflectUpdate(
      { id: 1, name: 'Ada' },
      { id: 1, name: 'Canonical' },
    );
    await vi.waitFor(() => expect(table.getRow(1)).toBe(false));
    await table.deleteRow(2);
    await table.addRow({ id: 4, name: 'External' });
    release();
    await reflecting;
    expect(updated.mock.calls.map(([entity]) => entity.id)).toEqual([4]);
    expect(removed.mock.calls.map(([key]) => key)).toEqual([2]);
    expect(table.getData().at(-1)).toEqual({ id: 1, name: 'Canonical' });
  } finally {
    release();
    host.detach();
    table.destroy();
    element.remove();
  }
});

it('activates an offscreen virtual row before inline editing', async () => {
  const element = document.createElement('div');
  document.body.append(element);
  const data = Array.from({ length: 100 }, (_, index) => ({
    id: index + 1,
    name: `Person ${index + 1}`,
  }));
  const table = new TabulatorFull(element, {
    height: 200,
    data,
    columns: [{ field: 'name', title: 'Name' }],
  });
  await new Promise<void>((resolve) => table.on('tableBuilt', resolve));
  const host = tabulatorHost<Entity>(table, {
    identity: (entity) => entity.id,
  });
  const fields = [textField<Entity>('name')];
  const editor = createEditor({
    fields,
    identity: (entity: Entity) => entity.id,
  });
  editor.attach(host);
  editor.use(inline({ fields }));
  try {
    expect(
      host.capabilities.anchor!.resolveFieldAnchor(data[99]!, 'name'),
    ).toBeNull();
    const session = editor.edit(data[99]!);
    await vi.waitFor(() =>
      expect(element.querySelector('input')).not.toBeNull(),
    );
    expect(session.snapshot().phase).toBe('editing');
  } finally {
    await editor.destroy();
    table.destroy();
    element.remove();
  }
});
