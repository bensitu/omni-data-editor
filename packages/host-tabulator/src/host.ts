import type { Tabulator, RowComponent } from 'tabulator-tables';
import { editorError } from '@omnidataeditor/core';
import type {
  EntityIdentity,
  EntityKey,
  HostConnection,
} from '@omnidataeditor/core';
import { browserFocus, browserViewport } from '@omnidataeditor/dom';
import type {
  HostEntityRef,
  PresentationCapabilities,
} from '@omnidataeditor/dom';

export interface TabulatorHostOptions<T> {
  readonly identity: EntityIdentity<T>;
  readonly index?: EntityIdentity<T>;
  readonly columns?: Readonly<Record<string, string>>;
  readonly selection?: boolean;
  readonly onExternalEntity?: (entity: T) => void;
  readonly onExternalRemoval?: (key: EntityKey) => void;
  readonly onDestroy?: () => void;
}
export interface TabulatorConnection<T> extends HostConnection<T> {
  readonly capabilities: PresentationCapabilities<T>;
}
export function tabulatorHost<T extends object>(
  table: Tabulator,
  options: TabulatorHostOptions<T>,
): TabulatorConnection<T> {
  const rows = new Map<EntityKey, RowComponent>();
  let previous = new Map<EntityKey, T>();
  let detached = false,
    reflecting = 0;
  const index = options.index ?? options.identity;
  const ensure = () => {
    if (detached)
      throw editorError(
        'host',
        'host-detached',
        'The host connection is detached.',
      );
  };
  const rebuild = (notify: boolean) => {
    const current = new Map<EntityKey, T>();
    rows.clear();
    for (const row of table.getRows()) {
      const entity = row.getData() as T,
        key = options.identity(entity);
      if (current.has(key))
        throw editorError(
          'host',
          'duplicate-entity-key',
          'Host entity keys must be unique.',
        );
      if (row.getIndex() !== index(entity))
        throw editorError(
          'configuration',
          'index-mismatch',
          'Configure an index function matching the Tabulator index field.',
        );
      current.set(key, entity);
      rows.set(key, row);
    }
    const old = previous;
    previous = current;
    if (notify && !reflecting) {
      for (const [key, entity] of current)
        if (old.get(key) !== entity) options.onExternalEntity?.(entity);
      for (const key of old.keys())
        if (!current.has(key)) options.onExternalRemoval?.(key);
    }
  };
  rebuild(false);
  const row = (key: EntityKey) => {
    ensure();
    const current = rows.get(key);
    if (!current)
      throw editorError(
        'host',
        'entity-not-found',
        'The entity is not present in the host.',
      );
    return current;
  };
  const resolve = (target: unknown): HostEntityRef<T> | null => {
    ensure();
    let key: EntityKey | undefined;
    if (typeof target === 'string' || typeof target === 'number') key = target;
    else if (target instanceof HTMLElement) {
      const element = target.closest<HTMLElement>('.tabulator-row');
      const current =
        element && table.element.contains(element)
          ? table.getRow(element)
          : undefined;
      if (current) key = options.identity(current.getData() as T);
    } else if (target && typeof target === 'object')
      key = options.identity(target as T);
    const entity = key !== undefined ? previous.get(key) : undefined;
    return entity !== undefined && key !== undefined ? { key, entity } : null;
  };
  const refresh = () => {
    if (!detached) rebuild(true);
  };
  table.on('dataProcessed', refresh);
  table.on('dataChanged', refresh);
  const subscriptions = new Set<() => void>();
  const detach = () => {
    if (detached) return;
    detached = true;
    table.off('dataProcessed', refresh);
    table.off('dataChanged', refresh);
    table.off('tableDestroyed', destroyed);
    for (const unsubscribe of subscriptions) unsubscribe();
    subscriptions.clear();
    rows.clear();
    previous.clear();
  };
  const destroyed = () => {
    detach();
    options.onDestroy?.();
  };
  table.on('tableDestroyed', destroyed);
  const hasSelection =
    options.selection ?? table.options.selectableRows !== false;
  const capabilities: PresentationCapabilities<T> = {
    binding: { resolve },
    reflection: {
      async reflectCreate(entity) {
        ensure();
        if (rows.has(options.identity(entity)) || table.getRow(index(entity)))
          throw editorError(
            'host',
            'duplicate-entity-key',
            'The canonical key or host index already exists.',
          );
        reflecting++;
        try {
          await table.addRow(entity);
          rebuild(false);
        } finally {
          reflecting--;
        }
      },
      async reflectUpdate(previous, current) {
        const source = row(options.identity(previous)),
          next = source.getNextRow(),
          selected = source.isSelected();
        const collision = table.getRow(index(current));
        if (
          (rows.has(options.identity(current)) &&
            options.identity(previous) !== options.identity(current)) ||
          (collision && collision !== source)
        )
          throw editorError(
            'host',
            'duplicate-entity-key',
            'The canonical key or host index already exists.',
          );
        reflecting++;
        try {
          await source.delete();
          const replacement = await table.addRow(
            current,
            true,
            next || undefined,
          );
          if (selected) replacement.select();
          rebuild(false);
        } finally {
          reflecting--;
        }
      },
      async reflectRemove(entity) {
        reflecting++;
        try {
          await row(options.identity(entity)).delete();
          rebuild(false);
        } finally {
          reflecting--;
        }
      },
    },
    anchor: {
      resolveFieldAnchor(entity, fieldId) {
        ensure();
        const current = rows.get(options.identity(entity));
        const cell = current?.getCell(options.columns?.[fieldId] ?? fieldId);
        const element = cell ? cell.getElement() : null;
        return element?.isConnected ? element : null;
      },
    },
    focus: browserFocus(),
    viewport: browserViewport(),
    ...(hasSelection
      ? {
          selection: {
            getSelected() {
              ensure();
              return table.getSelectedData().map((value) => {
                const entity = value as T;
                return { key: options.identity(entity), entity };
              });
            },
            subscribeSelection(listener: () => void) {
              ensure();
              table.on('rowSelectionChanged', listener);
              const unsubscribe = () => {
                table.off('rowSelectionChanged', listener);
                subscriptions.delete(unsubscribe);
              };
              subscriptions.add(unsubscribe);
              return unsubscribe;
            },
          },
        }
      : {}),
  };
  return { capabilities, resolveEntity: resolve, detach };
}
