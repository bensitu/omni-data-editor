# Concurrent changes

External notifications and persistence conflict results are processed by the runtime. Conflict snapshots distinguish updated and deleted entities. Updated conflicts identify local changes, remote changes and overlapping field differences.

Use `session.resolveConflict({ kind: 'accept-remote' })` to accept remote data, or `rebase-local` to replay local changes onto it. `merge` takes a field identifier map with local or remote choices. Resolution invalidates validation and recomputes changes. Accepting remote deletion cancels the session; deletion cannot be rebased or merged.

The default external change policy is notify. Silent still detects conflicts and allows applications to render their own interface. Rebase-clean automatically rebases only when local and remote changes do not conflict. A persistence conflict without remote data returns a failure and requires application refresh; missing data is not evidence of deletion.

Use server revision or ETag preconditions to prevent lost writes. Client field comparison cannot prevent a server change between validation and commit.
