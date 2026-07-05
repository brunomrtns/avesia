import { test, expect } from './helpers';

test.describe('Patient Detail page', () => {
  test('loads patient detail with tabs', async ({ loggedInPage: page }) => {
    // First, go to patients list to find a patient ID
    await page.goto('/demo-clinic/patients');
    await page.waitForLoadState('networkidle');

    // Click on the first patient in the list
    const patientLink = page.locator('a[href*="/patients/"]').first();
    const hasPatients = await patientLink.count();

    if (hasPatients > 0) {
      await patientLink.click();
      await page.waitForLoadState('networkidle');

      // Should be on patient detail page
      await expect(page.locator('[role="tab"]')).toHaveCount(4, { timeout: 10_000 });

      // Tabs: Overview, Timeline, Consents, Alerts
      const tabLabels = ['Visão Geral', 'Timeline', 'Consentimentos', 'Alertas'];
      for (const label of tabLabels) {
        await expect(page.locator(`[role="tab"]:has-text("${label}")`)).toBeVisible();
      }
    } else {
      // No patients in the DB — skip this test
      test.skip(true, 'No patients found in the database');
    }
  });

  test('can switch between tabs', async ({ loggedInPage: page }) => {
    await page.goto('/demo-clinic/patients');
    await page.waitForLoadState('networkidle');

    const patientLink = page.locator('a[href*="/patients/"]').first();
    const hasPatients = await patientLink.count();

    if (hasPatients > 0) {
      await patientLink.click();
      await page.waitForLoadState('networkidle');

      // Click on Timeline tab
      await page.locator('[role="tab"]:has-text("Timeline")').click();
      await page.waitForTimeout(500);

      // Click on Consentimentos tab
      await page.locator('[role="tab"]:has-text("Consentimentos")').click();
      await page.waitForTimeout(500);

      // Click on Alertas tab
      await page.locator('[role="tab"]:has-text("Alertas")').click();
      await page.waitForTimeout(500);

      // Click back on Visão Geral
      await page.locator('[role="tab"]:has-text("Visão Geral")').click();
      await page.waitForTimeout(500);
    } else {
      test.skip(true, 'No patients found in the database');
    }
  });
});
