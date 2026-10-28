import { editorError } from '@omnidataeditor/core';
import { formatMessage } from './messages.js';
import type {
  FieldRendererFactory,
  FieldRendererContext,
  FieldRendererInstance,
  RendererRegistry,
} from './types.js';

export interface DomRendererRegistry extends RendererRegistry {
  create(
    key: string,
    context: FieldRendererContext<unknown, unknown>,
  ): FieldRendererInstance;
}

export function createRendererRegistry(): DomRendererRegistry {
  const factories = new Map<string, FieldRendererFactory<unknown, unknown>>();
  return {
    register(key, factory) {
      if (!/^@[a-z0-9-]+\/[a-z0-9-]+$/.test(key))
        throw editorError(
          'renderer',
          'invalid-renderer-key',
          'Extension renderer keys must be scoped.',
        );
      if (factories.has(key))
        throw editorError(
          'renderer',
          'duplicate-renderer',
          `Renderer already registered: ${key}.`,
        );
      factories.set(key, factory);
    },
    create(key, context) {
      const factory = factories.get(key);
      if (factory) return factory.create(context);
      if (
        [
          'text',
          'textarea',
          'number',
          'checkbox',
          'select',
          'radio',
          'date',
          'datetime-local',
          'hidden',
        ].includes(key)
      )
        return createNativeRenderer(context);
      throw editorError(
        'renderer',
        'unknown-renderer',
        `Renderer unavailable: ${key}.`,
      );
    },
  };
}

export type ParseResult<V> =
  | { readonly ok: true; readonly value: V }
  | { readonly ok: false; readonly kind: 'incomplete'; readonly raw: string }
  | { readonly ok: false; readonly kind: 'invalid'; readonly raw: string };
export interface ValueCodec<V, View = string> {
  format(value: V): View;
  parse(view: View): ParseResult<V>;
}
export const numberCodec: ValueCodec<number> = {
  format: (value) => String(value),
  parse: (raw) =>
    raw.trim() === '' ||
    /^[+-]?\.?$/.test(raw.trim()) ||
    /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)[eE][+-]?$/.test(raw.trim())
      ? { ok: false, kind: 'incomplete', raw }
      : /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(raw.trim()) &&
          Number.isFinite(Number(raw))
        ? { ok: true, value: Number(raw) }
        : { ok: false, kind: 'invalid', raw },
};

let nextControl = 0;
export function messageText(
  value:
    | string
    | { readonly key: string; readonly defaultMessage?: string }
    | undefined,
  fallback = '',
): string {
  return typeof value === 'string'
    ? value
    : (value?.defaultMessage ?? value?.key ?? fallback);
}

