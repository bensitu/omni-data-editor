# Contributing

Use Node 24 and the pnpm version recorded in package.json. Install with the frozen lockfile and build before running tests that consume package exports. Run `pnpm verify` before submitting a pull request.

Keep core independent of browser, framework and host packages. Extend behavior through fields, renderers, presentations, host capabilities and persistence ports. Preserve canonical data, immutable entity semantics, revision scoped validation and uncertain mutation reconciliation.

Use English for comments and descriptive terminology for public interfaces. Add focused behavior tests for consequential changes. Update the relevant usage guides and add a Changeset when a change affects package consumers. Exclude credentials, generated output and machine-specific configuration from contributions.

Describe the problem, the resulting behavior and the relevant validation in each pull request. Keep unrelated changes in separate pull requests.

Package versions and changelogs are managed with Changesets. All public packages use synchronized versions. Version updates should include the generated package changelogs; npm publication uses the reviewed archives attached to a published GitHub release.

## Changelog and versioning

The root [CHANGELOG.md](CHANGELOG.md) is a curated project summary following [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Add notable changes to `Unreleased`, grouped under the applicable `Added`, `Changed`, `Deprecated`, `Removed`, `Fixed` or `Security` heading. Keep entries useful to users and describe behavior rather than copying commit messages. Omit empty categories.

At release time, move the relevant entries into a version section with the actual release date in `YYYY-MM-DD` format and update the comparison links. Package-specific changelogs remain managed by Changesets; the root changelog complements those generated records.

Versions follow [Semantic Versioning](https://semver.org/spec/v2.0.0.html). For stable releases, incompatible public API changes require a major update, compatible additions require a minor update, and compatible corrections require a patch update. During 0.x, the public API is still evolving: use minor updates for incompatible changes and patch updates for compatible corrections. Document migration requirements whenever compatibility changes. Do not modify the contents of an already published package version.

## Community and reporting

Participation follows the [code of conduct](CODE_OF_CONDUCT.md). Use the [support guide](SUPPORT.md) for questions and issue reporting. Report vulnerabilities privately according to [SECURITY.md](SECURITY.md).
