# Editing multiple entities

Call `editor.editMany(entities)` with stable unique identity. Fields expose a uniform or mixed baseline. Draft values are unchanged, a uniform override, or mixed when conflict resolution or canonical results leave different candidate values. Each entity change set reflects its actual candidate. Unrelated properties and untouched mixed values remain unchanged.

Provide `batchPersistence.updateMany`. Requests include one change set per dirty entity. The result declares atomic or non atomic behavior and contains exactly one outcome for each requested key. A batch submission returns `{ status: 'batch', result, reflections }`; inspect each result independently.

On partial success, canonical successful entities become clean baselines. An unchanged retry sends only remaining dirty entities using the same logical client mutation identifier. The server must implement per entity idempotency for this model. Editing a field creates a new logical write applied to every target. Core never substitutes several single updates for an atomic batch.

Conflicts retain each target and can be resolved in order. Unknown results require reconciliation. Successful canonical events still report known server commits even when another entity is uncertain. The session snapshot keeps the latest result for application rendering.

The native dialog supports mixed fields without requiring users to reenter untouched values. Inline presentation handles a single existing entity and field.