export function createNativeRenderer(
  context: FieldRendererContext<unknown, unknown>,
): FieldRendererInstance {
  if (typeof document === 'undefined')
    throw editorError(
      'renderer',
      'browser-required',
      'Rendering requires a browser.',
    );
  if (context.field.renderer === 'radio') return createRadioRenderer(context);
  const { field } = context,
    kind = field.renderer,
    config = field.presentation;
  const text = (key: string) => formatMessage({ key }, context.messages);
  const element = document.createElement('div');
  element.className = 'omnidataeditor-field';
  const label = document.createElement('label'),
    issues = document.createElement('div');
  const id = `omnidataeditor-control-${++nextControl}`;
  issues.id = `${id}-issues`;
  issues.className = 'omnidataeditor-issues';
  issues.setAttribute('aria-live', 'polite');
  label.textContent = messageText(field.label, field.id);
  label.htmlFor = id;
  const control =
    kind === 'textarea'
      ? document.createElement('textarea')
      : kind === 'select' || kind === 'radio'
        ? document.createElement('select')
        : document.createElement('input');
  control.id = id;
  control.className = 'omnidataeditor-control';
  control.setAttribute('aria-describedby', issues.id);
  if (control instanceof HTMLInputElement)
    control.type = kind === 'number' ? 'text' : kind;
  if (kind === 'number') control.setAttribute('inputmode', 'decimal');
  if (config?.required === true) control.required = true;
  const options = Array.isArray(config?.options)
    ? (config.options as { value: unknown; label: string }[])
    : [];
  if (control instanceof HTMLSelectElement) {
    const blank = document.createElement('option');
    blank.value = '';
    blank.textContent = text('choose-option');
    control.append(blank);
    options.forEach((option, index) => {
      const item = document.createElement('option');
      item.value = String(index);
      item.textContent = option.label;
      control.append(item);
    });
  }
  let currentValue: unknown, reportedValue: unknown;
  let reporting = false;
  const display = (value: unknown) => {
    if (control instanceof HTMLInputElement && kind === 'checkbox')
      control.checked = value === true;
    else if (control instanceof HTMLSelectElement) {
      const index = options.findIndex((option) =>
        (field.equals ?? Object.is)(option.value, value),
      );
      control.value = index < 0 ? '' : String(index);
    } else
      control.value =
        value === null || value === undefined
          ? ''
          : kind === 'number' && config?.decimalSeparator === ','
            ? String(value).replace('.', ',')
            : String(value);
  };
  let readOnly = false,
    destroyed = false;
  const parse = () => {
    if (readOnly || control.disabled) {
      display(currentValue);
      return;
    }
    let value: unknown = control.value;
    if (kind === 'number') {
      const result =
        control.value.trim() === ''
          ? { ok: true as const, value: undefined }
          : numberCodec.parse(
              config?.decimalSeparator === ','
                ? control.value.replace(',', '.')
                : control.value,
            );
      control.setCustomValidity(result.ok ? '' : text('complete-number'));
      control.setAttribute('aria-invalid', String(!result.ok));
      if (!result.ok) {
        issues.textContent = text('complete-number');
        return;
      }
      value = result.value;
    }
    if (control instanceof HTMLInputElement && kind === 'checkbox')
      value = control.checked;
    if (control instanceof HTMLSelectElement) {
      value =
        control.value === ''
          ? undefined
          : options[Number(control.value)]?.value;
      control.setCustomValidity('');
    }
    issues.textContent = '';
    reporting = true;
    reportedValue = value;
    try {
      context.reportInput({ kind: 'input', value });
    } finally {
      reporting = false;
    }
  };
  const preventReadOnly = (event: Event) => {
    if (event instanceof KeyboardEvent && event.key === 'Tab') return;
    if (readOnly && (kind === 'select' || kind === 'checkbox'))
      event.preventDefault();
  };
  control.addEventListener('pointerdown', preventReadOnly);
  control.addEventListener('click', preventReadOnly);
  control.addEventListener('keydown', preventReadOnly);
  control.addEventListener('input', parse);
  control.addEventListener('change', parse);
  element.append(label, control, issues);
  if (kind === 'hidden') element.hidden = true;
  return {
    element,
    setRequired(required) {
      control.required = required;
    },
    setMixed(mixed) {
      if (!mixed) {
        control.removeAttribute('placeholder');
        if (control instanceof HTMLInputElement) control.indeterminate = false;
        return;
      }
      control.setCustomValidity('');
      if (kind !== 'checkbox') control.value = '';
      control.setAttribute('placeholder', text('mixed'));
      if (control instanceof HTMLInputElement && kind === 'checkbox') {
        control.checked = false;
        control.indeterminate = true;
      }
    },
    setValue(value) {
      currentValue = value;
      if (!reporting || !(field.equals ?? Object.is)(reportedValue, value))
        display(value);
      control.setCustomValidity('');
      control.setAttribute('aria-invalid', 'false');
      issues.textContent = '';
    },
    setDisabled(disabled) {
      control.disabled = disabled;
    },
    setReadOnly(value) {
      readOnly = value;
      control.setAttribute('aria-readonly', String(value));
      if (
        control instanceof HTMLInputElement ||
        control instanceof HTMLTextAreaElement
      )
        control.readOnly = value;
    },
    setVisible(visible) {
      element.hidden = kind === 'hidden' || !visible;
      if (!visible) {
        display(currentValue);
        control.setCustomValidity('');
      }
    },
    setIssues(values) {
      if (control.validity.customError && kind === 'number') return;
      issues.textContent = values
        .map(
          (issue) =>
            issue.message ??
            formatMessage(
              {
                key: issue.messageKey ?? issue.code,
                ...(issue.params ? { params: issue.params } : {}),
              },
              context.messages,
            ),
        )
        .join(' ');
      control.setAttribute(
        'aria-invalid',
        String(values.some((issue) => issue.severity !== 'warning')),
      );
    },
    focus() {
      control.focus();
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      control.removeEventListener('pointerdown', preventReadOnly);
      control.removeEventListener('click', preventReadOnly);
      control.removeEventListener('keydown', preventReadOnly);
      control.removeEventListener('input', parse);
      control.removeEventListener('change', parse);
      element.remove();
    },
  };
}

