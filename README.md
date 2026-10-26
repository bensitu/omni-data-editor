# OmniDataEditor

A framework independent TypeScript entity editing engine with immutable drafts, revision scoped validation, structured persistence and explicit concurrent change handling. Native dialog and inline presentations connect the same runtime to standalone interfaces, DataTables and Tabulator.

OmniDataEditor provides editing behavior around existing interfaces and leaves sorting, filtering, pagination and server storage to the host application. The packages use synchronized 0.x versions; public interfaces may change between minor releases.

## Local development

Use Node 24 and pnpm 11.25.0.

```sh
pnpm install --frozen-lockfile
pnpm build
pnpm dev
```

Open [the team directory playground](http://127.0.0.1:5173/showcase/) to explore dialog editing, inline salary changes, batch updates, validation and asynchronous office selection in one interface. The page uses a real DataTables host, responsive layouts and in-memory sample data that resets on reload.

Focused examples are available at `/standalone/`, `/datatables-dialog/`, `/datatables-inline/`, `/tabulator-dialog/`, `/tabulator-inline/` and `/async-select/`. Examples use local persistence and import public package exports. `pnpm build:examples` creates a static build of all example pages under `dist/examples/`. See [playground documentation](docs/guide/playground.md) for interaction details and verification commands.

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

## Packages

| Package under `@omnidataeditor/` | Responsibility                                                            |
| -------------------------------- | ------------------------------------------------------------------------- |
| core                             | Headless sessions, fields, changes, validation, persistence and conflicts |
| dom                              | Native controls, renderer registry, forms, focus and viewport contracts   |
| presentation-dialog              | Native modal dialog                                                       |
| presentation-inline              | Anchored editing with explicit focus boundaries                           |
| host-datatables                  | DataTables capabilities with optional Select support                      |
| host-tabulator                   | Tabulator capabilities and explicit index mapping                         |
| field-async-select               | Independent cancellable asynchronous selection renderer                   |
| theme-default                    | Explicit CSS entry point and theme properties                             |
| editor                           | Common factory and type exports                                           |

All public packages use synchronized versions and ESM exports. JavaScript imports are safe in Node and server bundles. Browser rendering requires a browser; import safety does not promise server rendering of controls. CSS is imported explicitly. Core has zero runtime dependencies.

## Verification and documentation

`pnpm verify` runs formatting, lint, build, type checking, core and browser tests, cross browser flows, package validation, packed consumer builds, bundle checks and documentation generation. `pnpm docs:api` generates TypeDoc reference pages; `pnpm docs:build` builds the VitePress site.

The intended browser policy covers current stable and the preceding two major releases in the Chromium, Firefox and Safari families. See [compatibility](docs/support.md), [accessibility](docs/accessibility.md) and [security](docs/security.md) for usage requirements and integration responsibilities.

Source is organized into `packages/`, `examples/`, `tests/`, `docs/` and `scripts/`. Public package documentation, examples and automated checks are included in the repository.

## Project resources

- [Documentation](https://bensitu.github.io/omni-data-editor/)
- [Live playground](https://bensitu.github.io/omni-data-editor/examples/showcase/)
- [Changelog](CHANGELOG.md)
- [Contributing](CONTRIBUTING.md)
- [Support](SUPPORT.md)
- [Code of conduct](CODE_OF_CONDUCT.md)
- [Security policy](SECURITY.md)

Licensed under [MIT](LICENSE).
