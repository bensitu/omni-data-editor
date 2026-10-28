import type {
  FieldDefinition,
  FieldPath,
  FieldValidator,
  MessageLike,
  EntityIdentity,
  ValidationIssue,
} from './types.js';
import { configurationError } from './errors.js';

export function safePath(path: FieldPath): void {
  if (
    !path.length ||
    path.some((key) =>
      typeof key !== 'string' && typeof key !== 'number'
        ? true
        : typeof key === 'number'
          ? !Number.isSafeInteger(key) || key < 0
          : ['__proto__', 'prototype', 'constructor'].includes(key),
    )
  ) {
    throw configurationError(
      'Field paths must contain safe property names or nonnegative integer indices.',
    );
  }
}

export function readPath(entity: unknown, path: FieldPath): unknown {
  safePath(path);
  return path.reduce<unknown>(
    (value, key) =>
      value === null ||
      value === undefined ||
      !Object.hasOwn(Object(value), key)
        ? undefined
        : (value as Record<string | number, unknown>)[key],
    entity,
  );
}

export function writePath<T>(entity: T, path: FieldPath, value: unknown): T {
  safePath(path);
  const replace = (source: unknown, depth: number): unknown => {
    const key = path[depth];
    if (key === undefined) return value;
    if (
      source !== null &&
      source !== undefined &&
      (typeof source !== 'object' ||
        (!Array.isArray(source) &&
          Object.getPrototypeOf(source) !== null &&
          Object.getPrototypeOf(Object.getPrototypeOf(source)) !== null))
    ) {
      throw configurationError(
        'Automatic field writers support plain objects and arrays. Supply accessors for custom models.',
      );
    }
    const copy = (
      Array.isArray(source)
        ? source.slice()
        : source === null || source === undefined
          ? typeof key === 'number'
            ? []
            : {}
          : { ...source }
    ) as Record<string | number, unknown>;
    if (Array.isArray(copy) && key === 'length')
      throw configurationError('Array length cannot be used as a field path.');
    copy[key] = replace(copy[key], depth + 1);
    return copy;
  };
  return replace(entity, 0) as T;
}

export function entityIdentity<T>(
  identity: EntityIdentity<T>,
): EntityIdentity<T> {
  return identity;
}

export function field<T, V>(
  definition: FieldDefinition<T, V>,
): FieldDefinition<T, unknown> {
  safePath(definition.path);
  const { equals, validators, ...base } = definition;
  return {
    ...base,
    path: Object.freeze([...definition.path]),
    write: (entity, value) => definition.write(entity, value as V),
    ...(equals
      ? { equals: (a: unknown, b: unknown) => equals(a as V, b as V) }
      : {}),
    ...(validators
      ? {
          validators: validators.map(
            (validator) => (value, context) => validator(value as V, context),
          ),
        }
      : {}),
  };
}

export interface FieldOptions<T, V> {
  readonly path?: FieldPath;
  readonly label?: MessageLike;
  readonly required?: boolean;
  readonly min?: number;
  readonly max?: number;
  readonly options?: readonly { readonly value: V; readonly label: string }[];
  readonly validators?: readonly FieldValidator<T, V>[];
  readonly equals?: (a: V, b: V) => boolean;
  readonly visibleWhen?: FieldDefinition<T>['visibleWhen'];
  readonly enabledWhen?: FieldDefinition<T>['enabledWhen'];
  readonly readOnlyWhen?: FieldDefinition<T>['readOnlyWhen'];
  readonly presentation?: Readonly<Record<string, unknown>>;
}

function factory<V>(renderer: string, accepts: (value: unknown) => value is V) {
  return function createField<T>(
    id: string,
    options: FieldOptions<T, V> = {},
  ): FieldDefinition<T, unknown> {
    const path = options.path ?? [id];
    const issue = (code: string): ValidationIssue => ({
      code,
      fieldId: id,
      source: 'field',
      messageKey: code,
    });
    const builtIn: FieldValidator<T, V> = (value) => {
      if (
        options.required &&
        (value === null ||
          value === undefined ||
          value === '' ||
          (renderer === 'checkbox' && value === false))
      )
        return issue('required');
      if (value === null || value === undefined) return null;
      if (
        options.options &&
        !options.options.some((option) =>
          (options.equals ?? Object.is)(option.value, value),
        )
      )
        return issue('invalid-option');
      if (!accepts(value)) return issue('invalid-value');
      if (
        typeof value === 'number' &&
        ((options.min !== undefined && value < options.min) ||
          (options.max !== undefined && value > options.max))
      )
        return issue('out-of-range');
      return null;
    };
    return field<T, V>({
      id,
      path,
      renderer,
      read: (entity) => readPath(entity, path) as V,
      write: (entity, value) => {
        if (value !== null && value !== undefined && !accepts(value))
          throw configurationError(`Invalid semantic value for field ${id}.`);
        return writePath(entity, path, value);
      },
      ...(options.label !== undefined ? { label: options.label } : {}),
      ...(options.equals ? { equals: options.equals } : {}),
      ...(options.visibleWhen ? { visibleWhen: options.visibleWhen } : {}),
      ...(options.enabledWhen ? { enabledWhen: options.enabledWhen } : {}),
      ...(options.readOnlyWhen ? { readOnlyWhen: options.readOnlyWhen } : {}),
      validators: [builtIn, ...(options.validators ?? [])],
      presentation: {
        ...options.presentation,
        ...(options.options ? { options: options.options } : {}),
        ...(options.required ? { required: true } : {}),
        ...(options.min !== undefined ? { min: options.min } : {}),
        ...(options.max !== undefined ? { max: options.max } : {}),
      },
    });
  };
}

const stringValue = (value: unknown): value is string =>
  typeof value === 'string';
export const textField = factory('text', stringValue);
export const textareaField = factory('textarea', stringValue);
export const dateField = factory('date', stringValue);
export const dateTimeField = factory('datetime-local', stringValue);
export const hiddenField = factory(
  'hidden',
  (_value: unknown): _value is unknown => true,
);
export const numberField = factory(
  'number',
  (value: unknown): value is number =>
    typeof value === 'number' && Number.isFinite(value),
);
export const checkboxField = factory(
  'checkbox',
  (value: unknown): value is boolean => typeof value === 'boolean',
);
export function selectField<T, V = string>(
  id: string,
  options: FieldOptions<T, V>,
): FieldDefinition<T> {
  if (!options.options)
    throw configurationError(`Options are required for field ${id}.`);
  return factory<V>(
    'select',
    (value: unknown): value is V =>
      options.options?.some((option) =>
        (options.equals ?? Object.is)(option.value, value as V),
      ) ?? false,
  )(id, options);
}
export function radioField<T, V = string>(
  id: string,
  options: FieldOptions<T, V>,
): FieldDefinition<T> {
  return { ...selectField(id, options), renderer: 'radio' };
}
