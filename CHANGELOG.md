# Changelog

Notable project changes are recorded in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Public repository metadata, package changelogs and provenance publication settings for all nine packages.
- GitHub Release drafts containing package archives, a source manifest and integrity checksums.
- npm publication of the original release archives with integrity verification and support for retrying partially completed publication.
- GitHub Pages delivery for the documentation, API reference and interactive examples.
- Project changelog, security policy, support guidance, community code of conduct and contribution templates.

### Changed

- Continuous integration runs on both `main` and `develop` pushes, as well as pull requests.
- Package version updates use Changesets with synchronized versions and package changelogs.

## [0.1.0] - 2026-10-24

### Added

- Initial public source release of the nine-package TypeScript editing library.
- Headless entity creation, editing, removal and multiple-entity sessions with immutable drafts.
- Revision-scoped validation, Standard Schema integration, structured persistence and uncertain-result reconciliation.
- Explicit conflict resolution, canonical entity reflection and per-entity batch outcomes.
- Native dialog and inline presentations, semantic field renderers and an optional default theme.
- DataTables and Tabulator adapters with stable identity, selection and field anchors.
- Cancellable asynchronous selection with keyboard interaction and accessible control relationships.
- Interactive team directory, focused examples, usage guides and generated API documentation.

[Unreleased]: https://github.com/bensitu/omni-data-editor/compare/0307b933bfb3bfd1ada85afe291a939a03092497...HEAD
[0.1.0]: https://github.com/bensitu/omni-data-editor/commit/0307b933bfb3bfd1ada85afe291a939a03092497
