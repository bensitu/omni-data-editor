import { test, expect } from '@playwright/test';
test('edits two selected entities while preserving their different names', async ({
  page,
}) => {
  await page.goto('/datatables-dialog/');
  await page.getByRole('cell', { name: 'Ada Lovelace', exact: true }).click();
  await page.getByRole('cell', { name: 'Grace Hopper', exact: true }).click();
  await page.getByRole('button', { name: 'Edit selected' }).click();
  await page.getByLabel('Salary', { exact: true }).fill('140000');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(
    page.getByRole('cell', { name: '140000', exact: true }),
  ).toHaveCount(2);
  await expect(
    page.getByRole('cell', { name: 'Ada Lovelace', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('cell', { name: 'Grace Hopper', exact: true }),
  ).toBeVisible();
});
