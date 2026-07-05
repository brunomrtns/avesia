import { test as base, type Page } from '@playwright/test';

// Demo credentials from the seed
const OWNER_EMAIL = 'owner@demo.avesia';
const OWNER_PASSWORD = 'password123';

// Login helper — navigates to /login, fills the form, submits, and waits for redirect
async function login(page: Page): Promise<void> {
  await page.goto('/login');
  await page.fill('#login-email', OWNER_EMAIL);
  await page.fill('#login-password', OWNER_PASSWORD);
  await page.click('button[type="submit"]');
  // Wait for redirect to the dashboard (URL should contain /demo-clinic)
  await page.waitForURL('**/demo-clinic**', { timeout: 15_000 });
}

// Extend the test fixture with a logged-in page
export const test = base.extend<{ loggedInPage: Page }>({
  loggedInPage: async ({ page }, use) => {
    await login(page);
    await use(page);
  },
});

export { expect } from '@playwright/test';
