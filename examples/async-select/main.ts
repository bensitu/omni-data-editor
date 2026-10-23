import {
  createEditor,
  textField,
  dialog,
  createRendererRegistry,
} from '@omnidataeditor/editor';
import {
  asyncSelectField,
  asyncSelectRendererKey,
  createAsyncSelectRenderer,
} from '@omnidataeditor/field-async-select';
import '@omnidataeditor/theme-default/styles.css';
import '../standalone/style.css';
type Employee = { name: string; office: string };
let entity: Employee = { name: 'Ada', office: 'Tokyo' };
const fields = [
  textField<Employee>('name', { label: 'Name' }),
  asyncSelectField<Employee>('office', { label: 'Office', required: true }),
];
const registry = createRendererRegistry();
registry.register(
  asyncSelectRendererKey,
  createAsyncSelectRenderer({
    isValue: (value): value is string => typeof value === 'string',
    getKey: (value) => value,
    async load(query, { signal }) {
      await new Promise((resolve) => setTimeout(resolve, 120));
      if (signal.aborted) return [];
      return ['Tokyo', 'Osaka', 'Kyoto']
        .filter((office) => office.toLowerCase().includes(query.toLowerCase()))
        .map((value) => ({ value, label: value }));
    },
  }),
);
const editor = createEditor<Employee>({
  fields,
  persistence: {
    async update({ candidate }) {
      entity = candidate;
      document.querySelector('#result')!.textContent =
        `${entity.name} · ${entity.office}`;
      return { ok: true, entity };
    },
  },
});
editor.use(dialog({ fields, registry, title: 'Edit assignment' }));
const button = document.querySelector<HTMLButtonElement>('#edit')!;
button.onclick = () => {
  button.focus();
  editor.edit(entity);
};
