# Accessibility

OmniDataEditor provides a headless editing engine, native form controls, dialog and inline presentations, and integrations with existing table interfaces. Accessibility depends on these components and on the application that supplies content, styling, navigation and persistence.

[WCAG 2.2 Level AA](https://www.w3.org/TR/WCAG22/) is the design target. This document describes implemented behavior and integration responsibilities; it is not an independent conformance assessment of the library or an application using it.

## Built-in support

- Native field renderers associate labels with controls and connect field issues through `aria-describedby`. Validation updates `aria-invalid`, while form summaries and conflict messages use status and alert semantics.
- The dialog presentation uses the native HTML `dialog` element, associates its heading with the dialog, moves focus into the form and attempts to restore the previous focus when closed.
- Inline editing preserves the host interface's semantics and supports explicit focus boundaries. Custom popup surfaces can be registered as belonging to the editor.
- Asynchronous selection exposes combobox, listbox and option relationships, tracks the active option with `aria-activedescendant`, and provides loading, result and error status messages.

## Keyboard interaction

| Context                            | Interaction                                                                                                                                      |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Native controls and action buttons | `Tab` and `Shift+Tab` follow the focus order. Native controls retain their standard browser keyboard behavior.                                   |
| Modal dialog                       | The browser manages focus containment. `Escape` cancels by default; the Cancel button provides an explicit cancellation action.                  |
| Inline editor                      | `Escape` cancels when the focused control has not handled the key. Moving outside the editing boundary follows the configured boundary behavior. |
| Asynchronous selection             | `ArrowDown` and `ArrowUp` open the option list or move among enabled options. `Enter` selects the active option when the list is open.           |
| Open option list or pending search | `Escape` closes the list or cancels the search before the containing presentation handles cancellation. `Tab` moves focus normally.              |

Applications that disable dialog cancellation with `Escape` must retain an accessible way to close the dialog. Focus restoration requires the previous target to remain available; applications should provide a logical next focus target when rows or controls are removed.

## Application and extension requirements

Provide meaningful field labels, dialog titles and validation messages in the application's language. Preserve visible focus indicators, readable text and sufficient contrast when customizing styles. Check zoom, narrow viewports, high contrast settings and control target sizes in the complete interface.

Table navigation, row selection, pagination and virtualized content remain responsibilities of the host interface and its application. Custom renderers and presentations must preserve accessible names, error relationships, keyboard operation and focus ownership. Register popup focus surfaces so that interacting with them does not unexpectedly leave an inline editing boundary.

See the [accessibility reference](docs/reference/accessibility.md), [custom renderer guide](docs/guide/custom-renderer.md) and [inline editing guide](docs/guide/inline.md) for integration guidance.

## Verification and limitations

The existing browser tests cover focus restoration, cancellation, control state and popup focus boundaries. End-to-end tests run in Chromium, Firefox and WebKit, with axe checks for selected example pages and dialogs.

Automated checks cover the tested examples and states. They do not establish compatibility with every screen reader, browser, theme or host configuration. Before shipping an application, manually check keyboard-only use and representative screen reader combinations, including validation, asynchronous loading, saving, conflicts and cancellation. The project does not publish a verified screen reader compatibility matrix.

The [WAI-ARIA dialog pattern](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/) and [combobox pattern](https://www.w3.org/WAI/ARIA/apg/patterns/combobox/) provide additional guidance for custom interfaces.

## Reporting an accessibility problem

Follow the [support guide](SUPPORT.md). Include the affected package version, browser, operating system and assistive technology when relevant, together with reproduction steps and the expected and actual behavior. A small example using synthetic data is useful. Remove personal information and credentials from examples, logs and screenshots.

Describe the accessibility barrier and the interaction it prevents; no medical or disability information is required. Report security-sensitive details using the [security policy](SECURITY.md).
