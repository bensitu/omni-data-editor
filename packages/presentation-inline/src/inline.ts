import { editorError } from '@omnidataeditor/core';
import type { Presentation, PresentationContext } from '@omnidataeditor/core';
import { createEditorForm } from '@omnidataeditor/dom';
import type {
  FormOptions,
  InlineOptions,
  PresentationCapabilities,
  EditorForm,
  FocusHandle,
} from '@omnidataeditor/dom';

export interface InlinePresentationOptions<T>
  extends InlineOptions, FormOptions<T> {
  readonly fieldId?: string;
}
export function inline<T>(
  options: InlinePresentationOptions<T>,
): Presentation<T> {
  let form: EditorForm | undefined,
    root: HTMLElement | undefined,
    anchor: HTMLElement | undefined;
  let original: DocumentFragment | undefined,
    unsubscribe: (() => void) | undefined,
    observer: MutationObserver | undefined;
  let handle: FocusHandle | null = null,
    capabilities: PresentationCapabilities<T> = {};
  let generation = 0,
    disposal: Promise<void> = Promise.resolve();
  let releaseFocus = () => {};
  const close = () => {
    const closingGeneration = ++generation;
    releaseFocus();
    unsubscribe?.();
    unsubscribe = undefined;
    observer?.disconnect();
    observer = undefined;
    if (
      root &&
      anchor &&
      (anchor.contains(root) || !anchor.firstChild) &&
      original
    )
      anchor.replaceChildren(original);
    root?.remove();
    root = undefined;
    anchor = undefined;
    original = undefined;
    const current = form;
    form = undefined;
    const focus = handle;
    handle = null;
    if (!current) return disposal;
    disposal = Promise.all([disposal, Promise.resolve(current.destroy())]).then(
      async () => {
        if (focus && generation === closingGeneration)
          await capabilities.focus?.focus(focus);
      },
    );
    return disposal;
  };
  return {
    requiredCapabilities: [
      'anchor',
      'focus',
      ...(options.reveal === 'required' ? ['viewport'] : []),
    ],
    async mount(context: PresentationContext<T>) {
      if (typeof document === 'undefined')
        throw editorError(
          'presentation',
          'browser-required',
          'Inline editing requires a browser.',
        );
      const token = ++generation;
      if (root)
        throw editorError(
          'presentation',
          'presentation-in-use',
          'The inline presentation is already open.',
        );
      capabilities = context.capabilities as PresentationCapabilities<T>;
      if (
        !capabilities.anchor ||
        !capabilities.focus ||
        (options.reveal === 'required' && !capabilities.viewport)
      )
        throw editorError(
          'capability',
          'missing-capability',
          'Inline editing requires anchor, focus and any explicitly required viewport capability.',
        );
      const snapshot = context.getSnapshot();
      if (snapshot.draft.mode !== 'edit' || snapshot.draft.entity === null)
        throw editorError(
          'presentation',
          'inline-edit-required',
          'Inline presentation requires one existing entity.',
        );
      const field = options.fields.find(
        (field) => field.id === (options.fieldId ?? options.fields[0]?.id),
      );
      if (!field)
        throw editorError(
          'configuration',
          'unknown-field',
          'The inline field is not registered.',
        );
      const target = capabilities.anchor.resolveFieldAnchor(
        snapshot.draft.entity,
        field.id,
      );
      if (!target?.isConnected)
        throw editorError(
          'presentation',
          'anchor-unavailable',
          'The field anchor is not visible in the host.',
        );
      handle = capabilities.focus.captureFocus();
      if (options.reveal !== 'never' && capabilities.viewport)
        await capabilities.viewport.reveal(target, {
          block: 'nearest',
          inline: 'nearest',
        });
      if (
        token !== generation ||
        ['cancelled', 'committed', 'failed'].includes(
          context.getSnapshot().phase,
        )
      )
        return;
      anchor = target;
      original = document.createDocumentFragment();
      while (target.firstChild) original.append(target.firstChild);
      root = document.createElement('div');
      root.className = 'omnidataeditor-inline';
      form = createEditorForm(context, { ...options, fields: [field] });
      root.append(form.element);
      target.append(root);
      const currentForm = form;
      const onFocusOut = (event: FocusEvent) => {
        if (
          !currentForm.surfaces.contains(event.target) ||
          (options.blurBehavior ?? 'ignore') === 'ignore' ||
          currentForm.surfaces.contains(event.relatedTarget)
        )
          return;
        queueMicrotask(() => {
          if (
            token !== generation ||
            currentForm.surfaces.contains(document.activeElement)
          )
            return;
          if (options.blurBehavior === 'cancel')
            context.dispatch({ type: 'cancel', reason: 'focus-left-editor' });
          else if (currentForm.element.reportValidity()) void context.submit();
        });
      };
      document.addEventListener('focusout', onFocusOut);
      releaseFocus = () => {
        document.removeEventListener('focusout', onFocusOut);
      };
      root.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' && !event.defaultPrevented) {
          event.preventDefault();
          context.dispatch({ type: 'cancel', reason: 'escape' });
        }
      });
      unsubscribe = context.subscribe((current) => {
        if (['committed', 'cancelled', 'failed'].includes(current.phase))
          void close().catch(() => undefined);
      });
      observer = new MutationObserver(() => {
        if (token === generation && (!target.isConnected || !root?.isConnected))
          context.dispatch({ type: 'cancel', reason: 'anchor-removed' });
      });
      observer.observe(document.body, { childList: true, subtree: true });
      await form.controls.get(field.id)?.focus?.();
    },
    destroy() {
      return close();
    },
  };
}
