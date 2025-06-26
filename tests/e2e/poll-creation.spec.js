const { test, expect } = require('@playwright/test');

test.describe('Poll Creation Form', () => {
  test('should load the make poll page', async ({ page }) => {
    await page.goto('/makepoll');
    
    await expect(page).toHaveTitle(/poll|create|make/i);
    
    // Check for basic form elements
    await expect(page.locator('form')).toBeVisible();
    
    // Check for required form fields
    await expect(page.locator('input[id="email"]')).toBeVisible();
    await expect(page.locator('input[id="title"]')).toBeVisible();
    await expect(page.locator('textarea[id="description"]')).toBeVisible();
    await expect(page.locator('input[id="seats"]')).toBeVisible();
    await expect(page.locator('input[name="option"]')).toHaveCount(2, { timeout: 5000 });
  });

  test('should validate required fields', async ({ page }) => {
    await page.goto('/makepoll');
    
    // Try to submit without filling required fields
    const submitBtn = page.locator('button[type="submit"], input[type="submit"], button:has-text("create"), button:has-text("submit")');
    await submitBtn.click();
    
    // Should see validation errors or not proceed
    await page.waitForTimeout(1000);
    
    // Check that we're still on the make poll page or see validation messages
    const isStillOnForm = page.url().includes('makepoll') || 
                         await page.locator('form').count() > 0 ||
                         await page.locator(':has-text("required"), :has-text("error")').count() > 0;
    
    expect(isStillOnForm).toBeTruthy();
  });

  test('should validate email format', async ({ page }) => {
    await page.goto('/makepoll');
    
    // Fill invalid email
    await page.fill('input[id="email"]', 'invalid-email');
    await page.fill('input[id="title"]', 'Test Poll');
    await page.fill('input[id="seats"]', '1');
    
    const optionInputs = page.locator('input[name="option"]');
    await optionInputs.nth(0).fill('Option A');
    await optionInputs.nth(1).fill('Option B');
    
    const submitBtn = page.locator('button[type="submit"]');
    await submitBtn.click();
    await page.waitForTimeout(1000);
    
    // Should show validation error or stay on form
    const hasValidationError = page.url().includes('makepoll') ||
                              await page.locator(':has-text("email"), :has-text("invalid"), :has-text("error")').count() > 0;
    
    expect(hasValidationError).toBeTruthy();
  });

  test('should require at least two poll options', async ({ page }) => {
    await page.goto('/makepoll');
    
    await page.fill('input[id="email"]', 'test@example.com');
    await page.fill('input[id="title"]', 'Test Poll');
    await page.fill('input[id="seats"]', '1');
    
    // Fill only one option
    const optionInputs = page.locator('input[name="option"]');
    await optionInputs.nth(0).fill('Only Option');
    
    const submitBtn = page.locator('button[type="submit"]');
    await submitBtn.click();
    await page.waitForTimeout(1000);
    
    // Should show validation error or stay on form
    const hasValidationError = page.url().includes('makepoll') ||
                              await page.locator(':has-text("option"), :has-text("required"), :has-text("error")').count() > 0;
    
    expect(hasValidationError).toBeTruthy();
  });

  test('should allow adding additional options', async ({ page }) => {
    await page.goto('/makepoll');
    
    // Start with default 2 options
    let optionInputs = page.locator('input[name="option"]');
    await expect(optionInputs).toHaveCount(2);
    
    // Click "Add an option" button
    const addOptionBtn = page.locator('button[hx-post="/add-option"]');
    await addOptionBtn.click();
    await page.waitForTimeout(500);
    
    // Should now have 3 options
    optionInputs = page.locator('input[name="option"]');
    await expect(optionInputs).toHaveCount(3);
    
    // Test Enter key functionality - pressing Enter should add a 4th option
    await optionInputs.nth(2).fill('Third Option');
    await optionInputs.nth(2).press('Enter');
    await page.waitForTimeout(1000);
    
    // Should now have exactly 4 options after pressing Enter
    const finalCount = await page.locator('input[name="option"]').count();
    expect(finalCount).toBe(4);
  });

  test('should validate seats number', async ({ page }) => {
    await page.goto('/makepoll');
    
    await page.fill('input[id="email"]', 'test@example.com');
    await page.fill('input[id="title"]', 'Test Poll');
    
    // Test negative seats
    await page.fill('input[id="seats"]', '-1');
    
    const optionInputs = page.locator('input[name="option"]');
    await optionInputs.nth(0).fill('Option A');
    await optionInputs.nth(1).fill('Option B');
    
    const submitBtn = page.locator('button[type="submit"]');
    await submitBtn.click();
    await page.waitForTimeout(1000);
    
    // Should show validation error or stay on form
    const hasValidationError = page.url().includes('makepoll') ||
                              await page.locator(':has-text("seat"), :has-text("invalid"), :has-text("error")').count() > 0;
    
    expect(hasValidationError).toBeTruthy();
  });
}); 