const { test, expect } = require('@playwright/test');

test.describe('Playwright Setup Verification', () => {
  test('should load a basic page', async ({ page }) => {
    // Test basic functionality
    await page.goto('https://example.com');
    await expect(page).toHaveTitle(/Example/);
    await expect(page.locator('h1')).toBeVisible();
  });

  test('should work with local development server', async ({ page }) => {
    // This will test that the webServer configuration works
    // It should automatically start your Flask app
    await page.goto('/');
    
    // Basic checks - adapt based on your actual home page
    await expect(page.locator('body')).toBeVisible();
    
    // Check if it's loading properly (might fail if server isn't running)
    // This is expected to fail initially - just for testing setup
    console.log('Current URL:', page.url());
    console.log('Page title:', await page.title());
  });
}); 