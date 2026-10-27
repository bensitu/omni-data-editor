import type {
  FieldDefinition,
  PresentationContext,
  SessionSnapshot,
} from '@omnidataeditor/core';
import { configurationError } from '@omnidataeditor/core';
import type { FieldRendererInstance } from './types.js';
import { createFocusSurfaceRegistry } from './focus.js';
import { englishMessages, formatMessage } from './messages.js';
import {
  createRendererRegistry,
  type DomRendererRegistry,
} from './registry.js';

export interface FormOptions<T> {
  /** Fields must be a subset of the fields registered with the editor. */
  readonly fields: readonly FieldDefinition<T>[];
  readonly registry?: DomRendererRegistry;
  readonly messages?: Readonly<Record<string, string>>;
}
export interface EditorForm {
  readonly element: HTMLFormElement;
  readonly surfaces: ReturnType<typeof createFocusSurfaceRegistry>;
  readonly controls: ReadonlyMap<string, FieldRendererInstance>;
  readonly submitButton: HTMLButtonElement;
  readonly cancelButton: HTMLButtonElement;
  destroy(): Promise<void>;
}

export function createEditorForm<T>(
  context: PresentationContext<T>,
  options: FormOptions<T>,
): EditorForm {
  const initial = context.getSnapshot();
  const registered =
    initial.draft.mode === 'multi-edit'
      ? initial.draft.fields
      : initial.draft.values;
  const fieldIds = new Set<string>();
  for (const field of options.fields) {
    if (!registered.has(field.id) || fieldIds.has(field.id))
      throw configurationError(
        `Form fields must be registered once with the editor: ${field.id}.`,
      );
    fieldIds.add(field.id);
  }
  const element = document.createElement('form');
  element.className = 'omnidataeditor-form';
  element.noValidate = true;
  const summary = document.createElement('div');
  summary.className = 'omnidataeditor-summary';
  summary.setAttribute('role', 'status');
  const conflict = document.createElement('div');
  conflict.className = 'omnidataeditor-conflict';
  const controls = new Map<string, FieldRendererInstance>(),
    surfaces = createFocusSurfaceRegistry();
  surfaces.register(element);
  const controller = new AbortController();
  const displayed = new Map<string, unknown>();
  const catalog = { ...englishMessages, ...options.messages };
  const text = (key: string) => formatMessage({ key }, catalog);
  const registry = options.registry ?? createRendererRegistry();
  const submitButton = document.createElement('button');
  submitButton.type = 'submit';
  submitButton.textContent = text('save');
  const cancelButton = document.createElement('button');
  cancelButton.type = 'button';
  cancelButton.textContent = text('cancel');
  const resetButton = document.createElement('button');
  resetButton.type = 'button';
  resetButton.textContent = text('reset');
  element.append(summary, conflict);
  for (const field of options.fields) {
    const {
      validators: _validators,
      visibleWhen: _visible,
      enabledWhen: _enabled,
      readOnlyWhen: _readOnly,
      ...definition
    } = field;
    let instance: FieldRendererInstance;
    try {
      instance = registry.create(field.renderer, {
        field: {
          ...definition,
          ...(field.label !== undefined
            ? { label: formatMessage(field.label, catalog) }
            : {}),
          read: (value) => field.read(value as T),
          write: (value, input) => field.write(value as T, input),
        },
        signal: controller.signal,
        messages: catalog,
        registerOwnedFocusSurface: (surface) => surfaces.register(surface),
        reportInput: (input) => {
          const outcome = context.dispatch({
            type: 'set',
            fieldId: field.id,
            value: input.value,
          });
          if (outcome.status === 'rejected')
            summary.textContent = text('value-not-applied');
        },
      });
    } catch (cause) {
      controller.abort();
      surfaces.clear();
      for (const current of controls.values()) {
        try {
          void Promise.resolve(current.destroy()).catch(() => undefined);
        } catch {
          /* Continue releasing other controls. */
        }
      }
      throw cause;
    }
    controls.set(field.id, instance);
    element.append(instance.element);
  }
  const actions = document.createElement('div');
  actions.className = 'omnidataeditor-actions';
  actions.append(submitButton, resetButton, cancelButton);
  element.append(actions);
  const update = (snapshot: SessionSnapshot<T>) => {
    const locked = [
      'opening',
      'submitting',
      'committed',
      'cancelled',
      'failed',
    ].includes(snapshot.phase);
    const candidates =
      snapshot.draft.mode === 'multi-edit'
        ? snapshot.changeSet && 'entities' in snapshot.changeSet
          ? snapshot.changeSet.entities.map((entity) => entity.candidate)
          : snapshot.draft.entities.map((entity) => entity.baseline)
        : [];
    const sharedContexts = candidates.map((candidate) => ({
      candidate,
      mode: snapshot.mode,
      revision: snapshot.revision,
      values: new Map(
        options.fields.map((field) => [field.id, field.read(candidate)]),
      ),
    }));
    for (const field of options.fields) {
      const instance = controls.get(field.id)!;
      if (snapshot.draft.mode !== 'multi-edit') {
        const predicate = {
          candidate: snapshot.draft.candidate,
          fieldId: field.id,
          mode: snapshot.mode,
          revision: snapshot.revision,
          values: snapshot.draft.values,
        };
        const value = snapshot.draft.values.get(field.id);
        if (
          !displayed.has(field.id) ||
          !Object.is(displayed.get(field.id), value)
        ) {
          instance.setValue(value);
          displayed.set(field.id, value);
        }
        instance.setDisabled(
          locked || !(field.enabledWhen?.(predicate) ?? true),
        );
        instance.setReadOnly(field.readOnlyWhen?.(predicate) ?? false);
        instance.setVisible(field.visibleWhen?.(predicate) ?? true);
      } else {
        const state = snapshot.draft.fields.get(field.id);
        if (!state) continue;
        const mixed =
          state.draft.kind === 'mixed' ||
          (state.baseline.kind === 'mixed' && state.draft.kind === 'unchanged');
        instance.setMixed?.(mixed);
        const display =
          state.draft.kind === 'override'
            ? state.draft.value
            : state.baseline.kind === 'uniform'
              ? state.baseline.value
              : undefined;
        if (
          !mixed &&
          (!displayed.has(field.id) ||
            !Object.is(displayed.get(field.id), display))
        ) {
          instance.setValue(display);
          displayed.set(field.id, display);
        }
        if (mixed) displayed.delete(field.id);
        instance.element.dataset.mixed = String(mixed);
        const contexts = sharedContexts.map((context) => ({
          ...context,
          fieldId: field.id,
        }));
        instance.setDisabled(
          locked ||
            !contexts.every((context) => field.enabledWhen?.(context) ?? true),
        );
        instance.setReadOnly(
          contexts.some((context) => field.readOnlyWhen?.(context) ?? false),
        );
        instance.setVisible(
          contexts.some((context) => field.visibleWhen?.(context) ?? true),
        );
      }
      instance.setIssues(
        snapshot.issues
          .filter((issue) => issue.fieldId === field.id)
          .map((issue) => ({
            ...issue,
            message:
              issue.message ??
              formatMessage({ key: issue.messageKey ?? issue.code }, catalog),
          })),
      );
      const state =
        snapshot.draft.mode === 'multi-edit'
          ? snapshot.draft.fields.get(field.id)
          : undefined;
      const mixed =
        state?.draft.kind === 'mixed' ||
        (state?.baseline.kind === 'mixed' && state.draft.kind === 'unchanged');
      const required =
        field.presentation?.required === true &&
        !instance.element.hidden &&
        !mixed;
      if (instance.setRequired) instance.setRequired(required);
      else
        for (const control of instance.element.querySelectorAll<
          HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
        >('input, select, textarea'))
          control.required = required;
    }
    summary.textContent = snapshot.issues
      .map(
        (issue) =>
          issue.message ??
          catalog[issue.messageKey ?? issue.code] ??
          text('check-values'),
      )
      .join(' ');
    if (
      snapshot.batch &&
      !snapshot.issues.length &&
      snapshot.phase === 'editing'
    ) {
      const saved = snapshot.batch.items.filter(
        (item) => item.outcome.ok,
      ).length;
      summary.textContent = formatMessage(
        {
          key: 'batch-summary',
          params: { saved, remaining: snapshot.batch.items.length - saved },
        },
        catalog,
      );
    }
    conflict.replaceChildren();
    if (snapshot.conflict && snapshot.externalChangePolicy !== 'silent') {
      const description = document.createElement('p');
      description.textContent =
        snapshot.conflict.kind === 'deleted'
          ? text('remote-removed')
          : text('remote-updated');
      conflict.append(description);
      for (const [label, kind] of [
        [text('accept-remote'), 'accept-remote'],
        [text('rebase-local'), 'rebase-local'],
      ] as const) {
        if (snapshot.conflict.kind === 'deleted' && kind !== 'accept-remote')
          continue;
        const button = document.createElement('button');
        button.type = 'button';
        button.textContent = label;
        button.onclick = () => {
          context.dispatch({ type: 'resolve-conflict', decision: { kind } });
        };
        conflict.append(button);
      }
    }
    submitButton.disabled =
      locked || snapshot.phase === 'validating' || !!snapshot.conflict;
    resetButton.disabled = locked;
  };
  const unsubscribe = context.subscribe(update);
  try {
    update(context.getSnapshot());
  } catch (cause) {
    unsubscribe();
    controller.abort();
    surfaces.clear();
    for (const instance of controls.values()) {
      try {
        void Promise.resolve(instance.destroy()).catch(() => undefined);
      } catch {
        /* Continue releasing other controls. */
      }
    }
    throw cause;
  }
  const submit = async (event: SubmitEvent) => {
    event.preventDefault();
    if (!element.reportValidity()) return;
    try {
      const result = await context.submit();
      if (result.status === 'failed') summary.textContent = text('save-failed');
      if (result.status === 'uncertain')
        summary.textContent = text('save-unknown');
    } catch {
      summary.textContent = text('save-failed');
    }
  };
  element.addEventListener('submit', submit);
  cancelButton.onclick = () => {
    context.dispatch({ type: 'cancel', reason: 'user-cancelled' });
  };
  resetButton.onclick = () => {
    displayed.clear();
    for (const input of element.querySelectorAll('input, select, textarea'))
      (input as HTMLInputElement).setCustomValidity('');
    context.dispatch({ type: 'reset' });
    update(context.getSnapshot());
  };
  let disposal: Promise<void> | undefined;
  return {
    element,
    controls,
    surfaces,
    submitButton,
    cancelButton,
    destroy() {
      if (disposal) return disposal;
      controller.abort();
      unsubscribe();
      surfaces.clear();
      element.removeEventListener('submit', submit);
      element.remove();
      disposal = Promise.allSettled(
        [...controls.values()].map((instance) => {
          try {
            return Promise.resolve(instance.destroy());
          } catch (cause) {
            return Promise.reject(cause);
          }
        }),
      ).then((results) => {
        const errors = results
          .filter((result) => result.status === 'rejected')
          .map((result) => result.reason);
        if (errors.length)
          throw new AggregateError(errors, 'Field cleanup failed.');
      });
      return disposal;
    },
  };
}
