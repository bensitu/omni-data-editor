# @omnidataeditor/field-async-select

Independent asynchronous option selection with cancellable queries.

```ts
import {
  asyncSelectField,
  createAsyncSelectRenderer,
} from '@omnidataeditor/field-async-select';
```

Configure a typed renderer source and register the scoped renderer key. Queries debounce, receive cancellation signals and reject stale results.

Part of OmniDataEditor. ESM distribution under the MIT license. See the [documentation](https://bensitu.github.io/omni-data-editor/) and [asynchronous selection guide](https://bensitu.github.io/omni-data-editor/guide/async-select).