function createRadioRenderer(
  context: FieldRendererContext<unknown, unknown>,
): FieldRendererInstance {
  const element = document.createElement('fieldset');
  element.className = 'omnidataeditor-field';
  const legend = document.createElement('legend');
  legend.textContent = messageText(context.field.label, context.field.id);
  const issues = document.createElement('div');
  issues.className = 'omnidataeditor-issues';
  issues.id = `omnidataeditor-radio-${++nextControl}-issues`;
  issues.setAttribute('aria-live', 'polite');
  const options = (context.field.presentation?.options ?? []) as readonly {
    value: unknown;
    label: string;
  }[];
  const controls: HTMLInputElement[] = [];
  const lifecycle = new AbortController();
  let value: unknown,
    readOnly = false,
    disposed = false;
  const render = () =>
    controls.forEach((input, index) => {
      input.checked = (context.field.equals ?? Object.is)(
        options[index]?.value,
        value,
      );
    });
  element.append(legend);
  options.forEach((option, index) => {
    const label = document.createElement('label'),
      input = document.createElement('input');
    input.type = 'radio';
    input.name = issues.id;
    input.value = String(index);
    input.required = context.field.presentation?.required === true;
    input.setAttribute('aria-describedby', issues.id);
    label.append(input, document.createTextNode(option.label));
    input.addEventListener(
      'click',
      (event) => {
        if (readOnly) event.preventDefault();
      },
      { signal: lifecycle.signal },
    );
    input.addEventListener(
      'keydown',
      (event) => {
        if (
          readOnly &&
          [' ', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(
            event.key,
          )
        )
          event.preventDefault();
      },
      { signal: lifecycle.signal },
    );
    input.addEventListener(
      'change',
      () => {
        if (readOnly) render();
        else if (input.checked)
          context.reportInput({ kind: 'input', value: option.value });
      },
      { signal: lifecycle.signal },
    );
    controls.push(input);
    element.append(label);
  });
  element.append(issues);
  return {
    element,
    setRequired(required) {
      controls.forEach((input) => {
        input.required = required;
      });
    },
    setMixed(mixed) {
      if (mixed)
        controls.forEach((input) => {
          input.checked = false;
        });
    },
    setValue(current) {
      value = current;
      render();
    },
    setDisabled(disabled) {
      element.disabled = disabled;
    },
    setReadOnly(current) {
      readOnly = current;
      controls.forEach((input) =>
        input.setAttribute('aria-readonly', String(current)),
      );
    },
    setVisible(visible) {
      element.hidden = !visible;
    },
    setIssues(values) {
      issues.textContent = values
        .map(
          (issue) =>
            issue.message ??
            formatMessage(
              {
                key: issue.messageKey ?? issue.code,
                ...(issue.params ? { params: issue.params } : {}),
              },
              context.messages,
            ),
        )
        .join(' ');
      controls.forEach((input) =>
        input.setAttribute(
          'aria-invalid',
          String(values.some((issue) => issue.severity !== 'warning')),
        ),
      );
    },
    focus() {
      (controls.find((input) => input.checked) ?? controls[0])?.focus();
    },
    destroy() {
      if (disposed) return;
      disposed = true;
      lifecycle.abort();
      element.remove();
    },
  };
}
