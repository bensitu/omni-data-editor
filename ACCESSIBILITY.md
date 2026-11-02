# Accessibility

OmniDataEditor provides a headless editing engine, native form controls, dialog and inline presentations, and integrations with existing table interfaces. Accessibility depends on these components and on the application that supplies content, styling, navigation and persistence.

[WCAG 2.2 Level AA](https://www.w3.org/TR/WCAG22/) is the design target. This document describes implemented behavior and integration responsibilities; it is not an independent conformance assessment of the library or an application using it.

Implementation details, keyboard interactions and application responsibilities are documented in the [accessibility integration reference](docs/reference/accessibility.md).

## Verification and limitations

The existing browser tests cover focus restoration, cancellation, control state and popup focus boundaries. End-to-end tests run in Chromium, Firefox and WebKit, with axe checks for selected example pages and dialogs.

Automated checks cover the tested examples and states. They do not establish compatibility with every screen reader, browser, theme or host configuration. Before shipping an application, manually check keyboard-only use and representative screen reader combinations, including validation, asynchronous loading, saving, conflicts and cancellation. The project does not publish a verified screen reader compatibility matrix.

## Reporting an accessibility problem

Follow the [support guide](SUPPORT.md). Include the affected package version, browser, operating system and assistive technology when relevant, together with reproduction steps and the expected and actual behavior. A small example using synthetic data is useful. Remove personal information and credentials from examples, logs and screenshots.

Describe the accessibility barrier and the interaction it prevents; no medical or disability information is required. Report security-sensitive details using the [security policy](SECURITY.md).
