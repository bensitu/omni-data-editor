import type { EditorError, ErrorCategory } from './types.js';

export function editorError(
  category: ErrorCategory,
  code: string,
  message: string,
  cause?: unknown,
): EditorError {
  return Object.assign(
    new Error(message, cause === undefined ? undefined : { cause }),
    {
      name: `${category[0]?.toUpperCase()}${category.slice(1)}Error`,
      category,
      code,
      recoverable: !['invariant', 'destroyed', 'configuration'].includes(
        category,
      ),
    },
  );
}

export function configurationError(message: string): EditorError {
  return editorError('configuration', 'invalid-configuration', message);
}

export function destroyedError(): EditorError {
  return editorError(
    'destroyed',
    'runtime-destroyed',
    'The editor has been destroyed.',
  );
}
