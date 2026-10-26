# Security policy

## Supported versions

Security fixes target the latest development line. During 0.x, earlier minor versions should not be assumed to receive backports. Include the exact package versions in a report and check whether the problem also affects the current source or latest published version.

## Reporting a vulnerability

Do not report vulnerabilities through public issues, pull requests or discussion comments. Do not publish exploit details, credentials, private entity data or information about affected people.

Visit the repository's [Security tab](https://github.com/bensitu/omni-data-editor/security). If private vulnerability reporting is available, use **Report a vulnerability**. Otherwise, use a private contact method explicitly published by a maintainer. If no private channel is available, open a minimal [issue](https://github.com/bensitu/omni-data-editor/issues/new) requesting a private reporting channel, without describing the vulnerability or identifying affected systems.

A private report should include:

- Affected packages, versions and relevant runtime or host versions.
- A description of the impact and the conditions required to trigger the problem.
- Minimal reproduction steps or a small example using synthetic data.
- Any known workaround or suggested correction.

Coordinate public disclosure with the maintainers so a correction and upgrade guidance can be prepared. Response times depend on maintainer availability.

## Application responsibilities

Applications provide authentication, authorization, server-side validation, concurrency controls and idempotency. Field visibility, disabled controls and read-only presentation are not authorization mechanisms. Custom renderers must preserve safe rendering and appropriate focus ownership. See the [security guide](docs/security.md) for integration boundaries.
