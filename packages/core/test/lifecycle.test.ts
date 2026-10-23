import { expect, it, vi } from 'vitest';
import { createEditor, textField } from '../src/index.js';

it('waits for a presentation mount and any disposal already started by its owner', async () => {
  let mounted!: () => void, cleaned!: () => void;
  const mounting = new Promise<void>((resolve) => {
    mounted = resolve;
  });
  const cleanup = new Promise<void>((resolve) => {
    cleaned = resolve;
  });
  const destroy = vi.fn(() => cleanup);
  const editor = createEditor({
    fields: [textField<{ name: string }>('name')],
  });
  const dispose = editor.use({
    requiredCapabilities: [],
    mount: () => mounting,
    destroy,
  });
  editor.edit({ name: 'Ada' });
  const disposing = dispose();
  const completion = vi.fn();
  const closing = editor.destroy().then(completion);
  cleaned();
  await Promise.resolve();
  expect(completion).not.toHaveBeenCalled();
  mounted();
  await disposing;
  await closing;
  expect(destroy).toHaveBeenCalledTimes(2);
});

it('does not mount a session cancelled by an observer and isolates logger failures', async () => {
  const mount = vi.fn(),
    createInitial = vi.fn(() => ({ name: 'Ada' }));
  const editor = createEditor({
    fields: [textField<{ name: string }>('name')],
    createInitial,
    logger: {
      log() {
        throw new Error('Unavailable logger');
      },
    },
  });
  editor.use({ requiredCapabilities: [], mount, destroy() {} });
  const session = editor.edit({ name: 'Ada' });
  session.subscribe(() => {
    throw new Error('Observer unavailable');
  });
  expect(session.set('name', 'Grace').status).toBe('ok');
  session.cancel();
  editor.on('session:opened', () => {
    void editor.destroy();
  });
  editor.edit({ name: 'Ada' });
  expect(mount).toHaveBeenCalledTimes(1);
  await editor.destroy();
  expect(() => editor.create()).toThrow(/destroyed/);
  expect(createInitial).not.toHaveBeenCalled();
});

it('supports hosted creation before server identity exists and rejects inconsistent business keys', async () => {
  type Entity = { id?: number; name: string };
  const fields = [textField<Entity>('name')];
  const editor = createEditor<Entity>({
    fields,
    identity: (entity) => entity.id!,
  });
  editor.attach({
    capabilities: {},
    resolveEntity: (target) => ({ key: 99, entity: target as Entity }),
    detach() {},
  });
  const session = editor.create({ initial: { name: 'New' } });
  expect(session.snapshot().phase).toBe('editing');
  session.cancel();
  expect(() => editor.edit({ id: 1, name: 'Ada' })).toThrow(
    /same business key/,
  );
  await editor.destroy();
});
