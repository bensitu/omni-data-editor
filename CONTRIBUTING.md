# Contributing

Use Node 24 and the pnpm version recorded in package.json. Install with the frozen lockfile and build before running tests that consume package exports. Run `pnpm verify` before submitting a pull request.

Keep core independent of browser, framework and host packages. Extend behavior through fields, renderers, presentations, host capabilities and persistence ports. Preserve canonical data, immutable entity semantics, revision scoped validation and uncertain mutation reconciliation.

Use English for comments and descriptive terminology for public interfaces. Add focused behavior tests for consequential changes. Update the relevant usage guides and add a Changeset when a change affects package consumers. Exclude credentials, generated output and machine-specific configuration from contributions.

Describe the problem, the resulting behavior and the relevant validation in each pull request. Keep unrelated changes in separate pull requests.

Package versions and changelogs are managed with Changesets. All public packages use synchronized versions. Version updates should include the generated package changelogs; npm publication uses the reviewed archives attached to a published GitHub release.
