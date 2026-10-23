import type {
  EntityKey,
  Unsubscribe,
  ValidationIssue,
  FieldDefinition,
  RendererKey,
  PresentationContext,
} from '@omnidataeditor/core';
export interface HostEntityRef<T> {
  readonly key: EntityKey;
  readonly entity: T;
}
export interface SelectionCapability<T> {
  getSelected(): readonly HostEntityRef<T>[];
  subscribeSelection(listener: () => void): Unsubscribe;
}
export interface EntityBindingCapability<T> {
  resolve(target: unknown): HostEntityRef<T> | null;
}
export interface MutationReflectionCapability<T> {
  reflectCreate(entity: T): Promise<void>;
  reflectUpdate(previous: T, current: T): Promise<void>;
  reflectRemove(entity: T): Promise<void>;
}
export interface FieldAnchorCapability<T> {
  resolveFieldAnchor(entity: T, fieldId: string): HTMLElement | null;
}
export interface FocusHandle {
  readonly token: unknown;
}
export interface FocusCapability {
  captureFocus(): FocusHandle | null;
  focus(handle: FocusHandle): boolean | Promise<boolean>;
  focusElement?(element: HTMLElement): boolean | Promise<boolean>;
}
export interface ViewportCapability {
  isVisible(element: Element): boolean;
  reveal(
    element: Element,
    options?: {
      readonly block?: ScrollLogicalPosition;
      readonly inline?: ScrollLogicalPosition;
      readonly behavior?: ScrollBehavior;
    },
  ): void | Promise<void>;
}
export interface PresentationCapabilities<T> {
  readonly selection?: SelectionCapability<T>;
  readonly binding?: EntityBindingCapability<T>;
  readonly reflection?: MutationReflectionCapability<T>;
  readonly anchor?: FieldAnchorCapability<T>;
  readonly focus?: FocusCapability;
  readonly viewport?: ViewportCapability;
}
export interface DomPresentationContext<T> extends PresentationContext<T> {
  readonly capabilities: PresentationCapabilities<T>;
}
export interface FieldRendererContext<T, V> {
  readonly field: FieldDefinition<T, V>;
  readonly signal: AbortSignal;
  reportInput(event: {
    readonly kind: 'input' | 'commit';
    readonly value: V;
  }): void;
  registerOwnedFocusSurface?(element: HTMLElement): Unsubscribe;
}
export interface FieldRendererInstance<V = unknown> {
  setMixed?(mixed: boolean): void;
  readonly element: HTMLElement;
  setValue(value: V): void;
  setDisabled(disabled: boolean): void;
  setReadOnly(readOnly: boolean): void;
  setVisible(visible: boolean): void;
  setIssues(issues: readonly ValidationIssue[]): void;
  focus?(): void | Promise<void>;
  destroy(): void | Promise<void>;
}
export interface FieldRendererFactory<T, V> {
  create(context: FieldRendererContext<T, V>): FieldRendererInstance<V>;
}
export interface RendererRegistry {
  register(
    key: RendererKey,
    factory: FieldRendererFactory<unknown, unknown>,
  ): void;
}
export type InlineBlurBehavior = 'ignore' | 'submit' | 'cancel';
export interface InlineOptions {
  readonly blurBehavior?: InlineBlurBehavior;
  readonly reveal?: 'never' | 'if-supported' | 'required';
}
