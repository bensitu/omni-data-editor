import { editorError } from '@omnidataeditor/core';
import type { EntityKey } from '@omnidataeditor/core';
import { formatMessage, messageText } from '@omnidataeditor/dom';
import type {
  FieldRendererFactory,
  FieldRendererContext,
  FieldRendererInstance,
} from '@omnidataeditor/dom';

export interface AsyncSelectOption<V> {
  readonly value: V;
  readonly label: string;
  readonly disabled?: boolean;
}
export interface AsyncSelectOptions<V> {
  readonly load: (
    query: string,
    context: { readonly signal: AbortSignal },
  ) => Promise<readonly AsyncSelectOption<V>[]>;
  readonly isValue: (value: unknown) => value is V;
  readonly getKey: (value: V) => EntityKey;
  readonly formatValue?: (value: V) => string;
  readonly debounceMs?: number;
  readonly minimumQueryLength?: number;
  readonly messages?: Readonly<Record<string, string>>;
}
let nextIdentifier = 0;
export function createAsyncSelectRenderer<V>(
  options: AsyncSelectOptions<V>,
): FieldRendererFactory<unknown, unknown> {
  if ((options.debounceMs ?? 200) < 0 || (options.minimumQueryLength ?? 0) < 0)
    throw editorError(
      'configuration',
      'invalid-query-options',
      'Query delay and minimum length must be nonnegative.',
    );
  return {
    create(context) {
      return createControl(context, options);
    },
  };
}

