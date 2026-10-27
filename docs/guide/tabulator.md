# Tabulator integration

Attach after Tabulator emits `tableBuilt`. The adapter uses public component and data APIs. Supply stable business identity. If Tabulator indexes another property, also supply the corresponding index function.

```ts
import { tabulatorHost } from '@omnidataeditor/host-tabulator';
editor.attach(
  tabulatorHost(table, {
    identity: (entity) => entity.id,
    index: (entity) => entity.recordId,
    onExternalEntity: (entity) => editor.notifyExternalEntity(entity),
    onExternalRemoval: (key) => editor.notifyExternalRemoval(key),
  }),
);
```

Canonical updates delete and insert the component at its previous visible position. This removes properties absent from the canonical entity, unlike merging through updateData. Selection is restored when applicable. Business key and host index changes are checked for collisions and rebound. A replacement failure is a host reflection failure; canonical server success remains committed.

Selection, binding, reflection, field anchors, focus and viewport capabilities use the same contracts as other hosts. With inline reveal enabled, the adapter activates local pages and scrolls virtual rows into view before resolving the field anchor. Filtered rows and unloaded remote pages require application activation.

External updates and removals observed during asynchronous reflection are delivered after reflection completes. Expected canonical changes do not generate external notifications. If the row following a replacement disappears while the original is being deleted, the replacement is appended to the table.

External `replaceData` refreshes notify the editor using new immutable data objects. When using in place update APIs, retain independent immutable editing entities and explicitly notify canonical changes so historical baselines remain available. Detaching releases adapter listeners without destroying the Tabulator instance.
