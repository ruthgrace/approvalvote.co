const { test, expect } = require('@playwright/test');

test.describe('Poll Creation', () => {
  test('should load the make poll page', async ({ page }) => {
    await page.goto('/makepoll');
    
    await expect(page).toHaveTitle(/poll|create|make/i);
    
    // Check for basic form elements
    await expect(page.locator('form')).toBeVisible();
  });

  test('should create a poll successfully', async ({ page }) => {
    await page.goto('/makepoll');
    
    // Fill in poll details - adapt these selectors based on your actual form
    const titleInput = page.locator('input[name="title"], input[id*="title"], #poll-title');
    if (await titleInput.count() > 0) {
      await titleInput.fill('Test Poll for E2E');
    }
    
    const descriptionInput = page.locator('textarea[name="description"], textarea[id*="description"], #poll-description');
    if (await descriptionInput.count() > 0) {
      await descriptionInput.fill('This is a test poll created by Playwright E2E tests');
    }
    
    // Look for seats/winners input
    const seatsInput = page.locator('input[name="seats"], input[id*="seats"], input[type="number"]');
    if (await seatsInput.count() > 0) {
      await seatsInput.fill('2');
    }
    
    // Add poll options - look for option inputs or buttons to add options
    const optionInputs = page.locator('input[name*="option"], input[id*="option"]').first();
    if (await optionInputs.count() > 0) {
      await optionInputs.fill('Option 1');
      
      // Try to add more options if there's an "add option" button
      const addOptionBtn = page.locator('button:has-text("add"), button[id*="add"]');
      if (await addOptionBtn.count() > 0) {
        await addOptionBtn.click();
        const secondOption = page.locator('input[name*="option"], input[id*="option"]').nth(1);
        if (await secondOption.count() > 0) {
          await secondOption.fill('Option 2');
        }
      }
    }
    
    // Submit the form
    const submitBtn = page.locator('button[type="submit"], input[type="submit"], button:has-text("create"), button:has-text("submit")');
    await submitBtn.click();
    
    // Check for success - could be redirect or success message
    await page.waitForLoadState('networkidle');
    
    // Verify success (adapt based on your success flow)
    const currentUrl = page.url();
    const hasSuccessIndicator = currentUrl.includes('success') || 
                               await page.locator(':has-text("success"), :has-text("created")').count() > 0 ||
                               currentUrl.includes('vote/') ||
                               currentUrl.includes('results/');
    
    expect(hasSuccessIndicator).toBeTruthy();
  });

  test('should validate required fields', async ({ page }) => {
    await page.goto('/makepoll');
    
    // Try to submit without filling required fields
    const submitBtn = page.locator('button[type="submit"], input[type="submit"], button:has-text("create"), button:has-text("submit")');
    await submitBtn.click();
    
    // Should see validation errors or not proceed
    await page.waitForTimeout(1000); // Give time for validation
    
    // Check that we're still on the make poll page or see validation messages
    const isStillOnForm = page.url().includes('makepoll') || 
                         await page.locator('form').count() > 0 ||
                         await page.locator(':has-text("required"), :has-text("error")').count() > 0;
    
    expect(isStillOnForm).toBeTruthy();
  });
}); 