# Standalone editing

```ts
import { createEditor, textField } from '@omnidataeditor/core';

type Employee = { id: number; name: string };
const fields = [textField<Employee>('name', { required: true })];
const editor = createEditor<Employee>({
  fields,
  identity: (entity) => entity.id,
  persistence: {
    async update(request, context) {
      const response = await fetch(`/employees/${request.original.id}`, {
        method: 'PUT',
        signal: context.signal,
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': context.clientMutationId,
        },
        body: JSON.stringify(request.candidate),
      });
      if (!response.ok) {
        return {
          ok: false,
          kind: 'transport',
          retryable: true,
          certainty: 'unknown',
        };
      }
      return { ok: true, entity: await response.json() };
    },
  },
});
const session = editor.edit({ id: 1, name: 'Ada' });
session.set('name', 'Grace');
await session.submit();
await editor.destroy();
```

Supply semantic values to `set`. Built in helpers reject values of the wrong primitive type. Use `field` with explicit accessors for custom class models. Entity values are treated as immutable; applications must not mutate shared baselines or nested field values during editing.

Create requires `editor.create({ initial })` or `createInitial`. Remove, hosts, multiple entity editing and external notifications require stable identity. One editor holds one active session. After an uncertain mutation, a new session may remain opening while authoritative reconciliation resolves its baseline.
