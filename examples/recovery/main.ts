import {
  createEditor,
  dialog,
  numberField,
  textField,
  type EditorRuntime,
  type EditSession,
  type SessionSnapshot,
  type SubmitOutcome,
} from '@omnidataeditor/editor';
import {
  SimulatedServer,
  initialPeople,
  type Person,
  type Scenario,
} from './server';
import '@omnidataeditor/theme-default/styles.css';
import './style.css';

function element<T extends HTMLElement>(id: string): T {
  const result = document.getElementById(id);
  if (!result) throw new Error(`Missing recovery element: ${id}`);
  return result as T;
}

const fields = [
  textField<Person>('name', { label: 'Name', required: true }),
  numberField<Person>('salary', { label: 'Salary', required: true, min: 0 }),
];
let server: SimulatedServer;
let editor: EditorRuntime<Person>;
let active: EditSession<Person> | undefined;
let retained: SessionSnapshot<Person> | undefined;
let host = new Map<number, Person>();
let events: { type: string; payload: unknown }[] = [];
let recovered = false;
let resetting = false;
let generation = 0;

function json(id: string, value: unknown) {
  element(id).textContent = JSON.stringify(
    value,
    (_key, item) =>
      item instanceof Map
        ? Object.fromEntries(item)
        : item instanceof Set
          ? [...item]
          : item,
    2,
  );
}

function status(message: string) {
  element('status').textContent = message;
  const dialogStatus = document.querySelector('.simulation-status');
  if (dialogStatus) dialogStatus.textContent = message;
}

function render() {
  if (!server) return;
  json('server', [...server.people.values()]);
  json('host', [...host.values()]);
  json('requests', server.requests);
  json('writes', server.writes);
  json('reconciliations', server.reconciliations);
  json('events', events);
  json('snapshot', {
    current: active?.snapshot() ?? null,
    retained: retained ?? null,
  });
  const uncertain = !!retained?.uncertainties?.length && !recovered;
  element<HTMLButtonElement>('blocked').disabled = !uncertain;
  element<HTMLButtonElement>('reconcile').disabled = !uncertain;
  element<HTMLButtonElement>('release').disabled = !server.holdingResponse;
  element<HTMLButtonElement>('newer').disabled =
    !recovered || server.scenario !== 'update';
  element<HTMLButtonElement>('unrelated').disabled = !uncertain;
}

function observe(session: EditSession<Person>) {
  active = session;
  session.subscribe((snapshot) => {
    if (snapshot.uncertainties?.length) retained = snapshot;
    render();
  });
  render();
  return session;
}

function openTarget() {
  return observe(
    server.scenario === 'create'
      ? editor.create()
      : editor.edit(host.get(server.scenario === 'batch' ? 3 : 1)!),
  );
}

function outcome(result: SubmitOutcome<Person>) {
  if (result.status === 'uncertain' && active) {
    retained = { ...active.snapshot(), uncertainties: [result.record] };
  }
  status(`Submission: ${result.status}.`);
  render();
}

function action(label: string, run: () => void | Promise<void>) {
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = label;
  button.onclick = () => {
    void Promise.resolve()
      .then(run)
      .catch((error: unknown) =>
        status(error instanceof Error ? error.message : String(error)),
      );
  };
  return button;
}

function configurePresentation(token: number) {
  const native = dialog({
    fields,
    title: 'Recovery editor',
    container: element('presentation'),
  });
  editor.use({
    requiredCapabilities: [],
    mount(context) {
      native.mount({
        ...context,
        async submit() {
          const result = await context.submit();
          if (token === generation) outcome(result);
          return result;
        },
      });
      const surface = element('presentation').querySelector('dialog')!;
      const tools = document.createElement('section');
      tools.className = 'simulation-tools';
      const heading = document.createElement('h3');
      heading.textContent = 'Simulation controls';
      const message = document.createElement('p');
      message.className = 'simulation-status';
      message.setAttribute('role', 'status');
      message.textContent = element('status').textContent;
      const buttons = document.createElement('div');
      buttons.className = 'actions';
      if (server.scenario === 'conflict') {
        buttons.append(
          action('Simulate remote update', () => {
            server.remoteUpdate();
            status('Remote revision changed. Save to detect the conflict.');
          }),
        );
        const choices = ['name', 'salary'].map((field) => {
          const label = document.createElement('label');
          label.textContent = `${field === 'name' ? 'Name' : 'Salary'} conflict choice`;
          const select = document.createElement('select');
          for (const value of ['local', 'remote'] as const) {
            const option = document.createElement('option');
            option.value = value;
            option.textContent = value;
            select.append(option);
          }
          label.append(select);
          tools.append(label);
          return select;
        });
        buttons.append(
          action('Merge chosen fields', () => {
            const result = context.dispatch({
              type: 'resolve-conflict',
              decision: {
                kind: 'merge',
                fields: {
                  name: choices[0]!.value as 'local' | 'remote',
                  salary: choices[1]!.value as 'local' | 'remote',
                },
              },
            });
            status(`Merge: ${result.status}.`);
          }),
        );
      }
      if (server.scenario === 'update' || server.scenario === 'create') {
        buttons.append(
          action('Check duplicate submission', async () =>
            outcome(await context.submit()),
          ),
          action('Cancel waiting for response', () => {
            context.dispatch({
              type: 'cancel',
              reason: 'simulated-response-loss',
            });
            status(
              'Waiting cancelled. Server commit is still unknown to the editor. Reconcile before writing again.',
            );
          }),
        );
      }
      buttons.append(action('Reset scenario', () => reset()));
      tools.prepend(heading);
      tools.append(buttons, message);
      surface.append(tools);
    },
    destroy: () => native.destroy(),
  });
}

