import DataTable from 'datatables.net';
import 'datatables.net-select';
import { createEditor, textField, numberField } from '@omnidataeditor/editor';
import { inline } from '@omnidataeditor/presentation-inline';
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
  select: 'single',
});
let nextId = 3;
const editor = createEditor<Employee>({
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
editor.use(inline({ fields, fieldId: 'name' }));
const button = (selector: string, action: () => void | Promise<void>) => {
  const element = document.querySelector<HTMLButtonElement>(selector)!;
  element.onclick = () => {
    element.focus();
    void action();
  };
};
document.querySelector<HTMLButtonElement>('#create')!.hidden = true;
button('#edit', () => {
  const selected = host.capabilities.selection?.getSelected()[0];
  if (selected) editor.edit(selected.entity);
  else
    document.querySelector('#status')!.textContent =
      'Select an employee first.';
});
button('#remove', async () => {
  const selected = host.capabilities.selection?.getSelected()[0];
  if (selected) await editor.remove(selected.entity);
});
