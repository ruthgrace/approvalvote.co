const { test, expect } = require('@playwright/test');

test.describe('Home Page', () => {
  test('should load the home page successfully', async ({ page }) => {
    await page.goto('/');
    
    // Check that the page loads
    await expect(page).toHaveTitle(/approval/i);
    
    // Look for main navigation or content
    await expect(page.locator('body')).toBeVisible();
  });

  test('should have navigation to create a poll', async ({ page }) => {
    await page.goto('/');
    
    // Look for a link to create/make a poll
    const makePollLink = page.locator('a[href*="makepoll"], a:has-text("create"), a:has-text("make")').first();
    await expect(makePollLink).toBeVisible();
  });
}); 