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

Binding and anchor lookups refresh identity mappings from the current table data. Column data sources are resolved when an anchor is requested, so inferred mappings follow the current column structure. Explicit `columns` entries refer to current DataTables column indices.

Call the connection's `refresh()` after direct data operations that do not draw the table when immediate external notifications are needed. DataTables data setters do not emit a general data-change event. A draw also synchronizes the connection.

With inline reveal enabled, the adapter activates the local page containing an available row under the current search and sort. Filtered rows and data on unloaded server pages remain under application control.

Use immutable data when refreshing externally. In place mutation of objects shared with an editing session cannot provide a historical baseline for conflict comparison.
