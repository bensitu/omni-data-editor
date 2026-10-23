import {
  createEditor,
  textField,
  numberField,
  selectField,
  checkboxField,
  dialog,
} from '@omnidataeditor/editor';
import '@omnidataeditor/theme-default/styles.css';
import './style.css';
type Employee = {
  id: number;
  name: string;
  salary: number;
  office: string;
  active: boolean;
};
const fields = [
  textField<Employee>('name', { label: 'Name', required: true }),
  numberField<Employee>('salary', { label: 'Salary', min: 0 }),
  selectField<Employee>('office', {
    label: 'Office',
    options: [
      { value: 'Tokyo', label: 'Tokyo' },
      { value: 'Osaka', label: 'Osaka' },
    ],
  }),
  checkboxField<Employee>('active', { label: 'Active' }),
];
let nextId = 2;
const entities = new Map<number, Employee>([
  [
    1,
    {
      id: 1,
      name: 'Ada Lovelace',
      salary: 120000,
      office: 'Tokyo',
      active: true,
    },
  ],
]);
const editor = createEditor<Employee>({
  fields,
  identity: (entity) => entity.id,
  createInitial: () => ({
    id: 0,
    name: '',
    salary: 0,
    office: 'Tokyo',
    active: true,
  }),
  persistence: {
    async create({ candidate }) {
      const entity = {
        ...candidate,
        id: nextId++,
        name: candidate.name.trim(),
      };
      entities.set(entity.id, entity);
      render();
      return { ok: true, entity };
    },
    async update({ candidate }) {
      const entity = { ...candidate, name: candidate.name.trim() };
      entities.set(entity.id, entity);
      render();
      return { ok: true, entity };
    },
    async remove({ entity }) {
      entities.delete(entity.id);
      render();
      return { ok: true };
    },
  },
});
editor.use(dialog({ fields, title: 'Employee details' }));
function render() {
  const container = document.querySelector<HTMLDivElement>('#entities')!;
  container.replaceChildren();
  for (const employee of entities.values()) {
    const card = document.createElement('article'),
      name = document.createElement('h2'),
      detail = document.createElement('p'),
      edit = document.createElement('button'),
      remove = document.createElement('button');
    name.textContent = employee.name;
    detail.textContent = `${employee.office} · ${employee.salary.toLocaleString('en-US')} · ${employee.active ? 'Active' : 'Inactive'}`;
    edit.textContent = 'Edit';
    edit.onclick = () => {
      edit.focus();
      editor.edit(employee);
    };
    remove.textContent = 'Remove';
    remove.onclick = async () => {
      const result = await editor.remove(employee);
      document.querySelector('#status')!.textContent =
        result.status === 'removed'
          ? 'Employee removed.'
          : 'Removal did not complete.';
    };
    card.append(name, detail, edit, remove);
    container.append(card);
  }
}
const createButton = document.querySelector<HTMLButtonElement>('#create')!;
createButton.onclick = () => {
  createButton.focus();
  editor.create();
};
render();
