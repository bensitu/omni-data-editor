import { expect, it, vi } from 'vitest';
import { createEditor, textField, numberField } from '@omnidataeditor/core';
import { dialog } from '@omnidataeditor/presentation-dialog';
it('submits explicit overrides from a dialog without replacing untouched mixed names', async () => {
  type Entity = { id: number; name: string; salary: number };
  const fields = [
    textField<Entity>('name', { required: true }),
    numberField<Entity>('salary'),
  ];
  const updateMany = vi.fn(
    async ({
      changes,
    }: {
      changes: {
        entities: readonly { key: string | number; candidate: Entity }[];
      };
    }) => ({
      atomicity: 'atomic' as const,
      items: changes.entities.map((entity) => ({
        key: entity.key,
        outcome: { ok: true as const, entity: entity.candidate },
      })),
    }),
  );
  const editor = createEditor({
    fields,
    identity: (entity: Entity) => entity.id,
    batchPersistence: { updateMany },
  });
  editor.use(dialog({ fields }));
  const session = editor.editMany([
    { id: 1, name: 'Ada', salary: 10 },
    { id: 2, name: 'Grace', salary: 10 },
  ]);
  const input = document.querySelector<HTMLInputElement>(
    '[inputmode=decimal]',
  )!;
  input.value = '20';
  input.dispatchEvent(new Event('input', { bubbles: true }));
  document.querySelector<HTMLFormElement>('form')!.requestSubmit();
  await vi.waitFor(() => expect(session.snapshot().phase).toBe('committed'));
  expect(
    updateMany.mock.calls[0]?.[0].changes.entities.map(
      (entity) => entity.candidate.name,
    ),
  ).toEqual(['Ada', 'Grace']);
  await editor.destroy();
});
