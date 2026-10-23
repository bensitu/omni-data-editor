import { test, expect } from '@playwright/test';
test('edits a DataTables field inline and restores the canonical display', async ({
  page,
}) => {
  await page.goto('/datatables-inline/');
  await page.getByRole('cell', { name: 'Ada Lovelace', exact: true }).click();
  await page.getByRole('button', { name: 'Edit selected' }).click();
  await page.getByLabel('Name', { exact: true }).fill('Inline employee');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.locator('.omnidataeditor-inline')).toHaveCount(0);
  await expect(
    page.getByRole('cell', { name: 'Inline employee', exact: true }),
  ).toBeVisible();
});
