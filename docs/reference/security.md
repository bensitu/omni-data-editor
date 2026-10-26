# Security design

Automatic property access rejects prototype related names, unsupported segment types and invalid array indices. Field writes create new containers along the registered path. Custom models use explicit application accessors.

Built in DOM controls render values, labels, options and issues as text. Renderer extensions should preserve that boundary and provide an explicit sanitization contract if they introduce HTML content. Default error messages omit stacks, request objects and raw transport responses.

Runtime diagnostics contain identifiers and stable error codes rather than automatic entity logging. Observer and logger exceptions are isolated from command results. Abort signals isolate stale results but do not establish server rollback or replace server idempotency and authorization.

Applications remain responsible for authentication, authorization, transport security and server-side validation. Treat renderer extensions and custom persistence adapters as application code, and avoid including credentials or sensitive entity data in diagnostics.
