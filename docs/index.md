# OmniDataEditor

OmniDataEditor is a framework independent TypeScript editing engine. It manages entity drafts, validation, asynchronous persistence and concurrent changes. Presentations bind native controls to sessions; hosts connect existing UI libraries through focused capabilities.

## Getting started

- [Installation and basic usage](./guide/getting-started.md)
- [Interactive playground and local examples](./guide/playground.md)
- [Standalone and headless editing](./guide/standalone.md)

## Editing and integrations

| Topic                        | Guide                                             |
| ---------------------------- | ------------------------------------------------- |
| Validation and field issues  | [Validation](./guide/validation.md)               |
| Saving and uncertain results | [Persistence](./guide/persistence.md)             |
| Concurrent changes           | [Conflicts](./guide/conflicts.md)                 |
| Batch operations             | [Multiple entities](./guide/multiple-entities.md) |
| Anchored controls and focus  | [Inline editing](./guide/inline.md)               |
| DataTables integration       | [DataTables](./guide/datatables.md)               |
| Tabulator integration        | [Tabulator](./guide/tabulator.md)                 |
| Cancellable option loading   | [Asynchronous selection](./guide/async-select.md) |

## Extensions

- [Custom field renderers](./guide/custom-renderer.md)
- [Custom presentations](./guide/custom-presentation.md)
- [Custom hosts](./guide/custom-host.md)

## Packages

| Package under `@omnidataeditor/` | Responsibility                                                            |
| -------------------------------- | ------------------------------------------------------------------------- |
| editor                           | Common factories and type exports                                         |
| core                             | Headless sessions, fields, changes, validation, persistence and conflicts |
| dom                              | Native controls, renderer registry, forms, focus and viewport contracts   |
| presentation-dialog              | Native modal dialog                                                       |
| presentation-inline              | Anchored editing with explicit focus boundaries                           |
| host-datatables                  | DataTables capabilities with optional Select support                      |
| host-tabulator                   | Tabulator capabilities and explicit index mapping                         |
| field-async-select               | Independent cancellable asynchronous selection renderer                   |
| theme-default                    | Explicit CSS entry point and theme properties                             |

All public packages use synchronized versions and ESM exports. Import styles explicitly. JavaScript entry points are safe to import in Node and server bundles; rendering controls requires a browser. Core has zero runtime dependencies.

## Reference

- [Compatibility and runtime requirements](./reference/compatibility.md)
- [Accessibility](./reference/accessibility.md)
- [Security boundaries](./reference/security.md)
- [API reference](https://bensitu.github.io/omni-data-editor/api/index.html)
