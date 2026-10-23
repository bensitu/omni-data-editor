# @omnidataeditor/host-datatables

DataTables integration through focused entity capabilities.

```ts
import { dataTablesHost } from '@omnidataeditor/host-datatables';
editor.attach(dataTablesHost(table, { identity: (entity) => entity.id }));
```

DataTables is a peer dependency. Selection requires its separately configured Select extension. Canonical updates replace complete objects.

Part of OmniDataEditor. ESM distribution under the MIT license. Usage and integration documentation is available in the source repository's docs directory.
