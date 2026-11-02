# Accessibility integration

This reference describes the behavior of the built-in presentations and controls, together with the responsibilities of applications and extensions.

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

See the [custom renderer guide](../guide/custom-renderer.md) and [inline editing guide](../guide/inline.md) for the corresponding extension APIs.

## Standards and authoring guidance

Use [WCAG 2.2](https://www.w3.org/TR/WCAG22/) when evaluating the complete application, including custom content, styling and host behavior.

The [WAI-ARIA dialog pattern](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/) and [combobox pattern](https://www.w3.org/WAI/ARIA/apg/patterns/combobox/) provide additional guidance for custom interfaces.
