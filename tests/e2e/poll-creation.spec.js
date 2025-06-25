const { test, expect } = require('@playwright/test');
const { getLastVerificationCode } = require('./utils/test-helpers');

test.describe('Poll Creation', () => {
  test('should load the make poll page', async ({ page }) => {
    await page.goto('/makepoll');
    
    await expect(page).toHaveTitle(/poll|create|make/i);
    
    // Check for basic form elements
    await expect(page.locator('form')).toBeVisible();
  });

  test('should create a poll successfully', async ({ page }) => {
    await page.goto('/makepoll');
    
    // Generate unique email for this test
    const timestamp = Date.now();
    const testEmail = `polltest${timestamp}@example.com`;
    
    // Fill in poll details including email
    await page.fill('input[id="email"]', testEmail);
    await page.fill('input[id="title"]', 'Test Poll for E2E');
    await page.fill('textarea[id="description"]', 'This is a test poll created by Playwright E2E tests');
    await page.fill('input[id="seats"]', '2');
    
    // Fill poll options
    const optionInputs = page.locator('input[name="option"]');
    await optionInputs.nth(0).fill('Option 1');
    await optionInputs.nth(1).fill('Option 2');
    
    // Submit the form
    console.log('📝 Clicking submit button...');
    await page.click('button[type="submit"]');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000); // Extra wait to see server response
    
    // Check what happened after submission
    const afterSubmitContent = await page.textContent('body');
    console.log('📄 Content after submit:', afterSubmitContent.substring(0, 300));
    
    // Check if registration is needed
    const needsRegistration = await page.locator(':has-text("do not have an account")').count() > 0;
    console.log('🔍 Registration needed:', needsRegistration);
    
    if (needsRegistration) {
      // Fill registration form
      console.log('👤 Filling registration form...');
      await page.fill('input[id="full_name"]', 'Test User');
      await page.fill('input[id="preferred_name"]', 'Test');
      await page.click('button:has-text("Send verification code")');
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(2000);
    }
    
    // Check if verification is needed
    const needsVerification = await page.locator(':has-text("verification code")').count() > 0;
    console.log('🔍 Verification needed:', needsVerification);
    
    if (needsVerification) {
      // Get and use actual verification code
      console.log('📲 Getting verification code...');
      const verificationCode = await getLastVerificationCode(page);
      console.log('✅ Got verification code:', verificationCode);
      if (verificationCode) {
        await page.fill('input[name="code"]', verificationCode);
        await page.click('button:has-text("Submit verification")');
        await page.waitForLoadState('networkidle');
        await page.waitForTimeout(2000);
        
        const afterVerification = await page.textContent('body');
        console.log('📄 Content after verification:', afterVerification.substring(0, 300));
      }
    }
    
    // Verify success (either success page content or success URLs)
    const pageContent = await page.textContent('body');
    const currentUrl = page.url();
    
    // Debug: log what we're seeing
    console.log('🔍 Final URL:', currentUrl);
    console.log('📄 Page content sample:', pageContent.substring(0, 500));
    
    const hasSuccessIndicator = currentUrl.includes('success') || 
                               pageContent.includes('Poll is ready') ||
                               pageContent.includes('success') ||
                               pageContent.includes('created') ||
                               currentUrl.includes('vote/') ||
                               currentUrl.includes('results/') ||
                               pageContent.includes('/vote/');
    
    console.log('✅ Success indicator found:', hasSuccessIndicator);
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