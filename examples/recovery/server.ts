import type {
  EntityChangeSet,
  MutationContext,
  MutationOutcome,
  ReconciliationRequest,
  ReconciliationResult,
} from '@omnidataeditor/editor';

export type Person = {
  id: number;
  name: string;
  salary: number;
  revision: number;
};
export type Scenario = 'conflict' | 'update' | 'create' | 'batch' | 'retry';
export const initialPeople: readonly Person[] = [
  { id: 1, name: 'Ada', salary: 100, revision: 1 },
  { id: 2, name: 'Grace', salary: 200, revision: 1 },
  { id: 3, name: 'Katherine', salary: 300, revision: 1 },
];

export interface RequestRecord {
  kind: 'create' | 'update' | 'updateMany';
  clientMutationId: string;
  operationId: string;
  entities: { original: Person | null; candidate: Person }[];
}

/** In-memory protocol simulation, with server commits independent of response delivery. */
export class SimulatedServer {
  readonly people = new Map(
    initialPeople.map((person) => [person.id, { ...person }]),
  );
  readonly requests: RequestRecord[] = [];
  readonly writes: { key: number; clientMutationId: string; entity: Person }[] =
    [];
  readonly reconciliations: {
    request: ReconciliationRequest;
    result: ReconciliationResult<Person>;
  }[] = [];
  private readonly committed = new Map<string, Person>();
  private readonly created = new Map<string, Person>();
  private held:
    | {
        entity: Person;
        resolve: (outcome: MutationOutcome<Person>) => void;
      }
    | undefined;
  authoritative = false;

  constructor(
    readonly scenario: Scenario,
    private readonly changed: () => void,
  ) {}

  get holdingResponse() {
    return this.held !== undefined;
  }

  record(
    kind: RequestRecord['kind'],
    entities: RequestRecord['entities'],
    context: MutationContext,
  ) {
    this.requests.push({
      kind,
      entities,
      clientMutationId: context.clientMutationId,
      operationId: context.operationId,
    });
    this.changed();
  }

  write(candidate: Person, context: MutationContext): Person {
    const token = `${context.clientMutationId}:${candidate.id}`;
    const previous = this.committed.get(token);
    if (previous) return previous;
    const entity = {
      ...candidate,
      name: candidate.name.trim(),
      revision: (this.people.get(candidate.id)?.revision ?? 0) + 1,
    };
    this.people.set(entity.id, entity);
    this.committed.set(token, entity);
    this.writes.push({
      key: entity.id,
      clientMutationId: context.clientMutationId,
      entity,
    });
    this.changed();
    return entity;
  }

  async update(
    original: Person,
    candidate: Person,
    context: MutationContext,
  ): Promise<MutationOutcome<Person>> {
    this.record('update', [{ original, candidate }], context);
    const previous = this.committed.get(
      `${context.clientMutationId}:${candidate.id}`,
    );
    if (previous) return { ok: true, entity: previous };
    const remote = this.people.get(original.id)!;
    if (original.revision !== remote.revision)
      return { ok: false, kind: 'conflict', remote };
    const entity = this.write(candidate, context);
    if (this.scenario !== 'update' || this.requests.length > 1)
      return { ok: true, entity };
    return this.hold(entity);
  }

  async create(
    candidate: Person,
    context: MutationContext,
  ): Promise<MutationOutcome<Person>> {
    this.record('create', [{ original: null, candidate }], context);
    const previous = this.created.get(context.clientMutationId);
    if (previous) return { ok: true, entity: previous };
    const entity = this.write(
      { ...candidate, id: Math.max(...this.people.keys()) + 1 },
      context,
    );
    this.created.set(context.clientMutationId, entity);
    return this.hold(entity);
  }

  batch(items: readonly EntityChangeSet<Person>[], context: MutationContext) {
    this.record(
      'updateMany',
      items.map(({ original, candidate }) => ({ original, candidate })),
      context,
    );
    return {
      atomicity: 'non-atomic' as const,
      items: items.map(({ key, original, candidate }) => {
        let outcome: MutationOutcome<Person>;
        const previous = this.committed.get(
          `${context.clientMutationId}:${key}`,
        );
        if (previous) {
          outcome = { ok: true, entity: previous };
        } else if (this.requests.length === 1 && key === 2) {
          outcome = {
            ok: false,
            kind: 'forbidden',
            message: 'Simulated refusal. The next request is allowed.',
          };
        } else if (
          original.revision !== this.people.get(candidate.id)!.revision
        ) {
          outcome = {
            ok: false,
            kind: 'conflict',
            remote: this.people.get(candidate.id)!,
          };
        } else {
          const entity = this.write(candidate, context);
          outcome =
            this.scenario === 'batch' && this.requests.length === 1 && key === 3
              ? {
                  ok: false,
                  kind: 'transport',
                  retryable: true,
                  certainty: 'unknown',
                }
              : { ok: true, entity };
        }
        return { key, outcome };
      }),
    };
  }

  remoteUpdate(key = 1) {
    const original = this.people.get(key)!;
    const entity = {
      ...original,
      name: 'Remote Ada',
      salary: 180,
      revision: original.revision + 1,
    };
    this.people.set(key, entity);
    this.changed();
    return entity;
  }

  reconcile(request: ReconciliationRequest): ReconciliationResult<Person> {
    const entity =
      request.kind === 'by-key'
        ? this.people.get(Number(request.entityKey))
        : this.writes.find(
            (write) => write.clientMutationId === request.clientMutationId,
          )?.entity;
    const result: ReconciliationResult<Person> =
      this.authoritative && entity
        ? { kind: 'present', entity }
        : { kind: 'unknown' };
    this.reconciliations.push({ request, result });
    this.changed();
    return result;
  }

  private hold(entity: Person): Promise<MutationOutcome<Person>> {
    return new Promise((resolve) => {
      this.held = { entity, resolve };
      this.changed();
    });
  }

  release() {
    const held = this.held;
    this.held = undefined;
    held?.resolve({ ok: true, entity: held.entity });
    this.changed();
  }
}
