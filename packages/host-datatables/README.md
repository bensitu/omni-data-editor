# @omnidataeditor/host-datatables

DataTables integration through focused entity capabilities.

```ts
import { dataTablesHost } from '@omnidataeditor/host-datatables';
editor.attach(dataTablesHost(table, { identity: (entity) => entity.id }));
```

DataTables is a peer dependency. Selection requires its separately configured Select extension. Canonical updates replace complete objects.

Part of OmniDataEditor. ESM distribution under the MIT license. See the [documentation](https://bensitu.github.io/omni-data-editor/) and [DataTables guide](https://bensitu.github.io/omni-data-editor/guide/datatables).
