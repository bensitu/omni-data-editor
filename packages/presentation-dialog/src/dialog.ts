import type { Presentation, PresentationContext } from '@omnidataeditor/core';
import { editorError } from '@omnidataeditor/core';
import {
  browserFocus,
  createEditorForm,
  englishMessages,
  formatMessage,
} from '@omnidataeditor/dom';
import type { FormOptions, EditorForm, FocusHandle } from '@omnidataeditor/dom';

export interface DialogOptions<T> extends FormOptions<T> {
  readonly title?: string;
  readonly closeOnEscape?: boolean;
  readonly container?: HTMLElement;
}
export function dialog<T>(options: DialogOptions<T>): Presentation<T> {
  let element: HTMLDialogElement | undefined,
    form: EditorForm | undefined,
    unsubscribe: (() => void) | undefined;
  let focus: FocusHandle | null = null;
  let closing: Promise<void> = Promise.resolve();
  let generation = 0,
    retained = false;
  const close = () => {
    if (!element && !form) return closing;
    const token = ++generation;
    unsubscribe?.();
    unsubscribe = undefined;
    const current = form;
    form = undefined;
    const previousElement = element;
    element = undefined;
    retained = false;
    previousElement?.close();
    previousElement?.remove();
    const handle = focus;
    focus = null;
    closing = Promise.all([
      closing.catch(() => undefined),
      Promise.resolve(current?.destroy()),
    ]).then(() => {
      if (handle && generation === token) browserFocus().focus(handle);
    });
    return closing;
  };
  return {
    requiredCapabilities: [],
    mount(context: PresentationContext<T>) {
      if (retained) void close().catch(() => undefined);
      if (typeof document === 'undefined')
        throw editorError(
          'presentation',
          'browser-required',
          'Dialog rendering requires a browser.',
        );
      if (element)
        throw editorError(
          'presentation',
          'presentation-in-use',
          'The dialog is already open.',
        );
      generation++;
      try {
        focus = browserFocus().captureFocus();
        element = document.createElement('dialog');
        element.className = 'omnidataeditor-dialog';
        const heading = document.createElement('h2');
        heading.id = `omnidataeditor-title-${context.getSnapshot().sessionId}`;
        heading.textContent =
          options.title ??
          formatMessage(
            { key: 'edit-entity' },
            { ...englishMessages, ...options.messages },
          );
        element.setAttribute('aria-labelledby', heading.id);
        element.append(heading);
        form = createEditorForm(context, options);
        form.cancelButton.onclick = () => {
          context.dispatch({ type: 'cancel', reason: 'user-cancelled' });
          void close().catch(() => undefined);
        };
        const openedElement = element;
        element.addEventListener('close', () => {
          if (element !== openedElement) return;
          context.dispatch({ type: 'cancel', reason: 'dialog-closed' });
          void close().catch(() => undefined);
        });
        element.append(form.element);
        element.addEventListener('cancel', (event) => {
          event.preventDefault();
          if (options.closeOnEscape !== false) {
            context.dispatch({ type: 'cancel', reason: 'escape' });
            void close().catch(() => undefined);
          }
        });
        (options.container ?? document.body).append(element);
        element.showModal();
        const first = [...form.controls.values()].find(
          (control) =>
            !control.element.hidden &&
            !control.element.querySelector(':disabled'),
        );
        void Promise.resolve(first?.focus?.()).catch(() => {
          context.dispatch({ type: 'cancel', reason: 'focus-unavailable' });
        });
        unsubscribe = context.subscribe((snapshot) => {
          if (snapshot.uncertainties?.length) {
            retained = true;
            return;
          }
          if (['committed', 'cancelled', 'failed'].includes(snapshot.phase))
            void close().catch(() => undefined);
        });
      } catch (cause) {
        void close().catch(() => undefined);
        throw cause;
      }
    },
    destroy() {
      return close();
    },
  };
}
