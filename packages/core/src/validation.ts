import type {
  EditorOptions,
  ValidationIssue,
  ValidatorResult,
  SessionMode,
} from './types.js';

export async function validateCandidate<T>(
  options: EditorOptions<T>,
  entity: T | null,
  candidate: T,
  revision: number,
  signal: AbortSignal,
  mode: SessionMode = entity === null ? 'create' : 'edit',
): Promise<readonly ValidationIssue[]> {
  const issues: ValidationIssue[] = [];
  const collect = (
    result: ValidatorResult,
    source: 'field' | 'form',
    fieldId?: string,
  ) => {
    if (!result) return;
    for (const issue of Array.isArray(result) ? result : [result])
      issues.push({
        ...issue,
        source: issue.source ?? source,
        ...(fieldId && !issue.fieldId ? { fieldId } : {}),
      });
  };
  const values = new Map(
    options.fields.map((field) => [field.id, field.read(candidate)]),
  );
  for (const field of options.fields) {
    const predicate = {
      candidate,
      fieldId: field.id,
      revision,
      mode,
      values,
    };
    if (field.visibleWhen?.(predicate) === false) continue;
    for (const validator of field.validators ?? []) {
      if (signal.aborted) return issues;
      collect(
        await validator(values.get(field.id), {
          entity,
          candidate,
          fieldId: field.id,
          revision,
          signal,
        }),
        'field',
        field.id,
      );
    }
  }
  for (const validator of options.validators ?? []) {
    if (signal.aborted) return issues;
    collect(
      await validator(candidate, { entity, candidate, revision, signal }),
      'form',
    );
  }
  if (options.schema && !signal.aborted) {
    const result = await options.schema['~standard'].validate(candidate);
    for (const issue of result.issues ?? []) {
      const segments = issue.path?.map((segment) =>
        typeof segment === 'object' ? segment.key : segment,
      );
      const path = segments?.every(
        (segment) => typeof segment === 'string' || typeof segment === 'number',
      )
        ? (segments as (string | number)[])
        : undefined;
      const field = path
        ? options.fields.find(
            (field) =>
              field.path.length === path.length &&
              field.path.every((key, index) => key === path[index]),
          )
        : undefined;
      issues.push({
        code: 'schema-validation',
        message: issue.message,
        source: 'schema',
        ...(path ? { path } : {}),
        ...(field ? { fieldId: field.id } : {}),
      });
      if (segments && !path) {
        try {
          options.logger?.log('warn', 'unmapped-schema-path');
        } catch {
          /* Diagnostics must not change validation. */
        }
      }
    }
  }
  return issues;
}

export function serverIssues<T>(
  options: EditorOptions<T>,
  issues: readonly ValidationIssue[],
): readonly ValidationIssue[] {
  return issues.map((issue) => {
    const path = issue.path;
    const field =
      !issue.fieldId && path
        ? options.fields.find(
            (field) =>
              field.path.length === path.length &&
              field.path.every((key, index) => key === path[index]),
          )
        : undefined;
    return {
      ...issue,
      ...(field ? { fieldId: field.id } : {}),
      source: 'server',
    };
  });
}
