import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test('creates, validates and removes a member with asynchronous office selection', async ({
  page,
}) => {
  await page.goto('/showcase/');
  await page.getByRole('button', { name: 'Add member', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Full name', { exact: true }).fill('Alex Morgan');
  await dialog.getByLabel('Email address').fill('invalid');
  await dialog.getByLabel('Role', { exact: true }).fill('Software Engineer');
  await dialog.getByRole('button', { name: 'Save changes' }).click();
  await expect(dialog).toBeVisible();
  await expect(
    dialog.getByText('Enter a valid email address.').first(),
  ).toBeVisible();
  await expect(page.locator('#member-count')).toHaveText('8');
  await dialog.getByLabel('Email address').fill('alex@example.com');
  await dialog
    .getByLabel('Department', { exact: true })
    .selectOption('Engineering');
  await dialog
    .getByRole('combobox', { name: 'Office', exact: true })
    .fill('Sing');
  await dialog.getByRole('option', { name: 'Singapore', exact: true }).click();
  await dialog.getByRole('button', { name: 'Save changes' }).click();
  await expect(dialog).toHaveCount(0);
  const row = page.getByRole('row').filter({ hasText: 'alex@example.com' });
  await expect(
    row.getByRole('cell', { name: 'Singapore', exact: true }),
  ).toBeVisible();
  await expect(page.locator('#member-count')).toHaveText('9');
  await row
    .getByRole('checkbox', { name: 'Select Alex Morgan', exact: true })
    .check();
  await page
    .getByRole('button', { name: 'Remove selected member', exact: true })
    .click();
  await expect(row).toHaveCount(0);
  await expect(page.locator('#member-count')).toHaveText('8');
});

test('reflects inline and batch edits while preserving independent values and filters', async ({
  page,
}) => {
  await page.goto('/showcase/');
  await page
    .getByRole('button', { name: /^Edit salary for Olivia Rhye:/ })
    .click();
  await page.getByLabel('Annual salary (USD)', { exact: true }).fill('115000');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(
    page.getByRole('button', {
      name: /^Edit salary for Olivia Rhye:/,
    }),
  ).toHaveText('$115,000');
  await expect(page.locator('#payroll')).toHaveText('$877,000');
  await page
    .getByRole('checkbox', { name: 'Select Olivia Rhye', exact: true })
    .check();
  await page
    .getByRole('checkbox', { name: 'Select Phoenix Baker', exact: true })
    .check();
  await page
    .getByRole('button', { name: 'Edit selected (2)', exact: true })
    .click();
  await page
    .getByRole('dialog')
    .getByLabel('Department', { exact: true })
    .selectOption('Operations');
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  for (const name of ['Olivia Rhye', 'Phoenix Baker']) {
    const row = page.getByRole('row').filter({ hasText: name });
    await expect(
      row.getByRole('cell', { name: 'Operations', exact: true }),
    ).toBeVisible();
  }
  await expect(
    page.getByRole('button', {
      name: /^Edit salary for Phoenix Baker:/,
    }),
  ).toHaveText('$142,000');
  await page.getByLabel('Search members', { exact: true }).fill('olivia');
  await expect(page.locator('#table-summary')).toContainText(
    'Showing 1 of 8 members',
  );
  await page
    .getByRole('button', { name: 'Edit Olivia Rhye', exact: true })
    .click();
  await page.getByLabel('Full name', { exact: true }).fill('Unsaved name');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(
    page.getByRole('button', { name: 'Edit Olivia Rhye', exact: true }),
  ).toBeVisible();
  await page
    .getByRole('combobox', { name: 'Filter by department', exact: true })
    .selectOption('Design');
  await expect(page.getByText('No members match your filters.')).toBeVisible();
});

test('keeps the page and dialog accessible on desktop and narrow screens', async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 1100 });
  await page.goto('/showcase/');
  await expect(
    page.getByRole('button', { name: 'Edit Olivia Rhye', exact: true }),
  ).toBeVisible();
  expect(
    (await new AxeBuilder({ page }).analyze()).violations.map(
      ({ id, nodes }) => ({ id, targets: nodes.map((node) => node.target) }),
    ),
  ).toEqual([]);
  await page.screenshot({
    path: testInfo.outputPath('showcase-desktop.png'),
    fullPage: true,
  });
  await page.getByRole('button', { name: 'Add member', exact: true }).click();
  expect(
    (await new AxeBuilder({ page }).include('dialog').analyze()).violations,
  ).toEqual([]);
  await page.keyboard.press('Escape');
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(
    page.getByRole('button', { name: 'Add member', exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: testInfo.outputPath('showcase-mobile.png'),
    fullPage: true,
  });
  await page.getByRole('button', { name: 'Add member', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(
    page.getByRole('button', { name: 'Add member', exact: true }),
  ).toBeFocused();
});
