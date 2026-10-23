import { expect, it } from 'vitest';
import type { HostConnection } from '@omnidataeditor/core';
import type { PresentationCapabilities } from '@omnidataeditor/dom';
export type Entity = { id: number; name: string; obsolete?: boolean };
export interface HostHarness {
  readonly connection: HostConnection<Entity> & {
    readonly capabilities: PresentationCapabilities<Entity>;
  };
  data(key: number): Entity | undefined;
  select(key: number): void;
  refresh(entity: Entity): Promise<void>;
  reorder(): Promise<void>;
  dispose(): Promise<void>;
}
export function hostContract(
  name: string,
  createHarness: (notify: (entity: Entity) => void) => Promise<HostHarness>,
): void {
  it(`${name} binds stable identity, reflects full canonical data and releases subscriptions`, async () => {
    const notified: Entity[] = [],
      harness = await createHarness((entity) => notified.push(entity));
    try {
      const { capabilities } = harness.connection;
      expect(capabilities.binding?.resolve(1)).toMatchObject({
        key: 1,
        entity: { name: 'Ada' },
      });
      let selections = 0;
      const unsubscribe = capabilities.selection!.subscribeSelection(
        () => selections++,
      );
      harness.select(1);
      expect(capabilities.selection!.getSelected()).toMatchObject([{ key: 1 }]);
      expect(selections).toBeGreaterThan(0);
      unsubscribe();
      const count = selections;
      harness.select(2);
      expect(selections).toBe(count);
      await capabilities.reflection!.reflectUpdate(harness.data(1)!, {
        id: 1,
        name: 'Canonical',
      });
      expect(harness.data(1)).toEqual({ id: 1, name: 'Canonical' });
      expect(notified).toEqual([]);
      await harness.reorder();
      expect(
        capabilities.anchor?.resolveFieldAnchor(harness.data(1)!, 'name'),
      ).toBeInstanceOf(HTMLElement);
      await capabilities.reflection!.reflectCreate({ id: 3, name: 'Created' });
      expect(harness.data(3)?.name).toBe('Created');
      await harness.refresh({ id: 1, name: 'Remote' });
      expect(notified).toContainEqual({ id: 1, name: 'Remote' });
      await capabilities.reflection!.reflectUpdate(harness.data(3)!, {
        id: 4,
        name: 'New identity',
      });
      expect(harness.data(3)).toBeUndefined();
      expect(harness.data(4)?.name).toBe('New identity');
      await capabilities.reflection!.reflectRemove(harness.data(4)!);
      expect(harness.data(4)).toBeUndefined();
      await harness.connection.detach();
      await harness.connection.detach();
      await expect(
        capabilities.reflection!.reflectCreate({ id: 8, name: 'Late' }),
      ).rejects.toThrow(/detached/);
    } finally {
      await harness.dispose();
    }
  });
}
