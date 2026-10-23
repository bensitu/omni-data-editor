import { test, expect } from '@playwright/test';
test('reflects canonical edits into a real DataTable', async ({ page }) => {
  await page.goto('/datatables-dialog/');
  await page.getByRole('cell', { name: 'Ada Lovelace', exact: true }).click();
  await page.getByRole('button', { name: 'Edit selected' }).click();
  await page.getByLabel('Name', { exact: true }).fill('Katherine Johnson');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(
    page.getByRole('cell', { name: 'Katherine Johnson', exact: true }),
  ).toBeVisible();
});
