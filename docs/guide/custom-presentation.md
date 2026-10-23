# Presentation authoring

Implement a factory returning a Presentation with requiredCapabilities, mount and destroy. The context exposes snapshots, subscriptions, synchronous command dispatch, validation, submission and an opaque capability bag. Narrow that bag to checked capabilities at the DOM boundary.

Field configuration is supplied to the presentation factory. `createEditorForm(context, { fields, registry })` supplies reusable controls, actions, issues and owned focus surfaces. A presentation can also bind commands to its own interface without using this form.

Mount subscribes to immutable snapshots. Dispatch set, reset, cancel and conflict decisions; call validate and submit as separate asynchronous operations. A presentation never calls persistence or changes baselines. Honor silent external change policy when rendering conflicts. Batch results expose per entity outcomes independently from a single committed entity.

Use capability requirements for anchor, focus or viewport dependencies. Missing requirements must fail before interacting with a host. Restore focus to a connected logical trigger, cancel when an editing anchor disappears and await renderer cleanup. Destroy is idempotent and must also handle cleanup while asynchronous mounting is outstanding.
