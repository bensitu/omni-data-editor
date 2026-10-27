# Persistence and reconciliation

Provide create, update and remove functions as needed. Updates receive the original entity, candidate and ordered field changes. Success must return canonical data, including server generated identifiers and normalized values. The runtime commits that data before reflecting it into a host.

A reflection failure is reported in the committed outcome and `host:reflection-failed`. It does not undo server success. A second submit returns busy with the active operation identifier.

Persistence receives an AbortSignal and stable `clientMutationId` for retries of the same draft. The operation identifier changes per execution. Map the client mutation identifier to a server idempotency key only when the server supports that protocol. The editor cannot supply server idempotency itself.

Deletion retries retain their client mutation identifier after a reliable transport failure. A definitive conflict or refusal ends that logical attempt; a subsequent deletion receives a new identifier. Resolving an update conflict also starts a new logical write.

Malformed batch results emit `mutation:failed` with the `invalid-batch-result` error code. The returned per-entity transport outcomes retain that error for diagnostics. Every dispatched entity remains uncertain until authoritative reconciliation establishes its result.

An aborted or failed transport after dispatch is uncertain unless persistence can establish `certainty: 'not-committed'`. Reconciliation receives either an entity key or, for a create without a server key, the client mutation identifier. Only present data or authoritative absence resolves uncertainty; a temporary empty query does not establish absence.

Explicit `notifyExternalEntity` and `notifyExternalRemoval` provide authoritative refresh results for known keys. Unknown create results require the reconciliation port. The uncertainty registry is in memory. Applications should reload or preserve reconciliation requirements when destroying an editor during a dispatched mutation.

An authoritative present result for an uncertain create emits `mutation:committed` and reflects the created entity into the host before the next draft becomes editable. The next create draft retains its own initial values. Submission failures that permit correction return to `editing`; current runtime operations terminate as `committed` or `cancelled`. The legacy `failed` session-state value is reserved for source compatibility and is not emitted by current runtime operations.
