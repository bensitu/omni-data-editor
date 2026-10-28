# @omnidataeditor/core

## 0.1.1

### Patch Changes

- Isolate uncertain creates, validate reconciliation and mutation results, reflect late success, and confirm authoritative deletions.
- Order reentrant notifications, recover from application accessor failures, and cache stable snapshots between notifications.
- Rebase unchanged registered values, bound entity validation concurrency, skip hidden field validators, and preserve unaffected batch targets.
- Preserve numeric and sparse array paths and report unavailable cryptographic support explicitly.

- Keep batch drafts consistent with actual candidates and reuse derived draft data within each revision.
- Accept empty built-in field values, validate select configuration, and clarify terminal session behavior while retaining legacy state types for compatibility.
- Publish authoritative create results, retain batch response diagnostics, and renew mutation identifiers after definitive conflict decisions.

## 0.1.0

### Minor Changes

- Add immutable entity drafts, revision-scoped validation, structured persistence, conflict handling and explicit batch outcomes.
