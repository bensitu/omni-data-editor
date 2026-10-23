import DataTable from 'datatables.net';
import 'datatables.net-select';
import {
  createEditor,
  textField,
  numberField,
  dialog,
} from '@omnidataeditor/editor';
import { dataTablesHost } from '@omnidataeditor/host-datatables';
import '@omnidataeditor/theme-default/styles.css';
import '../standalone/style.css';
type Employee = { id: number; name: string; salary: number };
const fields = [
  textField<Employee>('name', { label: 'Name', required: true }),
  numberField<Employee>('salary', { label: 'Salary', min: 0 }),
];
const table = new DataTable<Employee>('#employees', {
  data: [
    { id: 1, name: 'Ada Lovelace', salary: 120000 },
    { id: 2, name: 'Grace Hopper', salary: 130000 },
  ],
  columns: [
    { data: 'name', title: 'Name', render: DataTable.render.text() },
    { data: 'salary', title: 'Salary' },
  ],
  select: 'multi',
});
let nextId = 3;
const editor = createEditor<Employee>({
  batchPersistence: {
    async updateMany({ changes }) {
      return {
        atomicity: 'atomic',
        items: changes.entities.map((entity) => ({
          key: entity.key,
          outcome: { ok: true, entity: entity.candidate },
        })),
      };
    },
  },
  fields,
  identity: (entity) => entity.id,
  createInitial: () => ({ id: 0, name: '', salary: 0 }),
  persistence: {
    async create({ candidate }) {
      return { ok: true, entity: { ...candidate, id: nextId++ } };
    },
    async update({ candidate }) {
      return { ok: true, entity: candidate };
    },
    async remove() {
      return { ok: true };
    },
  },
});
const host = dataTablesHost(table, {
  identity: (entity) => entity.id,
  onExternalEntity: (entity) => editor.notifyExternalEntity(entity),
  onExternalRemoval: (key) => editor.notifyExternalRemoval(key),
});
editor.attach(host);
editor.use(dialog({ fields, title: 'Employee details' }));
const button = (selector: string, action: () => void | Promise<void>) => {
  const element = document.querySelector<HTMLButtonElement>(selector)!;
  element.onclick = () => {
    element.focus();
    void action();
  };
};
button('#create', () => {
  editor.create();
});
button('#edit', () => {
  const selection = host.capabilities.selection?.getSelected() ?? [];
  const selected = selection[0];
  if (selection.length > 1)
    editor.editMany(selection.map((item) => item.entity));
  else if (selected) editor.edit(selected.entity);
  else
    document.querySelector('#status')!.textContent =
      'Select an employee first.';
});
button('#remove', async () => {
  const selected = host.capabilities.selection?.getSelected()[0];
  if (selected) await editor.remove(selected.entity);
});
