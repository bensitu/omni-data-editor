import { test, expect, type Page } from '@playwright/test';
import type { Person, RequestRecord } from '../../examples/recovery/server';

type RuntimeEvent = { type: string; payload: { entity?: Person } };
async function read<T>(page: Page, id: string): Promise<T> {
  return JSON.parse((await page.locator(`#${id}`).textContent())!) as T;
}
const requests = (page: Page) => read<RequestRecord[]>(page, 'requests');
const people = (page: Page, id = 'host') => read<Person[]>(page, id);
const commits = async (page: Page) =>
  (await read<RuntimeEvent[]>(page, 'events')).filter(
    (event) => event.type === 'mutation:committed',
  );

test.beforeEach(async ({ page }) => {
  await page.goto('/recovery/');
});

for (const resolution of ['remote', 'local', 'merge'] as const) {
  test(`resolves a concurrent update using ${resolution} values and current preconditions`, async ({
    page,
  }) => {
    await page
      .getByRole('button', { name: 'Start conflict', exact: true })
      .click();
    await page.getByLabel('Name', { exact: true }).fill('Local Ada');
    await page.getByLabel('Salary', { exact: true }).fill('250');
    await page.getByRole('button', { name: 'Simulate remote update' }).click();
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(
      page.getByRole('button', { name: 'Use remote data' }),
    ).toBeVisible();
    expect((await requests(page))[0]!.entities[0]!.original!.revision).toBe(1);
    expect(await read<unknown[]>(page, 'writes')).toHaveLength(0);
    if (resolution === 'merge') {
      await page.getByLabel('Name conflict choice').selectOption('local');
      await page.getByLabel('Salary conflict choice').selectOption('remote');
      await page.getByRole('button', { name: 'Merge chosen fields' }).click();
    } else {
      await page
        .getByRole('button', {
          name:
            resolution === 'remote' ? 'Use remote data' : 'Keep local changes',
        })
        .click();
    }
    const expected = {
      name: resolution === 'remote' ? 'Remote Ada' : 'Local Ada',
      salary: resolution === 'local' ? 250 : 180,
    };
    await expect(page.getByLabel('Name', { exact: true })).toHaveValue(
      expected.name,
    );
    await expect(page.getByLabel('Salary', { exact: true })).toHaveValue(
      String(expected.salary),
    );
    const snapshot = await read<{
      current: { validation: { status: string } };
    }>(page, 'snapshot');
    expect(snapshot.current.validation.status).not.toBe('current');
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    expect((await people(page))[0]).toMatchObject({ ...expected, revision: 3 });
    const sent = await requests(page);
    expect(sent).toHaveLength(2);
    expect(sent[1]!.entities[0]!.original!.revision).toBe(2);
    expect(sent[1]!.clientMutationId).not.toBe(sent[0]!.clientMutationId);
    expect(await commits(page)).toHaveLength(1);
  });
}

