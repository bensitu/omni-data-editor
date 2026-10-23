import React from 'react';
import { createEditor, textField } from '@omnidataeditor/core';
import { dialog } from '@omnidataeditor/presentation-dialog';
import { createRendererRegistry } from '@omnidataeditor/dom';
export default function Page() {
  const editor = createEditor({ fields: [textField('name')] });
  const session = editor.edit({ name: 'Server import' });
  session.cancel();
  void editor.destroy();
  return React.createElement(
    'p',
    null,
    `${session.snapshot().phase}: ${typeof dialog}, ${typeof createRendererRegistry}`,
  );
}
