# @omnidataeditor/field-async-select

Independent asynchronous option selection with cancellable queries.

```ts
import {
  asyncSelectField,
  createAsyncSelectRenderer,
} from '@omnidataeditor/field-async-select';
```

Configure a typed renderer source and register the scoped renderer key. Queries debounce, receive cancellation signals and reject stale results.

Part of OmniDataEditor. ESM distribution under the MIT license. Usage and integration documentation is available in the source repository's docs directory.
