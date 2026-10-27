import type { Presentation, PresentationContext } from '@omnidataeditor/core';
import { editorError } from '@omnidataeditor/core';
import { browserFocus, createEditorForm } from '@omnidataeditor/dom';
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
  let generation = 0;
  const close = () => {
    if (!element && !form) return closing;
    const token = ++generation;
    unsubscribe?.();
    unsubscribe = undefined;
    const current = form;
    form = undefined;
    element?.close();
    element?.remove();
    element = undefined;
    const handle = focus;
    focus = null;
    closing = Promise.all([closing, Promise.resolve(current?.destroy())]).then(
      () => {
        if (handle && generation === token) browserFocus().focus(handle);
      },
    );
    return closing;
  };
  return {
    requiredCapabilities: [],
    mount(context: PresentationContext<T>) {
      generation++;
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
      try {
        focus = browserFocus().captureFocus();
        element = document.createElement('dialog');
        element.className = 'omnidataeditor-dialog';
        const heading = document.createElement('h2');
        heading.id = `omnidataeditor-title-${context.getSnapshot().sessionId}`;
        heading.textContent = options.title ?? 'Edit entity';
        element.setAttribute('aria-labelledby', heading.id);
        element.append(heading);
        form = createEditorForm(context, options);
        element.append(form.element);
        element.addEventListener('cancel', (event) => {
          event.preventDefault();
          if (options.closeOnEscape !== false)
            context.dispatch({ type: 'cancel', reason: 'escape' });
        });
        (options.container ?? document.body).append(element);
        element.showModal();
        const first = [...form.controls.values()].find(
          (control) =>
            !control.element.hidden &&
            !control.element.querySelector(':disabled'),
        );
        void first?.focus?.();
        unsubscribe = context.subscribe((snapshot) => {
          if (['committed', 'cancelled'].includes(snapshot.phase))
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
