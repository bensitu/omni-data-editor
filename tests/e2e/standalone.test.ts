import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
test('edits, validates and removes an entity through native forms', async ({
  page,
}) => {
  await page.goto('/standalone/');
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByLabel('Name', { exact: true }).fill('Grace Hopper');
  await page.getByLabel('Salary').fill('');
  await page.getByLabel('Salary').pressSequentially('-0.5');
  await expect(page.getByLabel('Salary')).toHaveValue('-0.5');
  await page.getByLabel('Salary').fill('-');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByLabel('Salary').fill('130000');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(
    page.getByRole('heading', { name: 'Grace Hopper' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Remove', exact: true }).click();
  await expect(page.getByRole('status')).toHaveText('Employee removed.');
});
test('creates an entity and supports keyboard cancellation', async ({
  page,
}) => {
  await page.goto('/standalone/');
  await page.getByRole('button', { name: 'Create employee' }).click();
  await page.getByLabel('Name', { exact: true }).fill('Katherine Johnson');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Katherine Johnson' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Create employee' }).click();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(
    page.getByRole('button', { name: 'Create employee' }),
  ).toBeFocused();
});
test('associates labels and errors without automated accessibility violations', async ({
  page,
}) => {
  await page.goto('/standalone/');
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  const results = await new AxeBuilder({ page }).include('dialog').analyze();
  expect(results.violations).toEqual([]);
});
