import DataTable from 'datatables.net';
import 'datatables.net-select';
import {
  createEditor,
  createRendererRegistry,
  dialog,
  inline,
  numberField,
  selectField,
  textField,
} from '@omnidataeditor/editor';
import type {
  Disposer,
  EditSession,
  FieldDefinition,
} from '@omnidataeditor/core';
import { dataTablesHost } from '@omnidataeditor/host-datatables';
import {
  asyncSelectField,
  asyncSelectRendererKey,
  createAsyncSelectRenderer,
} from '@omnidataeditor/field-async-select';
import '@omnidataeditor/theme-default/styles.css';
import './style.css';
import { initialMembers, offices, type Member } from './data';

function element<T extends HTMLElement>(selector: string): T {
  const result = document.querySelector<T>(selector);
  if (!result) throw new Error(`Missing showcase element: ${selector}`);
  return result;
}

const members = new Map(
  initialMembers.map((member) => [member.id, { ...member }]),
);
let nextId = initialMembers.length + 1;
const currency = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
});
const fields = [
  textField<Member>('name', {
    label: 'Full name',
    required: true,
    validators: [
      (value) =>
        value.trim()
          ? null
          : { code: 'name-required', message: 'Enter a full name.' },
    ],
  }),
  textField<Member>('email', {
    label: 'Email address',
    required: true,
    validators: [
      (value) =>
        /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
          ? null
          : { code: 'email-invalid', message: 'Enter a valid email address.' },
    ],
  }),
  textField<Member>('role', { label: 'Role', required: true }),
  selectField<Member>('department', {
    label: 'Department',
    options: ['Design', 'Engineering', 'Marketing', 'Operations'].map(
      (value) => ({ value, label: value }),
    ),
  }),
  asyncSelectField<Member>('office', { label: 'Office', required: true }),
  numberField<Member>('salary', {
    label: 'Annual salary (USD)',
    required: true,
    min: 0,
    max: 1000000,
  }),
  selectField<Member>('status', {
    label: 'Status',
    options: ['Active', 'On leave'].map((value) => ({ value, label: value })),
  }),
];
const registry = createRendererRegistry();
registry.register(
  asyncSelectRendererKey,
  createAsyncSelectRenderer({
    isValue: (value): value is string => typeof value === 'string',
    getKey: (value) => value,
    debounceMs: 180,
    async load(query, { signal }) {
      await new Promise<void>((resolve) => {
        if (signal.aborted) {
          resolve();
          return;
        }
        const finish = () => {
          signal.removeEventListener('abort', abort);
          resolve();
        };
        const timer = window.setTimeout(finish, 250);
        const abort = () => {
          window.clearTimeout(timer);
          finish();
        };
        signal.addEventListener('abort', abort, { once: true });
      });
      if (signal.aborted) return [];
      return offices
        .filter((office) =>
          office.toLowerCase().includes(query.trim().toLowerCase()),
        )
        .map((value) => ({ value, label: value }));
    },
  }),
);

function notify(message: string) {
  const notification = element('#notification');
  notification.textContent = message;
  notification.hidden = false;
  window.clearTimeout(notificationTimer);
  notificationTimer = window.setTimeout(() => {
    notification.hidden = true;
  }, 4200);
}
let notificationTimer = 0;

function record(title: string, description: string) {
  const list = element('#activity-list');
  list.querySelector('.activity-empty')?.remove();
  const item = document.createElement('li');
  const marker = document.createElement('span');
  marker.className = 'activity-marker';
  const content = document.createElement('div');
  const heading = document.createElement('strong');
  heading.textContent = title;
  const detail = document.createElement('p');
  detail.textContent = description;
  const time = document.createElement('time');
  time.className = 'activity-time';
  time.dateTime = new Date().toISOString();
  time.textContent = new Intl.DateTimeFormat('en', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date());
  content.append(heading, detail);
  item.append(marker, content, time);
  list.prepend(item);
  while (list.children.length > 4) list.lastElementChild?.remove();
}