async function reset(scenario: Scenario = 'conflict', start = false) {
  if (resetting) return;
  resetting = true;
  generation++;
  try {
    // Cancel first so a held response cannot become a new canonical commit during reset.
    active?.cancel('scenario-reset');
    const destruction = editor?.destroy();
    server?.release();
    await destruction;
    active = undefined;
    retained = undefined;
    recovered = false;
    events = [];
    host = new Map(initialPeople.map((person) => [person.id, { ...person }]));
    server = new SimulatedServer(scenario, render);
    editor = createEditor<Person>({
      fields,
      identity: (person) => person.id,
      createInitial: () => ({
        id: 0,
        name: 'New member',
        salary: 400,
        revision: 0,
      }),
      persistence: {
        update: ({ original, candidate }, context) =>
          server.update(original, candidate, context),
        create: ({ candidate }, context) => server.create(candidate, context),
      },
      batchPersistence: {
        async updateMany({ changes }, context) {
          return server.batch(changes.entities, context);
        },
      },
      reconciliation: {
        async reconcile(request) {
          const result = server.reconcile(request);
          if (request.kind === 'by-key' && result.kind === 'present') {
            host.set(result.entity.id, result.entity);
            render();
          }
          return result;
        },
      },
      logger: {
        log(_level, code) {
          if (code === 'reconciliation-required')
            status(
              'Authoritative result unavailable; no persistence request sent.',
            );
        },
      },
    });
    const reflect = (person: Person) => {
      host.set(person.id, person);
      render();
    };
    editor.attach({
      capabilities: {
        reflection: {
          reflectCreate: reflect,
          reflectUpdate: (_previous: Person, person: Person) => reflect(person),
        },
      },
      detach() {},
    });
    for (const type of [
      'mutation:started',
      'mutation:committed',
      'mutation:uncertain',
      'conflict:detected',
      'conflict:resolved',
      'session:cancelled',
    ] as const) {
      editor.on(type, (payload) => {
        events.push({ type, payload });
        render();
      });
    }
    editor.on('mutation:committed', ({ operationId, entity }) => {
      if (
        retained?.uncertainties?.some(
          (record) =>
            record.operationId === operationId &&
            (record.entityKey === undefined || record.entityKey === entity.id),
        )
      ) {
        recovered = true;
        render();
      }
    });
    configurePresentation(generation);
    element('instructions').textContent = !start
      ? 'Choose a scenario to begin. Starting a scenario resets the previous run.'
      : scenario === 'batch'
        ? 'Set Salary to 500 and save. Close the uncertain form, then reconcile. Recovery starts a new logical write for Grace only.'
        : scenario === 'retry'
          ? 'Set Salary to 500 and save. Save again without editing to retry only Grace with the same logical mutation ID.'
          : scenario === 'conflict'
            ? 'Edit Name and Salary, simulate a remote update, then Save. Resolve the conflict and Save again.'
            : 'Edit and Save once. While the response is held, check duplicate submission, then cancel waiting. Try the blocked operation, then reconcile.';
    status(start ? `Scenario: ${scenario}.` : 'Ready.');
    if (start) {
      if (scenario === 'batch' || scenario === 'retry')
        observe(editor.editMany([...host.values()]));
      else openTarget();
    }
    render();
  } finally {
    resetting = false;
  }
}

for (const button of document.querySelectorAll<HTMLButtonElement>(
  '[data-scenario]',
)) {
  button.onclick = () => {
    void reset(button.dataset.scenario as Scenario, true);
  };
}
element('reset').onclick = () => {
  void reset();
};
element('blocked').onclick = () => {
  openTarget();
};
element('release').onclick = () => {
  server.release();
  status('Held response delivered. Inspect canonical data and commit events.');
};
element('newer').onclick = () => {
  const person = server.remoteUpdate();
  host.set(person.id, person);
  editor.notifyExternalEntity(person, {
    source: 'simulated-authoritative-refresh',
  });
  status(
    'Newer authoritative revision applied. Deliver the old response to verify it is ignored.',
  );
  render();
};
element('unrelated').onclick = () => {
  observe(editor.edit(host.get(2)!));
};
element('reconcile').onclick = () => {
  server.authoritative = true;
  if (server.scenario === 'batch') {
    // Unknown batch results terminate the old session; a fresh session gets a new logical ID.
    const person = server.people.get(3)!;
    const result = server.reconcile({ kind: 'by-key', entityKey: person.id });
    if (result.kind !== 'present') return;
    host.set(person.id, result.entity);
    editor.notifyExternalEntity(result.entity, {
      source: 'simulated-authoritative-reconciliation',
    });
    const changeSet = retained?.changeSet;
    const rejected =
      changeSet && 'entities' in changeSet
        ? changeSet.entities.find((item) => item.key === 2)
        : undefined;
    const remaining = observe(editor.editMany([server.people.get(2)!]));
    for (const change of rejected?.changes ?? [])
      remaining.set(change.fieldId, change.after);
    status(
      'Katherine reconciled. New logical write for Grace only; confirmed successes are excluded.',
    );
  } else {
    openTarget();
    status(
      'Authoritative reconciliation requested. Cancel the fresh draft to avoid another write.',
    );
  }
  recovered = true;
  render();
};

void reset();
