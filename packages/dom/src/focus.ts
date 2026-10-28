import type { FocusCapability, ViewportCapability } from './types.js';

export interface FocusSurfaceRegistry {
  register(element: HTMLElement): () => void;
  contains(target: EventTarget | null): boolean;
  clear(): void;
}
export function createFocusSurfaceRegistry(): FocusSurfaceRegistry {
  const surfaces = new Set<HTMLElement>();
  return {
    register(element) {
      surfaces.add(element);
      return () => {
        surfaces.delete(element);
      };
    },
    contains(target) {
      return (
        target instanceof Node &&
        [...surfaces].some((surface) => surface.contains(target))
      );
    },
    clear() {
      surfaces.clear();
    },
  };
}

export function browserFocus(): FocusCapability {
  return {
    captureFocus() {
      if (typeof document === 'undefined') return null;
      return document.activeElement instanceof HTMLElement
        ? { token: document.activeElement }
        : null;
    },
    focus(handle) {
      if (!(handle.token instanceof HTMLElement) || !handle.token.isConnected)
        return false;
      handle.token.focus();
      return document.activeElement === handle.token;
    },
    focusElement(element) {
      element.focus();
      return document.activeElement === element;
    },
  };
}

export function browserViewport(): ViewportCapability {
  return {
    isVisible(element) {
      const rect = element.getBoundingClientRect();
      return (
        rect.width > 0 &&
        rect.height > 0 &&
        rect.right > 0 &&
        rect.left < innerWidth &&
        rect.bottom > 0 &&
        rect.top < innerHeight
      );
    },
    reveal(element, options) {
      element.scrollIntoView(
        options ?? { block: 'nearest', inline: 'nearest' },
      );
    },
  };
}
