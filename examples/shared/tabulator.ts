import { TabulatorFull } from 'tabulator-tables';
import {
  createEditor,
  textField,
  numberField,
  dialog,
  inline,
} from '@omnidataeditor/editor';
import { tabulatorHost } from '@omnidataeditor/host-tabulator';
import '@omnidataeditor/theme-default/styles.css';
import 'tabulator-tables/dist/css/tabulator.css';
import '../standalone/style.css';
type Employee = { id: number; name: string; salary: number };
export async function mountTabulator(
  presentation: 'dialog' | 'inline',
): Promise<void> {
  const fields = [
    textField<Employee>('name', { label: 'Name', required: true }),
    numberField<Employee>('salary', { label: 'Salary', min: 0 }),
  ];
  const table = new TabulatorFull('#employees', {
    height: 300,
    data: [
      { id: 1, name: 'Ada Lovelace', salary: 120000 },
      { id: 2, name: 'Grace Hopper', salary: 130000 },
    ],
    columns: [
      { field: 'name', title: 'Name', formatter: 'plaintext' },
      { field: 'salary', title: 'Salary' },
    ],
    selectableRows: 1,
  });
  await new Promise<void>((resolve) => table.on('tableBuilt', resolve));
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
  const host = tabulatorHost<Employee>(table, {
    identity: (entity) => entity.id,
    onExternalEntity: (entity) => editor.notifyExternalEntity(entity),
    onExternalRemoval: (key) => editor.notifyExternalRemoval(key),
  });
  editor.attach(host);
  editor.use(
    presentation === 'dialog'
      ? dialog({ fields, title: 'Employee details' })
      : inline({ fields, fieldId: 'name' }),
  );
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
  document.querySelector<HTMLButtonElement>('#create')!.hidden =
    presentation === 'inline';
  button('#edit', () => {
    const selected = host.capabilities.selection?.getSelected()[0];
    if (selected) editor.edit(selected.entity);
  });
  button('#remove', async () => {
    const selected = host.capabilities.selection?.getSelected()[0];
    if (selected) await editor.remove(selected.entity);
  });
}
