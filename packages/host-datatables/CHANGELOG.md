# @omnidataeditor/host-datatables

## 0.1.1

### Patch Changes

- Clear reflection markers after unchanged updates so later external removals are delivered.

- Reflect canonical updates in batches and rebuild identity mappings only after complete validation.
- Distinguish windowed datasets from authoritative removal notifications.

- Refresh row identity mappings during lookups and resolve inferred column mappings from current data sources.
- Expose explicit synchronization for data changes without a draw and activate local pages before inline editing.

## 0.1.0

### Minor Changes

- Connect DataTables identity, selection, canonical reflection, anchors and external refresh notifications.
