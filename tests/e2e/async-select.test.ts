import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
test('searches and selects an asynchronous option using the keyboard', async ({
  page,
}) => {
  await page.goto('/async-select/');
  await page.getByRole('button', { name: 'Edit assignment' }).click();
  const input = page.getByRole('combobox', { name: 'Office' });
  await input.fill('o');
  await expect(
    page.getByRole('option', { name: 'Tokyo', exact: true }),
  ).toBeVisible();
  await input.press('ArrowDown');
  await input.press('Enter');
  await expect(input).toHaveValue('Osaka');
  const results = await new AxeBuilder({ page }).include('dialog').analyze();
  expect(results.violations).toEqual([]);
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.locator('#result')).toHaveText('Ada · Osaka');
  await expect(page.getByRole('dialog')).toHaveCount(0);
});