for (const kind of ['update', 'create'] as const) {
  test(`reconciles an unknown ${kind} without duplicate writes or a stale late commit`, async ({
    page,
  }) => {
    await page.getByRole('button', { name: `Start unknown ${kind}` }).click();
    await page.getByLabel('Name', { exact: true }).fill('  Saved member  ');
    await page.getByLabel('Salary', { exact: true }).fill('450');
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.locator('#writes')).toContainText('Saved member');
    await expect(page.getByLabel('Name', { exact: true })).toBeDisabled();
    await page
      .getByRole('button', { name: 'Check duplicate submission' })
      .click();
    await expect(page.locator('.simulation-status')).toHaveText(
      'Submission: busy.',
    );
    expect(await requests(page)).toHaveLength(1);
    await page
      .getByRole('button', { name: 'Cancel waiting for response' })
      .click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.locator('#status')).toHaveText('Submission: uncertain.');
    const retained = await read<{
      retained: { draft: { candidate: Person }; uncertainties: unknown[] };
    }>(page, 'snapshot');
    expect(retained.retained.draft.candidate.name).toBe('  Saved member  ');
    expect(retained.retained.uncertainties).toHaveLength(1);
    await page.getByRole('button', { name: 'Try blocked operation' }).click();
    await expect(page.locator('#status')).toContainText(
      'Authoritative result unavailable',
    );
    expect(await requests(page)).toHaveLength(1);
    await page.getByRole('button', { name: 'Edit unrelated person' }).click();
    await expect(page.getByLabel('Name', { exact: true })).toHaveValue('Grace');
    await page.getByRole('button', { name: 'Cancel', exact: true }).click();
    await page
      .getByRole('button', { name: 'Reconcile authoritative data' })
      .click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(page.getByLabel('Name', { exact: true })).toHaveValue(
      kind === 'create' ? 'New member' : 'Saved member',
    );
    await page.getByRole('button', { name: 'Cancel', exact: true }).click();
    const reconciliation = await read<
      {
        request: { kind: string; clientMutationId?: string };
        result: { kind: string };
      }[]
    >(page, 'reconciliations');
    expect(reconciliation.map((item) => item.result.kind)).toEqual([
      'unknown',
      'present',
    ]);
    expect(reconciliation[1]!.request.kind).toBe(
      kind === 'create' ? 'by-client-mutation-id' : 'by-key',
    );
    if (kind === 'create')
      expect(reconciliation[1]!.request.clientMutationId).toBe(
        (await requests(page))[0]!.clientMutationId,
      );
    const before = await commits(page);
    expect(before).toHaveLength(kind === 'create' ? 1 : 0);
    if (kind === 'update')
      await page
        .getByRole('button', { name: 'Apply newer remote update' })
        .click();
    await page.getByRole('button', { name: 'Deliver held response' }).click();
    await expect(
      page.getByRole('button', { name: 'Deliver held response' }),
    ).toBeDisabled();
    expect(await commits(page)).toEqual(before);
    expect(await requests(page)).toHaveLength(1);
    expect(await read<unknown[]>(page, 'writes')).toHaveLength(1);
    const reflected = await people(page);
    expect(reflected).toHaveLength(kind === 'create' ? 4 : 3);
    expect(
      reflected.find((person) => person.id === (kind === 'create' ? 4 : 1)),
    ).toMatchObject(
      kind === 'create'
        ? { name: 'Saved member', salary: 450, revision: 1 }
        : { name: 'Remote Ada', salary: 180, revision: 3 },
    );
  });
}

for (const kind of ['update', 'create'] as const) {
  test(`accepts a late successful ${kind} response before reconciliation and clears recovery controls`, async ({
    page,
  }) => {
    await page.getByRole('button', { name: `Start unknown ${kind}` }).click();
    await page.getByLabel('Salary', { exact: true }).fill('700');
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.locator('#writes')).toContainText('700');
    await page
      .getByRole('button', { name: 'Cancel waiting for response' })
      .click();
    await expect(page.locator('#status')).toHaveText('Submission: uncertain.');
    await expect(
      page.getByRole('button', { name: 'Try blocked operation' }),
    ).toBeEnabled();
    await page.getByRole('button', { name: 'Deliver held response' }).click();
    await expect(
      page.getByRole('button', { name: 'Try blocked operation' }),
    ).toBeDisabled();
    await expect(
      page.getByRole('button', { name: 'Reconcile authoritative data' }),
    ).toBeDisabled();
    expect(await commits(page)).toHaveLength(1);
    expect(await requests(page)).toHaveLength(1);
    expect(await read<unknown[]>(page, 'reconciliations')).toEqual([]);
    expect(
      (await people(page)).find(
        (person) => person.id === (kind === 'create' ? 4 : 1),
      )!.salary,
    ).toBe(700);
  });
}

