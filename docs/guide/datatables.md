# DataTables integration

Initialize DataTables before connecting the editor. Use stable business identity and configure field identifiers to column indices when the column data source does not match the field identifier.

```ts
import { dataTablesHost } from '@omnidataeditor/host-datatables';
editor.attach(
  dataTablesHost(table, {
    identity: (entity) => entity.id,
    columns: { name: 0 },
    onExternalEntity: (entity) => editor.notifyExternalEntity(entity),
    onExternalRemoval: (key) => editor.notifyExternalRemoval(key),
  }),
);
```

Selection is optional. Install and enable DataTables Select for selected entity operations. Set `selection: false` to omit that capability, or `selection: true` to require the extension. Direct entity editing does not require Select.

Canonical updates replace the complete row object. Business key changes rebind the cached lookup. External draw events refresh identity mappings and notify applications about replaced or removed entities. Reflection does not emit external conflict notifications. Detaching removes adapter listeners and leaves the DataTables instance under application ownership.

Use immutable data when refreshing externally. In place mutation of objects shared with an editing session cannot provide a historical baseline for conflict comparison.