function updateOverview() {
  const all = [...members.values()];
  const count = all.length.toString();
  element('#member-count').textContent = count;
  element('#nav-count').textContent = count;
  element('#all-count').textContent = count;
  element('#directory-count').textContent =
    `${count} ${all.length === 1 ? 'member' : 'members'}`;
  element('#department-count').textContent = new Set(
    all.map((member) => member.department),
  ).size.toString();
  element('#payroll').textContent = currency.format(
    all.reduce((total, member) => total + member.salary, 0),
  );
  element('#active-count').textContent = all
    .filter((member) => member.status === 'Active')
    .length.toString();
  element('#leave-count').textContent = all
    .filter((member) => member.status === 'On leave')
    .length.toString();
}

function canonical(candidate: Member): Member {
  return {
    ...candidate,
    name: candidate.name.trim(),
    email: candidate.email.trim().toLowerCase(),
    role: candidate.role.trim(),
  };
}

const editor = createEditor<Member>({
  fields,
  identity: (member) => member.id,
  createInitial: () => ({
    id: 0,
    name: '',
    email: '',
    role: '',
    department: 'Design',
    office: 'London',
    salary: 90000,
    status: 'Active',
  }),
  persistence: {
    async create({ candidate }) {
      const member = canonical({ ...candidate, id: nextId++ });
      members.set(member.id, member);
      updateOverview();
      return { ok: true, entity: member };
    },
    async update({ candidate }) {
      const member = canonical(candidate);
      members.set(member.id, member);
      updateOverview();
      return { ok: true, entity: member };
    },
    async remove({ entity }) {
      members.delete(entity.id);
      updateOverview();
      return { ok: true };
    },
  },
  batchPersistence: {
    async updateMany({ changes }) {
      const items = changes.entities.map(({ key, candidate }) => {
        const member = canonical(candidate);
        members.set(member.id, member);
        return { key, outcome: { ok: true as const, entity: member } };
      });
      updateOverview();
      return { atomicity: 'atomic', items };
    },
  },
});

function textNode(value: string, className?: string) {
  const node = document.createElement('span');
  if (className) node.className = className;
  node.textContent = value;
  return node;
}

function iconButton(name: string, symbol: string, className: string) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = className;
  button.setAttribute('aria-label', name);
  button.title = name;
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.classList.add('icon');
  svg.setAttribute('aria-hidden', 'true');
  const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
  use.setAttribute('href', `#${symbol}`);
  svg.append(use);
  button.append(svg);
  return button;
}

const table = new DataTable<Member>('#members', {
  data: [...members.values()],
  layout: { topStart: null, topEnd: null, bottomStart: null, bottomEnd: null },
  paging: false,
  ordering: false,
  select: { style: 'api' },
  columns: [
    {
      data: null,
      searchable: false,
      render: (_data: unknown, type: string, member: Member) => {
        if (type !== 'display') return '';
        const input = document.createElement('input');
        input.type = 'checkbox';
        input.className = 'row-select';
        input.setAttribute('aria-label', `Select ${member.name}`);
        return input;
      },
    },
    {
      data: 'name',
      render: (_data: unknown, type: string, member: Member) => {
        if (type !== 'display')
          return `${member.name} ${member.email} ${member.role}`;
        const cell = document.createElement('div');
        cell.className = 'member-cell';
        cell.append(
          textNode(
            member.name
              .split(/\s+/)
              .map((part) => part[0])
              .slice(0, 2)
              .join(''),
            `member-avatar avatar-${member.id % 6}`,
          ),
        );
        const details = document.createElement('div');
        details.append(
          textNode(member.name, 'member-name'),
          textNode(member.email, 'member-email'),
        );
        cell.append(details);
        cell.title = member.role;
        return cell;
      },
    },
    {
      data: 'department',
      render: (value: string, type) =>
        type === 'display'
          ? textNode(
              value,
              `department-badge department-${['Design', 'Engineering', 'Marketing', 'Operations'].indexOf(value)}`,
            )
          : value,
    },
    { data: 'office', render: DataTable.render.text() },
    {
      data: 'salary',
      render: (value: number, type: string, member: Member) => {
        if (type !== 'display') return value;
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'salary-button';
        button.setAttribute(
          'aria-label',
          `Edit salary for ${member.name}: ${currency.format(value)}`,
        );
        button.textContent = currency.format(value);
        return button;
      },
    },
    {
      data: 'status',
      render: (value: string, type) =>
        type === 'display'
          ? textNode(
              value,
              `status-badge ${value === 'Active' ? 'is-active' : 'is-away'}`,
            )
          : value,
    },
    {
      data: null,
      searchable: false,
      render: (_data: unknown, type: string, member: Member) =>
        type === 'display'
          ? iconButton(`Edit ${member.name}`, 'icon-edit', 'row-edit')
          : '',
    },
  ],
  language: {
    emptyTable: 'Your team starts here. Add a member to get going.',
    zeroRecords: 'No members match your filters.',
  },
});
const host = dataTablesHost(table, {
  identity: (member) => member.id,
  selection: true,
  columns: { name: 1, department: 2, office: 3, salary: 4, status: 5 },
  onExternalEntity: (member) => editor.notifyExternalEntity(member),
  onExternalRemoval: (key) => editor.notifyExternalRemoval(key),
});
editor.attach(host);
let currentSession: EditSession<Member> | undefined;
let disposePresentation: Disposer | undefined;
let opening = false;

