import {
  field,
  configurationError,
  readPath,
  writePath,
} from '@omnidataeditor/core';
import type {
  FieldDefinition,
  FieldPath,
  MessageLike,
  FieldValidator,
} from '@omnidataeditor/core';

export const asyncSelectRendererKey = '@omnidataeditor/async-select';
export interface AsyncSelectFieldOptions<T, V> {
  readonly path?: FieldPath;
  readonly label?: MessageLike;
  readonly read?: (entity: T) => V;
  readonly write?: (entity: T, value: V) => T;
  readonly validators?: readonly FieldValidator<T, V>[];
  readonly required?: boolean;
  readonly equals?: (a: V, b: V) => boolean;
  readonly renderer?: string;
}
export function asyncSelectField<T extends object, V = string>(
  id: string,
  options: AsyncSelectFieldOptions<T, V> = {},
): FieldDefinition<T> {
  const path = options.path ?? [id];
  if (
    (!options.read || !options.write) &&
    (path.length !== 1 || typeof path[0] !== 'string')
  )
    throw configurationError(
      'Nested asynchronous selection fields require explicit read and write accessors.',
    );
  return field<T, V>({
    id,
    path,
    renderer: options.renderer ?? asyncSelectRendererKey,
    read: options.read ?? ((entity) => readPath(entity, path) as V),
    write: options.write ?? ((entity, value) => writePath(entity, path, value)),
    ...(options.equals ? { equals: options.equals } : {}),
    ...(options.label !== undefined ? { label: options.label } : {}),
    validators: [
      (value) =>
        options.required &&
        (value === undefined || value === null || value === '')
          ? { code: 'required', fieldId: id, messageKey: 'required' }
          : null,
      ...(options.validators ?? []),
    ],
    presentation: { required: options.required ?? false },
  });
}
