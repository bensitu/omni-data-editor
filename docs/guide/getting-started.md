# Getting started

Install `@omnidataeditor/editor` with an ESM capable package manager. The entry point includes common core helpers, renderer utilities and native dialog presentation. Import styles explicitly:

```ts
import { createEditor, textField, dialog } from '@omnidataeditor/editor';
import '@omnidataeditor/theme-default/styles.css';
type Person = { name: string };
const fields = [textField<Person>('name', { label: 'Name', required: true })];
const editor = createEditor<Person>({
  fields,
  persistence: {
    async update(request) {
      return { ok: true, entity: request.candidate };
    },
  },
});
editor.use(dialog({ fields, title: 'Edit person' }));
editor.edit({ name: 'Ada' });
```

Presentations receive field definitions explicitly through options. Session snapshots contain entity values and validation state, while field definitions remain configuration. Headless consumers can import `@omnidataeditor/core` alone.

Run the local examples using `pnpm build` followed by `pnpm exec vite examples`, then open `/standalone/`. Examples use local persistence; applications supply their own server adapter.