function createControl<V>(
  context: FieldRendererContext<unknown, unknown>,
  options: AsyncSelectOptions<V>,
): FieldRendererInstance {
  if (typeof document === 'undefined')
    throw editorError(
      'renderer',
      'browser-required',
      'Asynchronous selection requires a browser.',
    );
  const element = document.createElement('div');
  element.className = 'omnidataeditor-field';
  const label = document.createElement('label'),
    input = document.createElement('input'),
    list = document.createElement('ul'),
    status = document.createElement('div'),
    issues = document.createElement('div');
  const id = `omnidataeditor-async-${++nextIdentifier}`;
  input.id = id;
  input.className = 'omnidataeditor-control';
  input.type = 'text';
  input.autocomplete = 'off';
  input.setAttribute('role', 'combobox');
  input.setAttribute('aria-autocomplete', 'list');
  input.setAttribute('aria-expanded', 'false');
  input.setAttribute('aria-controls', `${id}-options`);
  input.setAttribute('aria-describedby', `${id}-status ${id}-issues`);
  label.htmlFor = id;
  label.textContent = messageText(context.field.label, context.field.id);
  list.id = `${id}-options`;
  list.className = 'omnidataeditor-listbox';
  list.setAttribute('role', 'listbox');
  list.setAttribute('aria-label', label.textContent);
  list.hidden = true;
  status.id = `${id}-status`;
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');
  issues.id = `${id}-issues`;
  issues.className = 'omnidataeditor-issues';
  input.required = context.field.presentation?.required === true;
  element.append(label, input, list, status, issues);
  const unregister = context.registerOwnedFocusSurface?.(list);
  const lifecycle = new AbortController();
  let queryController: AbortController | undefined,
    timer: ReturnType<typeof setTimeout> | undefined;
  let version = 0,
    active = -1,
    selected: V | undefined,
    readOnly = false,
    destroyed = false;
  let items: readonly AsyncSelectOption<V>[] = [];
  const labels = new Map<EntityKey, string>();
  const text = (key: string, fallback: string) =>
    options.messages?.[key] ?? fallback;
  const stopQuery = () => {
    version++;
    if (timer !== undefined) clearTimeout(timer);
    timer = undefined;
    queryController?.abort();
    queryController = undefined;
    input.removeAttribute('aria-busy');
  };
  const close = () => {
    list.hidden = true;
    input.setAttribute('aria-expanded', 'false');
    input.removeAttribute('aria-activedescendant');
    active = -1;
  };
  const markActive = () => {
    [...list.children].forEach((item, index) =>
      item.setAttribute('aria-selected', String(index === active)),
    );
    if (active >= 0)
      input.setAttribute('aria-activedescendant', `${id}-option-${active}`);
    else input.removeAttribute('aria-activedescendant');
  };
  const format = (value: V) =>
    options.formatValue?.(value) ??
    labels.get(options.getKey(value)) ??
    String(options.getKey(value));
  const choose = (index: number) => {
    const item = items[index];
    if (!item || item.disabled || readOnly || input.disabled) return;
    stopQuery();
    selected = item.value;
    input.value = item.label;
    input.setCustomValidity('');
    input.setAttribute('aria-invalid', 'false');
    status.textContent = '';
    close();
    context.reportInput({ kind: 'commit', value: item.value });
    input.focus();
  };
  const load = async (query: string, token: number) => {
    if (destroyed || readOnly || input.disabled || token !== version) return;
    if (query.length < (options.minimumQueryLength ?? 0)) {
      status.textContent = text(
        'type-more',
        'Enter more characters to search.',
      );
      return;
    }
    const controller = new AbortController();
    queryController = controller;
    status.textContent = text('loading', 'Loading options…');
    input.setAttribute('aria-busy', 'true');
    try {
      const values = await options.load(query, { signal: controller.signal });
      if (destroyed || controller.signal.aborted || token !== version) return;
      if (values.some((item) => !options.isValue(item.value)))
        throw new Error('Invalid option values.');
      const keys = values.map((item) => options.getKey(item.value));
      if (new Set(keys).size !== keys.length)
        throw new Error('Invalid option identities.');
      for (const item of values)
        labels.set(options.getKey(item.value), item.label);
      items = values;
      active = values.findIndex((item) => !item.disabled);
      list.replaceChildren();
      values.forEach((item, index) => {
        const option = document.createElement('li');
        option.id = `${id}-option-${index}`;
        option.setAttribute('role', 'option');
        option.setAttribute('aria-disabled', String(item.disabled === true));
        option.textContent = item.label;
        option.addEventListener('pointerdown', (event) =>
          event.preventDefault(),
        );
        option.addEventListener('click', () => choose(index));
        list.append(option);
      });
      list.hidden = !values.length;
      input.setAttribute('aria-expanded', String(values.length > 0));
      markActive();
      status.textContent = values.length
        ? ''
        : text('empty', 'No options found.');
    } catch {
      if (destroyed || controller.signal.aborted || token !== version) return;
      items = [];
      close();
      status.textContent = text(
        'error',
        'Options could not be loaded. Try again.',
      );
    } finally {
      if (token === version && !destroyed) {
        input.removeAttribute('aria-busy');
        queryController = undefined;
      }
    }
  };
  const query = () => {
    if (readOnly || input.disabled) return;
    stopQuery();
    close();
    items = [];
    input.setCustomValidity(
      text('choose-option', 'Choose an option from the list.'),
    );
    input.setAttribute('aria-invalid', 'true');
    if (input.value.length < (options.minimumQueryLength ?? 0)) {
      status.textContent = text(
        'type-more',
        'Enter more characters to search.',
      );
      return;
    }
    const token = version,
      value = input.value;
    status.textContent = text('searching', 'Searching…');
    timer = setTimeout(() => {
      timer = undefined;
      void load(value, token);
    }, options.debounceMs ?? 200);
  };
  input.addEventListener('input', query, { signal: lifecycle.signal });
  input.addEventListener(
    'keydown',
    (event) => {
      if (readOnly || input.disabled) return;
      if (
        event.key === 'Escape' &&
        (!list.hidden || queryController || timer !== undefined)
      ) {
        event.preventDefault();
        event.stopPropagation();
        stopQuery();
        close();
        input.value = selected === undefined ? '' : format(selected);
        input.setCustomValidity('');
        input.setAttribute('aria-invalid', 'false');
        status.textContent = '';
        return;
      }
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        if (list.hidden) {
          stopQuery();
          void load(input.value, version);
          return;
        }
        const direction = event.key === 'ArrowDown' ? 1 : -1;
        for (let offset = 1; offset <= items.length; offset++) {
          const next =
            (active + direction * offset + items.length) % items.length;
          if (!items[next]?.disabled) {
            active = next;
            break;
          }
        }
        markActive();
      }
      if (event.key === 'Enter' && !list.hidden && active >= 0) {
        event.preventDefault();
        event.stopPropagation();
        choose(active);
      }
    },
    { signal: lifecycle.signal },
  );
  const destroy = () => {
    if (destroyed) return;
    destroyed = true;
    stopQuery();
    lifecycle.abort();
    context.signal.removeEventListener('abort', destroy);
    unregister?.();
    element.remove();
  };
  context.signal.addEventListener('abort', destroy, { once: true });
  if (context.signal.aborted) destroy();
  return {
    element,
    setMixed(mixed) {
      if (mixed) {
        input.value = '';
        input.placeholder = text('mixed', 'Multiple values');
        input.setCustomValidity('');
      } else input.placeholder = '';
    },
    setValue(value) {
      stopQuery();
      close();
      selected = options.isValue(value) ? value : undefined;
      input.value = selected === undefined ? '' : format(selected);
      input.setCustomValidity('');
    },
    setDisabled(disabled) {
      input.disabled = disabled;
      if (disabled) {
        stopQuery();
        close();
      }
    },
    setReadOnly(value) {
      readOnly = value;
      input.readOnly = value;
      if (value) {
        stopQuery();
        close();
      }
    },
    setVisible(visible) {
      element.hidden = !visible;
      if (!visible) {
        stopQuery();
        close();
        input.value = selected === undefined ? '' : format(selected);
        input.setCustomValidity('');
      }
    },
    setIssues(values) {
      issues.textContent = values
        .map(
          (issue) =>
            issue.message ??
            formatMessage({ key: issue.messageKey ?? issue.code }),
        )
        .join(' ');
      input.setAttribute(
        'aria-invalid',
        String(
          values.some((issue) => issue.severity !== 'warning') ||
            !!input.validationMessage,
        ),
      );
    },
    focus() {
      input.focus();
    },
    destroy,
  };
}