async function openEditor(
  mode: 'create' | 'dialog' | 'inline' | 'batch',
  targets: readonly Member[] = [],
) {
  if (opening) return;
  opening = true;
  try {
    currentSession?.cancel();
    await disposePresentation?.();
    let shownFields: readonly FieldDefinition<Member>[] = fields;
    if (mode === 'batch')
      shownFields = fields.filter((field) =>
        ['department', 'office', 'salary', 'status'].includes(field.id),
      );
    disposePresentation = editor.use(
      mode === 'inline'
        ? inline({
            fields,
            registry,
            fieldId: 'salary',
            blurBehavior: 'ignore',
          })
        : dialog({
            fields: shownFields,
            registry,
            title:
              mode === 'create'
                ? 'Add a team member'
                : mode === 'batch'
                  ? `Edit ${targets.length} team members`
                  : 'Member details',
            messages: { save: 'Save changes' },
          }),
    );
    if (mode === 'create') currentSession = editor.create();
    else if (mode === 'batch') currentSession = editor.editMany(targets);
    else if (targets[0]) currentSession = editor.edit(targets[0]);
  } catch (error) {
    notify(
      error instanceof Error
        ? error.message
        : 'The editor could not be opened.',
    );
  } finally {
    opening = false;
  }
}

function selected() {
  return (
    host.capabilities.selection?.getSelected().map((item) => item.entity) ?? []
  );
}

function syncSelection() {
  const selection = selected();
  element<HTMLButtonElement>('#edit-selected').disabled =
    selection.length === 0;
  element('#edit-selected span').textContent =
    selection.length > 0
      ? `Edit selected (${selection.length})`
      : 'Edit selected';
  element<HTMLButtonElement>('#remove-selected').disabled =
    selection.length !== 1;
  const ids = new Set(selection.map((member) => member.id));
  const visible = table.rows({ search: 'applied' }).data().toArray();
  table.rows().every(function () {
    const checkbox = (
      this.node() as HTMLTableRowElement
    ).querySelector<HTMLInputElement>('.row-select');
    if (checkbox) checkbox.checked = ids.has(this.data().id);
  });
  const all = element<HTMLInputElement>('#select-all');
  const visibleSelected = visible.filter((member) => ids.has(member.id)).length;
  all.checked = visible.length > 0 && visibleSelected === visible.length;
  all.indeterminate = visibleSelected > 0 && visibleSelected < visible.length;
  all.disabled = visible.length === 0;
  element('#table-summary').textContent =
    `Showing ${visible.length} of ${members.size} members${selection.length ? ` · ${selection.length} selected` : ''}`;
}
host.capabilities.selection?.subscribeSelection(syncSelection);
table.on('draw', syncSelection);
element('#members').addEventListener('change', (event) => {
  const target = event.target;
  if (!(target instanceof HTMLInputElement) || !target.matches('.row-select'))
    return;
  const row = table.row(target.closest('tr')!);
  if (target.checked) row.select();
  else row.deselect();
});
element('#select-all').addEventListener('change', (event) => {
  const rows = table.rows({ search: 'applied' });
  if ((event.target as HTMLInputElement).checked) rows.select();
  else rows.deselect();
});
element('#members').addEventListener('click', (event) => {
  const target = event.target;
  if (!(target instanceof Element)) return;
  const button = target.closest<HTMLButtonElement>('.row-edit, .salary-button');
  if (!button) return;
  const member = table.row(button.closest('tr')!).data();
  button.focus();
  void openEditor(
    button.classList.contains('salary-button') ? 'inline' : 'dialog',
    [member],
  );
});
function buttonAction(selector: string, action: () => void) {
  const button = element<HTMLButtonElement>(selector);
  button.addEventListener('click', () => {
    button.focus();
    action();
  });
}

