# @omnidataeditor/host-tabulator

Tabulator integration with complete canonical replacement.

```ts
import { tabulatorHost } from '@omnidataeditor/host-tabulator';
editor.attach(tabulatorHost(table, { identity: (entity) => entity.id }));
```

Attach after tableBuilt. Provide an index function when host index differs from business identity. Tabulator is a peer dependency.

Part of OmniDataEditor. ESM distribution under the MIT license. Usage and integration documentation is available in the source repository's docs directory.