test('reconciles a partial batch before starting a new logical write for the rejected entity', async ({
  page,
}) => {
  await page
    .getByRole('button', { name: 'Start partial batch', exact: true })
    .click();
  await page.getByLabel('Salary', { exact: true }).fill('550');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Close', exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel('Salary', { exact: true })).toBeDisabled();
  expect(await commits(page)).toHaveLength(1);
  expect((await people(page)).map((person) => person.salary)).toEqual([
    550, 200, 300,
  ]);
  const snapshot = await read<{
    retained: {
      batch: {
        items: { key: number; outcome: { ok: boolean; kind?: string } }[];
      };
    };
  }>(page, 'snapshot');
  expect(
    snapshot.retained.batch.items.map(({ key, outcome }) => [
      key,
      outcome.ok ? 'success' : outcome.kind,
    ]),
  ).toEqual([
    [1, 'success'],
    [2, 'forbidden'],
    [3, 'transport'],
  ]);
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await page.getByRole('button', { name: 'Try blocked operation' }).click();
  await expect(page.locator('#status')).toContainText(
    'Authoritative result unavailable',
  );
  await page
    .getByRole('button', { name: 'Reconcile authoritative data' })
    .click();
  await expect(page.getByLabel('Salary', { exact: true })).toHaveValue('550');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  const sent = await requests(page);
  expect(
    sent.map((request) =>
      request.entities.map(({ candidate }) => candidate.id),
    ),
  ).toEqual([[1, 2, 3], [2]]);
  expect(sent[0]!.clientMutationId).not.toBe(sent[1]!.clientMutationId);
  expect(
    (await people(page)).map(({ name, salary }) => [name, salary]),
  ).toEqual([
    ['Ada', 550],
    ['Grace', 550],
    ['Katherine', 550],
  ]);
  expect(
    (await read<{ key: number }[]>(page, 'writes')).map((write) => write.key),
  ).toEqual([1, 3, 2]);
  expect(await read<unknown[]>(page, 'reconciliations')).toHaveLength(2);
});

for (const editAgain of [false, true]) {
  test(`retries known batch failures with ${editAgain ? 'a new logical write after editing' : 'the same logical mutation ID'}`, async ({
    page,
  }) => {
    await page.getByRole('button', { name: 'Start selective retry' }).click();
    await page.getByLabel('Salary', { exact: true }).fill('500');
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.locator('#status')).toHaveText('Submission: batch.');
    expect((await people(page)).map((person) => person.salary)).toEqual([
      500, 200, 500,
    ]);
    if (editAgain) await page.getByLabel('Salary', { exact: true }).fill('600');
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    const sent = await requests(page);
    expect(sent[1]!.entities.map(({ candidate }) => candidate.id)).toEqual(
      editAgain ? [1, 2, 3] : [2],
    );
    expect(sent[1]!.operationId).not.toBe(sent[0]!.operationId);
    expect(sent[1]!.clientMutationId === sent[0]!.clientMutationId).toBe(
      !editAgain,
    );
    expect((await people(page)).map((person) => person.salary)).toEqual(
      editAgain ? [600, 600, 600] : [500, 500, 500],
    );
  });
}

test('resets a dispatched operation and can repeat the scenario without stale work', async ({
  page,
}) => {
  await page.getByRole('button', { name: 'Start unknown update' }).click();
  await page.getByLabel('Salary', { exact: true }).fill('800');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.locator('#writes')).toContainText('800');
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Reset scenario' })
    .click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.locator('#status')).toHaveText('Ready.');
  for (const id of ['requests', 'writes', 'events', 'reconciliations'])
    expect(await read<unknown[]>(page, id)).toEqual([]);
  expect(await people(page)).toEqual(await people(page, 'server'));
  expect((await people(page))[0]!.salary).toBe(100);
  await page.getByRole('button', { name: 'Start unknown update' }).click();
  await expect(page.getByLabel('Salary', { exact: true })).toHaveValue('100');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.locator('#requests')).toContainText('update');
  await page
    .getByRole('button', { name: 'Cancel waiting for response' })
    .click();
  await expect(page.locator('#status')).toHaveText('Submission: uncertain.');
  expect(await requests(page)).toHaveLength(1);
  expect(await commits(page)).toHaveLength(0);
});
