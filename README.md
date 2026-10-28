# OmniDataEditor

[![MIT license](https://img.shields.io/github/license/bensitu/omni-data-editor)](LICENSE)
[![npm version](https://img.shields.io/npm/v/%40omnidataeditor/editor)](https://www.npmjs.com/package/@omnidataeditor/editor)
[![jsDelivr monthly hits](https://img.shields.io/jsdelivr/npm/hm/%40omnidataeditor/editor)](https://www.jsdelivr.com/package/npm/@omnidataeditor/editor)

A framework independent TypeScript entity editing engine with immutable drafts, revision scoped validation, structured persistence and explicit concurrent change handling. Native dialog and inline presentations connect the same runtime to standalone interfaces, DataTables and Tabulator.

OmniDataEditor provides editing behavior around existing interfaces and leaves sorting, filtering, pagination and server storage to the host application. The packages use synchronized 0.x versions; public interfaces may change between minor releases.

Read the [documentation](docs/index.md) for guides, package descriptions and integration requirements, or try the [live playground](https://bensitu.github.io/omni-data-editor/examples/showcase/). The documentation is also available [online](https://bensitu.github.io/omni-data-editor/).

## Usage

Install the common entry point and the default theme as direct dependencies:

```sh
pnpm add @omnidataeditor/editor @omnidataeditor/theme-default
```

```ts
import { createEditor, textField, dialog } from '@omnidataeditor/editor';
import '@omnidataeditor/theme-default/styles.css';

type Person = { id: number; name: string };
const fields = [textField<Person>('name', { label: 'Name', required: true })];
const editor = createEditor<Person>({
  fields,
  identity: (entity) => entity.id,
  persistence: {
    async update({ candidate }) {
      return { ok: true, entity: candidate };
    },
  },
});
editor.use(dialog({ fields, title: 'Edit person' }));
editor.edit({ id: 1, name: 'Ada' });
```

Applications supply persistence and server concurrency preconditions. Canonical success commits before host reflection. Unknown results after dispatch require reconciliation. Batch editing returns per entity outcomes and preserves successful canonical data during selective retries.

See the [package overview](docs/index.md#packages) to choose individual packages, and [Contributing](CONTRIBUTING.md) for local setup and verification commands.

## Project resources

- [Changelog](CHANGELOG.md)
- [Contributing](CONTRIBUTING.md)
- [Support](SUPPORT.md)
- [Code of conduct](CODE_OF_CONDUCT.md)
- [Security policy](SECURITY.md)

Licensed under [MIT](LICENSE).
