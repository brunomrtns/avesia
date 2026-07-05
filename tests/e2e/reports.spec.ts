import { test, expect } from './helpers';

test.describe('Reports page', () => {
  test('loads without errors and shows report cards', async ({ loggedInPage: page }) => {
    await page.goto('/demo-clinic/reports');
    await page.waitForLoadState('networkidle');

    const main = page.locator('main');

    // Should show report cards (use heading role to avoid sidebar ambiguity)
    await expect(main.getByRole('heading', { name: 'Sessões' })).toBeVisible();
    await expect(main.getByRole('heading', { name: 'Pacientes' })).toBeVisible();
  });

  test('has download buttons', async ({ loggedInPage: page }) => {
    await page.goto('/demo-clinic/reports');
    await page.waitForLoadState('networkidle');

    const main = page.locator('main');

    // Should have download buttons
    const downloadButtons = main.locator('button:has-text("Baixar"), button:has-text("Download"), button:has-text("CSV"), button:has-text("Exportar")');
    const count = await downloadButtons.count();
    expect(count).toBeGreaterThan(0);
  });
});
