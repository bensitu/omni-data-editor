# @omnidataeditor/host-tabulator

Tabulator integration with complete canonical replacement.

```ts
import { tabulatorHost } from '@omnidataeditor/host-tabulator';
editor.attach(tabulatorHost(table, { identity: (entity) => entity.id }));
```

Attach after tableBuilt. Provide an index function when host index differs from business identity. Tabulator is a peer dependency.

Part of OmniDataEditor. ESM distribution under the MIT license. See the [documentation](https://bensitu.github.io/omni-data-editor/) and [Tabulator guide](https://bensitu.github.io/omni-data-editor/guide/tabulator).