buttonAction('#add-member', () => {
  void openEditor('create');
});
buttonAction('#edit-selected', () => {
  const selection = selected();
  void openEditor(selection.length > 1 ? 'batch' : 'dialog', selection);
});
buttonAction('#remove-selected', () => {
  const member = selected()[0];
  if (!member) return;
  currentSession?.cancel();
  void editor
    .remove(member)
    .then((result) => {
      if (result.status === 'removed') {
        notify(`${member.name} removed from the sample team.`);
        syncSelection();
      } else notify('The member could not be removed. Try again.');
    })
    .catch(() => notify('The member could not be removed. Try again.'));
});

function applyFilters() {
  currentSession?.cancel();
  table.search(element<HTMLInputElement>('#search').value);
  table
    .column(2)
    .search(element<HTMLSelectElement>('#department-filter').value, {
      exact: true,
    });
  table
    .column(5)
    .search(
      document.querySelector<HTMLElement>('.status-tab[aria-pressed="true"]')
        ?.dataset.status ?? '',
      { exact: true },
    );
  table.draw();
}
element('#search').addEventListener('input', applyFilters);
element('#department-filter').addEventListener('change', applyFilters);
document.querySelectorAll<HTMLButtonElement>('.status-tab').forEach((button) =>
  button.addEventListener('click', () => {
    document
      .querySelectorAll('.status-tab')
      .forEach((tab) =>
        tab.setAttribute('aria-pressed', String(tab === button)),
      );
    applyFilters();
  }),
);

function demoTargets(count: number) {
  currentSession?.cancel();
  element<HTMLInputElement>('#search').value = '';
  element<HTMLSelectElement>('#department-filter').value = '';
  document
    .querySelectorAll<HTMLElement>('.status-tab')
    .forEach((tab) =>
      tab.setAttribute('aria-pressed', String(tab.dataset.status === '')),
    );
  applyFilters();
  const targets = [...members.values()].slice(0, count);
  if (targets.length < count) {
    notify(
      `Add ${count === 1 ? 'a member' : 'at least two members'} to try this interaction.`,
    );
    return [];
  }
  return targets;
}
buttonAction('#try-dialog', () => {
  const targets = demoTargets(1);
  if (targets.length) void openEditor('dialog', targets);
});
buttonAction('#try-inline', () => {
  const targets = demoTargets(1);
  if (targets.length) void openEditor('inline', targets);
});
buttonAction('#try-batch', () => {
  const targets = demoTargets(2);
  if (!targets.length) return;
  table.rows().deselect();
  table
    .rows((_index: number, member: Member) =>
      targets.some((target) => target.id === member.id),
    )
    .select();
  void openEditor('batch', targets);
});

editor.on('session:opened', ({ mode }) =>
  record(
    mode === 'create'
      ? 'New member draft'
      : mode === 'multi-edit'
        ? 'Shared draft opened'
        : 'Member draft opened',
    'Changes stay in the draft until you save.',
  ),
);
editor.on('validation:completed', ({ report }) => {
  if (report.status === 'current')
    record(
      report.valid ? 'Validation passed' : 'A detail needs attention',
      report.valid
        ? 'The current draft is ready to save.'
        : 'Check the highlighted fields and try again.',
    );
});
editor.on('mutation:committed', ({ entity }) => {
  record(
    'Member saved',
    `${entity.name} · Canonical data returned to the table.`,
  );
  notify(`Saved changes to ${entity.name}.`);
});
editor.on('mutation:removed', () =>
  record('Member removed', 'The host table reflects the updated team.'),
);
editor.on('session:cancelled', () =>
  record('Draft discarded', 'The original data is unchanged.'),
);
editor.on('host:reflection-failed', () =>
  notify(
    'Data was saved, but the table could not refresh. Reload the demo to reset it.',
  ),
);
updateOverview();
syncSelection();
window.addEventListener('pagehide', (event) => {
  if (event.persisted) return;
  window.clearTimeout(notificationTimer);
  void editor.destroy().finally(() => table.destroy());
});
