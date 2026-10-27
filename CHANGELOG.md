# Changelog

Notable project changes are recorded in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

Planned version: 0.1.1.

### Fixed

- Keep multiple-entity draft values consistent with canonical results and conflict decisions.
- Support empty semantic values in built-in fields and validate select configuration.
- Publish and reflect authoritative create results, preserve batch response diagnostics, and renew mutation identifiers after definitive conflict decisions.
- Reuse derived draft data within each revision and index batch results by entity identity.
- Clarify recoverable submission failures and terminal session behavior while retaining legacy state types for compatibility.
- Validate form configuration, preserve host contents on presentation failures, and apply cleared native control values.
- Share batch predicate values, localize form messages, and handle asynchronous submission failures.
- Bound asynchronous option label retention, improve keyboard interaction, and constrain option and dialog layouts.
- Preserve external host notifications during asynchronous reflection, refresh DataTables identity and column mappings, and activate local pages or virtual rows before inline editing.

## [0.1.0] - 2026-10-27

### Added

- Initial public release of the nine-package TypeScript editing library.
- Headless entity creation, editing, removal and multiple-entity sessions with immutable drafts.
- Revision-scoped validation, Standard Schema integration, structured persistence and uncertain-result reconciliation.
- Explicit conflict resolution, canonical entity reflection and per-entity batch outcomes.
- Native dialog and inline presentations, semantic field renderers and an optional default theme.
- DataTables and Tabulator adapters with stable identity, selection and field anchors.
- Cancellable asynchronous selection with keyboard interaction and accessible control relationships.
- Interactive team directory, focused examples, usage guides and generated API documentation.
- Public repository metadata, package changelogs and provenance publication settings for all nine packages.
