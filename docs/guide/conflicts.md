# Concurrent changes

External notifications and persistence conflict results are processed by the runtime. Conflict snapshots distinguish updated and deleted entities. Updated conflicts identify local changes, remote changes and overlapping field differences.

Use `session.resolveConflict({ kind: 'accept-remote' })` to accept remote data, or `rebase-local` to replay local changes onto it. `merge` takes a field identifier map with local or remote choices. Resolution invalidates validation and recomputes changes. Accepting remote deletion removes that target from a multiple-entity session. A single-target session is cancelled. Deletion cannot be rebased or merged.

The default external change policy is notify. Silent still detects conflicts and allows applications to render their own interface. Rebase-clean automatically rebases only when local and remote changes do not conflict. A persistence conflict without remote data returns a failure and requires application refresh; missing data is not evidence of deletion.

Use server revision or ETag preconditions to prevent lost writes. Client field comparison cannot prevent a server change between validation and commit.

External refreshes with unchanged registered field values update the baseline and preserve local changes without creating a conflict. Automatic rebasing after a persistence conflict returns `superseded` when there is no remaining conflict; submit the refreshed draft again. Partial batch retries require server idempotency per `(clientMutationId, entityKey)`, without replaying definitive failed responses as successful writes.

Native forms provide conflict actions even with the silent event policy. Set `renderConflicts: false` only when the application provides another resolution interface. Conflict messages are announced, and unrelated snapshot updates retain the existing action buttons. Unknown mutation results retain a locked form until dismissal; retry requires authoritative reconciliation.
