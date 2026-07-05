import { test, expect } from './helpers';

test.describe('Processamento page', () => {
  test('loads without errors', async ({ loggedInPage: page }) => {
    await page.goto('/demo-clinic/processamento');
    await page.waitForLoadState('networkidle');

    const main = page.locator('main');

    // Page title
    await expect(main.getByRole('heading', { name: 'Processamento' })).toBeVisible();

    // Info banner about async processing
    await expect(main.getByText('assíncrono')).toBeVisible();

    // Should have "Novo Processamento" button
    await expect(main.getByRole('button', { name: 'Novo Processamento' })).toBeVisible();
  });

  test('shows empty state or recordings table', async ({ loggedInPage: page }) => {
    await page.goto('/demo-clinic/processamento');
    await page.waitForLoadState('networkidle');

    const main = page.locator('main');

    // Either empty state or table
    const emptyState = main.getByText('Nenhum processamento');
    const table = main.locator('table');

    const hasEmpty = await emptyState.count();
    const hasTable = await table.count();

    expect(hasEmpty > 0 || hasTable > 0).toBeTruthy();
  });

  test('can open new processing dialog', async ({ loggedInPage: page }) => {
    await page.goto('/demo-clinic/processamento');
    await page.waitForLoadState('networkidle');

    const main = page.locator('main');

    // Click "Novo Processamento"
    await main.getByRole('button', { name: 'Novo Processamento' }).click();

    // Dialog should appear
    const dialog = page.locator('[role="dialog"]');
    await expect(dialog).toBeVisible({ timeout: 5_000 });

    // Should show step indicator (Sessão / Áudios) — use dialog scope
    await expect(dialog.getByText('Sessão', { exact: true })).toBeVisible();
    await expect(dialog.getByText('Áudios', { exact: true })).toBeVisible();

    // Should have patient selector
    await expect(dialog.getByText('Paciente *', { exact: true })).toBeVisible();

    // Should have date field
    await expect(dialog.locator('#proc-date')).toBeVisible();

    // Should have "Continuar" button
    await expect(dialog.getByRole('button', { name: 'Continuar' })).toBeVisible();
  });

  test('validates required fields in session form', async ({ loggedInPage: page }) => {
    await page.goto('/demo-clinic/processamento');
    await page.waitForLoadState('networkidle');

    const main = page.locator('main');

    await main.getByRole('button', { name: 'Novo Processamento' }).click();
    const dialog = page.locator('[role="dialog"]');
    await expect(dialog).toBeVisible({ timeout: 5_000 });

    // Click Continue without filling anything
    await dialog.getByRole('button', { name: 'Continuar' }).click();

    // Should show validation errors
    await expect(dialog.getByText('Paciente é obrigatório')).toBeVisible({ timeout: 3_000 });
  });

  test('has status filter dropdown', async ({ loggedInPage: page }) => {
    await page.goto('/demo-clinic/processamento');
    await page.waitForLoadState('networkidle');

    const main = page.locator('main');

    // The status filter should be visible
    const filterTrigger = main.locator('[role="combobox"]').first();
    await expect(filterTrigger).toBeVisible();
  });
});
