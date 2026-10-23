# Accessibility

Native dialogs have named headings, initial focus, Escape cancellation and logical focus restoration. Form controls have labels and issue descriptions. Validation updates aria-invalid and announces a summary. Inline keeps host semantics intact and treats registered popup surfaces as part of the editing boundary. Asynchronous selection uses combobox, listbox and active descendant relationships.

Keep labels and validation messages meaningful when defining fields. Renderer extensions must preserve semantic control relationships, keyboard navigation and focus ownership. Register popup surfaces with the renderer's owned focus surface API so inline editing treats them as part of the editing boundary.

Application styling must preserve visible focus indicators, readable text, sufficient contrast and usable controls at different viewport sizes and zoom levels. Check create, edit, validation and cancellation flows with the browsers and assistive technologies your application supports, including custom renderers and virtualized hosts.

WCAG 2.2 AA is the design target. Accessibility conformance depends on the complete application and is not established by using this library alone.
