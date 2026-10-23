import { test, expect } from '@playwright/test';
for (const presentation of ['dialog', 'inline']) {
  test(`reflects canonical edits through Tabulator ${presentation}`, async ({
    page,
  }) => {
    await page.goto(`/tabulator-${presentation}/`);
    await page
      .getByRole('gridcell', { name: 'Ada Lovelace', exact: true })
      .click();
    await page.getByRole('button', { name: 'Edit selected' }).click();
    await page.getByLabel('Name', { exact: true }).fill('Katherine Johnson');
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.locator('.omnidataeditor-form')).toHaveCount(0);
    await expect(
      page.getByRole('gridcell', { name: 'Katherine Johnson', exact: true }),
    ).toBeVisible();
  });
}
