import { test, expect } from './helpers';

test.describe('Onboarding page', () => {
  test('loads without errors and shows progress', async ({ loggedInPage: page }) => {
    await page.goto('/demo-clinic/onboarding');
    await page.waitForLoadState('networkidle');

    const main = page.locator('main');

    // Page title
    await expect(main.getByRole('heading', { name: 'Configuração & Onboarding' })).toBeVisible();

    // Progress card
    await expect(main.getByText('Progresso Geral')).toBeVisible();

    // Progress items (use exact match to avoid ambiguity)
    await expect(main.getByText('Documentos Enviados', { exact: true })).toBeVisible();
    await expect(main.getByText('Conceitos Extraídos', { exact: true })).toBeVisible();
    await expect(main.getByText('Pacientes Cadastrados', { exact: true })).toBeVisible();
    await expect(main.getByText('Sessões Criadas', { exact: true })).toBeVisible();
  });

  test('shows quick action buttons', async ({ loggedInPage: page }) => {
    await page.goto('/demo-clinic/onboarding');
    await page.waitForLoadState('networkidle');

    const main = page.locator('main');

    await expect(main.getByText('Ações Rápidas')).toBeVisible();
    await expect(main.getByRole('link', { name: 'Enviar Documentos', exact: true })).toBeVisible();
    await expect(main.getByRole('link', { name: 'Cadastrar Paciente', exact: true })).toBeVisible();
    await expect(main.getByRole('link', { name: 'Nova Sessão', exact: true })).toBeVisible();
  });

  test('shows steps checklist', async ({ loggedInPage: page }) => {
    await page.goto('/demo-clinic/onboarding');
    await page.waitForLoadState('networkidle');

    const main = page.locator('main');

    await expect(main.getByText('Etapas de Configuração')).toBeVisible();

    // Check that some steps are visible (use the step text from the checklist)
    await expect(main.getByText('Cadastrar pacientes', { exact: true })).toBeVisible();
    await expect(main.getByText('Criar sessões', { exact: true })).toBeVisible();
  });

  test('shows AI suggestions', async ({ loggedInPage: page }) => {
    await page.goto('/demo-clinic/onboarding');
    await page.waitForLoadState('networkidle');

    const main = page.locator('main');

    await expect(main.getByText('Sugestões da IA')).toBeVisible();
    // Should have at least 1 suggestion
    const badge = main.locator('text=/\\d+ sugestões/');
    await expect(badge).toBeVisible();
  });
});
