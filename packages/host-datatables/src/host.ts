import type { Api, ApiRowMethods } from 'datatables.net';
import { editorError } from '@omnidataeditor/core';
import type {
  EntityIdentity,
  EntityKey,
  HostConnection,
} from '@omnidataeditor/core';
import { browserFocus, browserViewport } from '@omnidataeditor/dom';
import type {
  PresentationCapabilities,
  HostEntityRef,
} from '@omnidataeditor/dom';

export interface DataTablesHostOptions<T> {
  readonly identity: EntityIdentity<T>;
  readonly columns?: Readonly<Record<string, number>>;
  readonly selection?: boolean;
  readonly dataScope?: 'complete' | 'window';
  readonly onExternalEntity?: (entity: T) => void;
  readonly onExternalRemoval?: (key: EntityKey) => void;
  readonly onDestroy?: () => void;
}
export interface DataTablesConnection<T> extends HostConnection<T> {
  readonly capabilities: PresentationCapabilities<T>;
  refresh(): void;
}
let nextConnection = 0;
export function dataTablesHost<T extends object>(
  table: Api<T>,
  options: DataTablesHostOptions<T>,
): DataTablesConnection<T> {
  const namespace = `.omnidataeditor${++nextConnection}`;
  let indices = new Map<EntityKey, number>();
  let previous = new Map<EntityKey, T>();
  let detached = false,
    reflecting = 0;
  const expected = new Map<EntityKey, T | undefined>();
  let references: T[] = [],
    rowIndices: number[] = [];
  const ensure = () => {
    if (detached)
      throw editorError(
        'host',
        'host-detached',
        'The host connection is detached.',
      );
  };
  const rebuild = (notify: boolean) => {
    if (reflecting) return;
    const data = table.rows().data().toArray();
    const positions = table.rows().indexes().toArray();
    if (
      data.length === references.length &&
      data.every(
        (entity, i) =>
          entity === references[i] && positions[i] === rowIndices[i],
      )
    ) {
      expected.clear();
      return;
    }
    const current = new Map<EntityKey, T>();
    const nextIndices = new Map<EntityKey, number>();
    data.forEach((entity, i) => {
      const key = options.identity(entity);
      if (current.has(key))
        throw editorError(
          'host',
          'duplicate-entity-key',
          'Host entity keys must be unique.',
        );
      current.set(key, entity);
      nextIndices.set(key, positions[i]!);
    });
    indices = nextIndices;
    references = data;
    rowIndices = positions;
    const old = previous;
    previous = current;
    if (notify && !reflecting) {
      for (const [key, entity] of current)
        if (old.get(key) !== entity && expected.get(key) !== entity)
          options.onExternalEntity?.(entity);
      for (const key of old.keys())
        if (
          !current.has(key) &&
          !expected.has(key) &&
          (options.dataScope ??
            (table.page.info().serverSide ? 'window' : 'complete')) ===
            'complete'
        )
          options.onExternalRemoval?.(key);
    }
    expected.clear();
  };
  rebuild(false);
  const row = (key: EntityKey): ApiRowMethods<T> => {
    ensure();
    rebuild(true);
    const index = indices.get(key);
    if (index === undefined)
      throw editorError(
        'host',
        'entity-not-found',
        'The entity is not present in the host.',
      );
    return table.row(index);
  };
  const resolve = (target: unknown): HostEntityRef<T> | null => {
    ensure();
    rebuild(true);
    if (typeof target === 'string' || typeof target === 'number') {
      const entity = previous.get(target);
      return entity ? { key: target, entity } : null;
    }
    if (target instanceof HTMLElement) {
      const element = target.closest('tr');
      if (!element || !table.table().node().contains(element)) return null;
      const entity: T | undefined = table.row(element).data();
      return entity === undefined
        ? null
        : { key: options.identity(entity), entity };
    }
    if (target !== null && typeof target === 'object') {
      const key = options.identity(target as T),
        entity = previous.get(key);
      return entity === undefined ? null : { key, entity };
    }
    return null;
  };
  const draw = () => {
    if (!detached) rebuild(true);
  };
  table.on(`draw${namespace}`, draw);
  const subscriptions = new Set<() => void>();
  const detach = () => {
    if (detached) return;
    detached = true;
    table.off(namespace);
    for (const unsubscribe of subscriptions) unsubscribe();
    subscriptions.clear();
    indices.clear();
    previous.clear();
  };
  table.on(`destroy${namespace}`, () => {
    detach();
    options.onDestroy?.();
  });
  const select = (table as Api<T> & { select?: { style?: () => string } })
    .select;
  const style =
    typeof select?.style === 'function' ? select.style() : undefined;
  const hasSelection =
    options.selection ??
    (style !== undefined && !['api', 'none'].includes(style));
  if (hasSelection && style === undefined) {
    detach();
    throw editorError(
      'capability',
      'selection-unavailable',
      'DataTables Select must be installed and enabled for selection.',
    );
  }
  const capabilities: PresentationCapabilities<T> = {
    binding: { resolve },
    reflection: {
      async reflectMany(updates) {
        ensure();
        rebuild(true);
        const keys = new Set(indices.keys());
        for (const update of updates)
          keys.delete(options.identity(update.previous));
        const staged = updates.map((update) => {
          const index = indices.get(options.identity(update.previous));
          const key = options.identity(update.current);
          if (index === undefined)
            throw editorError(
              'host',
              'entity-not-found',
              'The entity is not present in the host.',
            );
          if (keys.has(key))
            throw editorError(
              'host',
              'duplicate-entity-key',
              'The canonical entity key already exists.',
            );
          keys.add(key);
          return { ...update, index, key };
        });
        reflecting++;
        try {
          for (const update of staged) {
            expected.set(options.identity(update.previous), undefined);
            expected.set(update.key, update.current);
            table.row(update.index).data(update.current);
          }
          if (staged.length) table.draw(false);
        } finally {
          reflecting--;
          rebuild(true);
        }
      },
      async reflectCreate(entity) {
        ensure();
        rebuild(true);
        const key = options.identity(entity);
        if (indices.has(key))
          throw editorError(
            'host',
            'duplicate-entity-key',
            'The canonical entity key already exists.',
          );
        expected.set(key, entity);
        reflecting++;
        try {
          table.rows.add([entity]).draw(false);
        } finally {
          reflecting--;
          rebuild(true);
        }
      },
      async reflectUpdate(previous, current) {
        const source = row(options.identity(previous)),
          key = options.identity(current);
        if (key !== options.identity(previous) && indices.has(key))
          throw editorError(
            'host',
            'duplicate-entity-key',
            'The canonical entity key already exists.',
          );
        expected.set(options.identity(previous), undefined);
        expected.set(key, current);
        reflecting++;
        try {
          source.data(current).draw(false);
        } finally {
          reflecting--;
          rebuild(true);
        }
      },
      async reflectRemove(entity) {
        const source = row(options.identity(entity));
        expected.set(options.identity(entity), undefined);
        reflecting++;
        try {
          source.remove().draw(false);
        } finally {
          reflecting--;
          rebuild(true);
        }
      },
    },
    anchor: {
      activate(entity) {
        ensure();
        rebuild(true);
        const index = indices.get(options.identity(entity));
        if (index === undefined) return;
        const position = table
          .rows({ search: 'applied', order: 'applied' })
          .indexes()
          .toArray()
          .indexOf(index);
        const length = table.page.info().length;
        if (position >= 0 && length > 0)
          table.page(Math.floor(position / length)).draw('page');
      },
      resolveFieldAnchor(entity, fieldId) {
        ensure();
        rebuild(true);
        const index = indices.get(options.identity(entity));
        const column =
          options.columns?.[fieldId] ??
          table.columns().dataSrc().toArray().indexOf(fieldId);
        if (index === undefined || column < 0) return null;
        const element = table.cell(index, column).node();
        return element instanceof HTMLElement && element.isConnected
          ? element
          : null;
      },
    },
    focus: browserFocus(),
    viewport: browserViewport(),
    ...(hasSelection
      ? {
          selection: {
            getSelected() {
              ensure();
              return table
                .rows({ selected: true })
                .data()
                .toArray()
                .map((entity) => ({ key: options.identity(entity), entity }));
            },
            subscribeSelection(listener: () => void) {
              ensure();
              table.on(`select${namespace} deselect${namespace}`, listener);
              const unsubscribe = () => {
                table.off(`select${namespace} deselect${namespace}`, listener);
                subscriptions.delete(unsubscribe);
              };
              subscriptions.add(unsubscribe);
              return unsubscribe;
            },
          },
        }
      : {}),
  };
  return {
    capabilities,
    resolveEntity: resolve,
    detach,
    refresh() {
      ensure();
      rebuild(true);
    },
  };
}
