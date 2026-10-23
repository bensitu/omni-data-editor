# Renderer authoring

A field definition contains domain accessors, validators and a renderer key. A renderer factory receives that definition, a cancellation signal, semantic input reporting and optional owned focus surface registration. It owns controls and temporary raw input.

Register extensions with a scoped key using `createRendererRegistry`. Native short keys are reserved; duplicate keys fail. Factories receive unknown values at the registry boundary, so validate or narrow them before calling domain specific formatting code. The asynchronous selection package demonstrates an explicit `isValue` type predicate and typed option configuration.

Implement setValue, setDisabled, setReadOnly, setVisible, setIssues and idempotent destroy. Focus and setMixed are optional display commands. A mixed display is distinct from a semantic value; never submit a placeholder. Successfully parsed input calls `reportInput({ kind: 'input', value })`. A deliberate selection may use commit; both update the draft immediately.

Keep unfinished numeric, date or search input local and use native validity to prevent submission. Render labels and issues as text. Provide label associations, aria-invalid, described errors and visible focus. Readonly must prevent semantic changes without imitating disabled.

Register every owned popup surface and unregister it on disposal. Abort query work and remove listeners and timers when the signal aborts. Factories must be safe to import on the server; browser globals belong in create or mount. Run persistent browser behavior tests against the public package exports.
