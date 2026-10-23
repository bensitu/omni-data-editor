# Compatibility

## Browsers and runtime environments

The intended browser policy is current stable plus the previous two major releases in the Chromium, Firefox and Safari families. Native presentations require a browser with DOM, dialog, focus and cancellation APIs. Applications should verify their browser and assistive technology combinations, especially when using custom renderers or virtualized hosts.

Public packages use ESM exports. JavaScript entry points can be imported in server environments; constructing native controls requires a browser. Import theme CSS explicitly in client entry points. Core has no runtime dependencies and does not require browser libraries.

The repository uses Node 24 and the pnpm version recorded in package.json for development. Source deep imports, CommonJS entry points and global script bundles are outside the public interface.

## Entity and host requirements

Supply a stable identity when connecting existing entities to hosts. Mutable class models need explicit immutable accessors. Do not mutate supplied baselines or nested field values. Hosts that mutate data in place should keep independent immutable editing entities.

Inline editing requires an available field anchor and focus capabilities. Offscreen virtualized anchors need application activation before inline editing. Search, sorting, filtering and pagination remain responsibilities of the host application.

Applications provide server authorization, concurrency preconditions, idempotency and authoritative reconciliation. Abort signals isolate stale work; they do not imply that a dispatched mutation was rolled back. See [persistence](./guide/persistence.md) and [conflicts](./guide/conflicts.md).

## Package versions

All public packages use synchronized versions. During 0.x, public interfaces may change between minor releases. Use compatible versions of the editor, presentations, hosts, renderers and theme.

Documented public exports are the supported integration boundary. Source deep imports have no compatibility guarantee.
