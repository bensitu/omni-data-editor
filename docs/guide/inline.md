# Inline editing

Register `inline({ fields, fieldId: 'name' })` from `@omnidataeditor/presentation-inline`. Inline edits an existing entity at one registered field anchor. Other fields still participate in runtime validation.

The host must provide anchor and focus capabilities. Viewport is optional unless `reveal: 'required'` is configured. The default is reveal if supported and no automatic action on blur. Explicit blur policies submit or cancel only when focus leaves the editor and its registered popup surfaces.

Escape cancels. Native form submission saves. Sorting that preserves the anchor can continue editing; filtering, redraw or external replacement that removes the anchor cancels and cleans up the controls. Original anchor content is restored on cancellation. Canonical host reflection determines the final displayed value after save.

Owned overlays must register with `registerOwnedFocusSurface` and release that registration during renderer cleanup. Do not place portal content outside a native modal dialog, since it would be inert under browser modal semantics.

Presentation fields must be registered with the editor. An inline form is created before the original anchor content is replaced; a failed mount restores the original nodes. When reveal is enabled and an anchor is initially unavailable, the presentation calls the host's optional `anchor.activate(entity, fieldId)` before resolving the anchor again. `reveal: 'never'` disables activation and scrolling.
