# Persistence and reconciliation

Provide create, update and remove functions as needed. Updates receive the original entity, candidate and ordered field changes. Success must return canonical data, including server generated identifiers and normalized values. The runtime commits that data before reflecting it into a host.

A reflection failure is reported in the committed outcome and `host:reflection-failed`. It does not undo server success. A second submit returns busy with the active operation identifier.

Persistence receives an AbortSignal and stable `clientMutationId` for retries of the same draft. The operation identifier changes per execution. Map the client mutation identifier to a server idempotency key only when the server supports that protocol. The editor cannot supply server idempotency itself.

Deletion retries retain their client mutation identifier after a reliable transport failure. A definitive conflict or refusal ends that logical attempt; a subsequent deletion receives a new identifier. Resolving an update conflict also starts a new logical write.

Malformed batch results emit `mutation:failed` with the `invalid-batch-result` error code. The returned per-entity transport outcomes retain that error for diagnostics. Every dispatched entity remains uncertain until authoritative reconciliation establishes its result.

An aborted or failed transport after dispatch is uncertain unless persistence can establish `certainty: 'not-committed'`. Reconciliation receives either an entity key or, for a create without a server key, the client mutation identifier. Only present data or authoritative absence resolves uncertainty; a temporary empty query does not establish absence.

Explicit `notifyExternalEntity` and `notifyExternalRemoval` provide authoritative refresh results for known keys. Unknown create results require the reconciliation port. The uncertainty registry is in memory. Applications should reload or preserve reconciliation requirements when destroying an editor during a dispatched mutation.

An authoritative present result for an uncertain create emits `mutation:committed` and reflects the created entity into the host before the next draft becomes editable. The next create draft retains its own initial values. Submission failures that permit correction return to `editing`; current runtime operations terminate as `committed` or `cancelled`. The legacy `failed` session-state value is reserved for source compatibility and is not emitted by current runtime operations.

An unknown create result blocks another create until reconciliation; it does not block editing or removing unrelated identified entities. Reconciliation by key must return the requested business identity. Only an `absent` result with `authoritative: true` confirms absence. For deletion, authoritative absence completes the operation without another persistence request.

Unknown-result snapshots retain their draft and `uncertainties`, including the original `cause` when available. Applications may inspect diagnostics through the configured logger and uncertainty events; diagnostic causes can contain application-specific details. A synchronous exception does not prove that no write was dispatched. Structured `certainty: 'not-committed'` is required to establish that guarantee. Late successful results emit canonical events and update an attached host.

Presentation contexts expose the session cancellation signal. Asynchronous integrations should stop and settle their mounting work when cancelled. Disposal waits for outstanding integration work and requires idempotent cleanup.

A single-entity submission may persist an unchanged candidate for server-side normalization. Headless drafting and validation do not require persistence; a missing operation port is reported when submission is attempted. Unknown identities remain distinct: numeric and string keys are not interchangeable.

After authoritative reconciliation or an external refresh resolves an uncertain operation, a later response from that operation does not replace the current entity or emit another canonical commit. A success settled immediately before cancellation still confirms the write and updates the host once.
