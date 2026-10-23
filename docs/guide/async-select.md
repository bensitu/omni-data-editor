# Asynchronous selection

Install `@omnidataeditor/field-async-select` separately. Configure a renderer factory and register its scoped key. The field helper supplies entity accessors; the renderer supplies query behavior.

```ts
import { createRendererRegistry } from '@omnidataeditor/dom';
import {
  asyncSelectField,
  asyncSelectRendererKey,
  createAsyncSelectRenderer,
} from '@omnidataeditor/field-async-select';
type Employee = { office: string };
const fields = [asyncSelectField<Employee>('office', { label: 'Office' })];
const registry = createRendererRegistry();
registry.register(
  asyncSelectRendererKey,
  createAsyncSelectRenderer({
    isValue: (value): value is string => typeof value === 'string',
    getKey: (value) => value,
    async load(query, { signal }) {
      const response = await fetch(`/offices?q=${encodeURIComponent(query)}`, {
        signal,
      });
      if (!response.ok) throw new Error('Options unavailable.');
      return response.json();
    },
  }),
);
```

Pass this registry and the same fields to dialog or inline options. Different sources can use separately configured scoped renderer keys. Query results contain value, label and optional disabled. Keys must be stable and unique. Provide a value type predicate and, when needed, formatValue for initial canonical values not yet seen in query results. Nested fields require explicit immutable read and write accessors.

The default debounce is 200 milliseconds. Queries receive AbortSignal, and operation identity isolates results when a source ignores cancellation. Loading, empty and error states use safe text. Arrow keys move the active option; Enter selects; Escape closes suggestions before cancelling the editor. Raw search text does not become an entity value, and unmatched input blocks form submission.

The listbox is an owned focus surface inside the field, so it works within native modal dialogs. Cleanup cancels timers, queries and listeners. SSR imports do not access browser globals.
