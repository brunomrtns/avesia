import { test, expect } from './helpers';

test.describe('API Keys page', () => {
  test('loads without errors', async ({ loggedInPage: page }) => {
    await page.goto('/demo-clinic/api-keys');
    await page.waitForLoadState('networkidle');

    const main = page.locator('main');

    // Should show the page title
    await expect(main.getByRole('heading', { name: 'Chaves de API' })).toBeVisible();
  });

  test('has create key button', async ({ loggedInPage: page }) => {
    await page.goto('/demo-clinic/api-keys');
    await page.waitForLoadState('networkidle');

    const main = page.locator('main');

    // Should have "Nova Chave" button
    await expect(main.getByRole('button', { name: 'Nova Chave' })).toBeVisible();
  });

  test('can open create key dialog', async ({ loggedInPage: page }) => {
    await page.goto('/demo-clinic/api-keys');
    await page.waitForLoadState('networkidle');

    const main = page.locator('main');

    // Click "Nova Chave"
    await main.getByRole('button', { name: 'Nova Chave' }).click();

    // Dialog should appear
    const dialog = page.locator('[role="dialog"]');
    await expect(dialog).toBeVisible({ timeout: 5_000 });
  });
});
