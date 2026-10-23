import { createEditor, textField } from '@omnidataeditor/core';
import { dialog } from '@omnidataeditor/presentation-dialog';
import { createRendererRegistry } from '@omnidataeditor/dom';
import assert from 'node:assert/strict';
const fields = [textField('name')];
const editor = createEditor({
  fields,
  persistence: {
    update: async (request) => ({ ok: true, entity: request.candidate }),
  },
});
const session = editor.edit({ name: 'Ada' });
session.set('name', 'Grace');
assert.equal((await session.submit()).status, 'committed');
assert.equal(typeof dialog, 'function');
assert.equal(typeof createRendererRegistry, 'function');
await editor.destroy();
console.log('Packed Node ESM imports and headless editing passed.');
