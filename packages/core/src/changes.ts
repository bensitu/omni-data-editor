import type { ChangeSet, FieldDefinition, SessionPhase } from './types.js';
import { editorError } from './errors.js';

export function changes<T>(
  fields: readonly FieldDefinition<T>[],
  original: T,
  candidate: T,
): ChangeSet<T> {
  const entries = fields.flatMap((field) => {
    const before = field.read(original),
      after = field.read(candidate);
    return (field.equals ?? Object.is)(before, after)
      ? []
      : [{ fieldId: field.id, path: field.path, before, after }];
  });
  return { original, candidate, changes: entries, dirty: entries.length > 0 };
}

const transitions: Record<SessionPhase, readonly SessionPhase[]> = {
  opening: ['editing', 'cancelled', 'failed'],
  editing: ['validating', 'cancelled', 'failed'],
  validating: ['editing', 'submitting', 'cancelled', 'failed'],
  submitting: ['committed', 'editing', 'cancelled', 'failed'],
  committed: [],
  cancelled: [],
  failed: [],
};

export function transition(from: SessionPhase, to: SessionPhase): SessionPhase {
  if (!transitions[from].includes(to))
    throw editorError(
      'invariant',
      'invalid-transition',
      'Invalid session state transition.',
    );
  return to;
}

export function terminal(phase: SessionPhase): boolean {
  return ['committed', 'cancelled', 'failed'].includes(phase);
}

export function identifier(): string {
  if (!globalThis.crypto?.getRandomValues)
    throw editorError(
      'configuration',
      'crypto-unavailable',
      'A cryptographic random number generator is required.',
    );
  if (typeof globalThis.crypto.randomUUID === 'function')
    return globalThis.crypto.randomUUID();
  const bytes = globalThis.crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6]! & 0x0f) | 0x40;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const value = [...bytes]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
  return `${value.slice(0, 8)}-${value.slice(8, 12)}-${value.slice(12, 16)}-${value.slice(16, 20)}-${value.slice(20)}`;
}

export function aborted<T>(
  promise: Promise<T>,
  signal: AbortSignal,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const abort = () =>
      reject(signal.reason ?? new Error('Operation cancelled.'));
    if (signal.aborted) {
      abort();
      return;
    }
    signal.addEventListener('abort', abort, { once: true });
    promise
      .then(resolve, reject)
      .finally(() => signal.removeEventListener('abort', abort))
      .catch(() => undefined);
  });
}
