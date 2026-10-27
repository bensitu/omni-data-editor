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
  const indices = new Map<EntityKey, number>();
  let previous = new Map<EntityKey, T>();
  let detached = false,
    reflecting = 0;
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
    indices.clear();
    table.rows().every(function () {
      const entity = this.data(),
        key = options.identity(entity);
      if (current.has(key))
        throw editorError(
          'host',
          'duplicate-entity-key',
          'Host entity keys must be unique.',
        );
      current.set(key, entity);
      indices.set(key, this.index());
    });
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
        reflecting++;
        try {
          table.rows.add([entity]).draw(false);
          rebuild(false);
        } finally {
          reflecting--;
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
        reflecting++;
        try {
          source.data(current).draw(false);
          rebuild(false);
        } finally {
          reflecting--;
        }
      },
      async reflectRemove(entity) {
        reflecting++;
        try {
          row(options.identity(entity)).remove().draw(false);
          rebuild(false);
        } finally {
          reflecting--;
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
