# Contributing

Use Node 24 and the pnpm version recorded in package.json. Install with the frozen lockfile and build before running tests that consume package exports. Run `pnpm verify` before submitting a pull request.

```sh
pnpm install --frozen-lockfile
pnpm build
pnpm dev
```

The development server includes the team directory at `/showcase/` and focused integration examples. See the [playground guide](docs/guide/playground.md) for details. User-facing guides and reference material are indexed in [docs/index.md](docs/index.md).

`pnpm verify` checks formatting, lint, types, behavior, package distribution, consumer builds and documentation. Use the relevant individual commands during development. `pnpm docs:api` generates the API reference, `pnpm docs:build` builds the documentation, and `pnpm package:pages` builds the combined documentation and examples site.

CI runs source and package checks alongside browser integration tests. Browser tests use the official Playwright container, including its browser binaries and system dependencies. Update the container version and digest in `.github/workflows/checks.yml` when updating Playwright. Release drafts reuse these same checks before preparing archives.

Keep core independent of browser, framework and host packages. Extend behavior through fields, renderers, presentations, host capabilities and persistence ports. Preserve canonical data, immutable entity semantics, revision scoped validation and uncertain mutation reconciliation.

Use English for comments and descriptive terminology for public interfaces. Add focused behavior tests for consequential changes. Update the relevant usage guides and add a Changeset when a change affects package consumers. Exclude credentials, generated output and machine-specific configuration from contributions.

Describe the problem, the resulting behavior and the relevant validation in each pull request. Keep unrelated changes in separate pull requests.

Package versions and changelogs are managed with Changesets. All public packages use synchronized versions. Version updates should include the generated package changelogs; npm publication uses the reviewed archives attached to a published GitHub release.

## Changelog and versioning

The root [CHANGELOG.md](CHANGELOG.md) is a curated project summary following [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Add notable changes to `Unreleased`, grouped under the applicable `Added`, `Changed`, `Deprecated`, `Removed`, `Fixed` or `Security` heading. Keep entries useful to users and describe behavior rather than copying commit messages. Omit empty categories.

At release time, move the relevant entries into a version section with the actual release date in `YYYY-MM-DD` format and update the comparison links. Package-specific changelogs remain managed by Changesets; the root changelog complements those generated records.

GitHub release drafts use the corresponding root changelog entry for every version.

Versions follow [Semantic Versioning](https://semver.org/spec/v2.0.0.html). For stable releases, incompatible public API changes require a major update, compatible additions require a minor update, and compatible corrections require a patch update. During 0.x, the public API is still evolving: use minor updates for incompatible changes and patch updates for compatible corrections. Document migration requirements whenever compatibility changes. Do not modify the contents of an already published package version.

## Community and reporting

Participation follows the [code of conduct](CODE_OF_CONDUCT.md). Use the [support guide](SUPPORT.md) for questions and issue reporting. Report vulnerabilities privately according to [SECURITY.md](SECURITY.md).

## Release publication

Create a release draft from the verified source on `main`. The build signs provenance for the package archives before attaching them to the release. Review the notes and attachments, then publish the GitHub release. The `published` release event automatically starts npm publication from the release tag using trusted publishing. Draft creation, release edits and pushes to `main` do not publish packages.

The `npm` GitHub environment must allow tags matching `v*`. Configure the trusted publisher on each npm package with repository `bensitu/omni-data-editor`, workflow `publish-npm.yml` and environment `npm`. These settings apply to subsequent versions without adding individual tag rules. Stable versions use `latest`; prerelease identifiers `alpha`, `beta` and `rc` use their corresponding distribution tags, and other prerelease identifiers use `next`.

Publication verifies the source commit, archive integrity and signed build provenance from the release workflow. It publishes the original archives and repairs matching distribution tags when retrying an interrupted publication. Rerun a failed publication from its Actions run. For a separate manual retry, select the matching `vX.Y.Z` tag as the workflow source, enter the version and leave the distribution tag set to `auto` unless an explicit channel is needed. New npm packages require the manual `npm-token` authentication option with an `NPM_TOKEN` secret in the `npm` environment until trusted publishing can be configured.

Documentation deployment waits for the shared source and browser checks and completes without cancelling an active Pages deployment. The documentation toolchain uses scoped dependency overrides; update them together with the lockfile and verify the documentation build.
