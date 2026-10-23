# Persistence and reconciliation

Provide create, update and remove functions as needed. Updates receive the original entity, candidate and ordered field changes. Success must return canonical data, including server generated identifiers and normalized values. The runtime commits that data before reflecting it into a host.

A reflection failure is reported in the committed outcome and `host:reflection-failed`. It does not undo server success. A second submit returns busy with the active operation identifier.

Persistence receives an AbortSignal and stable `clientMutationId` for retries of the same draft. The operation identifier changes per execution. Map the client mutation identifier to a server idempotency key only when the server supports that protocol. The editor cannot supply server idempotency itself.

An aborted or failed transport after dispatch is uncertain unless persistence can establish `certainty: 'not-committed'`. Reconciliation receives either an entity key or, for a create without a server key, the client mutation identifier. Only present data or authoritative absence resolves uncertainty; a temporary empty query does not establish absence.

Explicit `notifyExternalEntity` and `notifyExternalRemoval` provide authoritative refresh results for known keys. Unknown create results require the reconciliation port. The uncertainty registry is in memory. Applications should reload or preserve reconciliation requirements when destroying an editor during a dispatched mutation.
