const { test, expect } = require('@playwright/test');
const { getLastVerificationCode } = require('./utils/test-helpers');

// Debug tests - these are skipped by default
// Remove .skip to enable when debugging production issues
test.describe.skip('Debug Tests', () => {
  test('should debug the registration flow step by step', async ({ page }) => {
    const timestamp = Date.now();
    const randomNum = Math.floor(Math.random() * 10000);
    const testEmail = `bugtest${timestamp}${randomNum}@example.com`;
    
    console.log('🐛 DEBUGGING PRODUCTION REGISTRATION BUG');
    console.log('========================================');
    console.log(`Email: ${testEmail}`);
    
    // Capture ALL network requests
    page.on('request', request => {
      console.log(`🌐 Request: ${request.method()} ${request.url()}`);
    });
    
    page.on('response', response => {
      console.log(`📡 Response: ${response.status()} ${response.url()}`);
    });
    
    // Step 1: Go to poll creation and submit to trigger registration
    await page.goto('/makepoll');
    
    await page.fill('input[id="email"]', testEmail);
    await page.fill('input[id="title"]', 'Bug Test Poll');
    await page.fill('textarea[id="description"]', 'Testing registration bug');
    await page.fill('input[id="seats"]', '1');
    
    const optionInputs = page.locator('input[name="option"]');
    await optionInputs.nth(0).fill('Option A');
    await optionInputs.nth(1).fill('Option B');
    
    console.log('📝 Submitting poll form to trigger registration...');
    await page.click('button[type="submit"]');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);
    
    // Check if registration form appeared
    const registrationVisible = await page.locator(':has-text("do not have an account")').count() > 0;
    console.log(`👤 Registration form visible: ${registrationVisible}`);
    
    if (!registrationVisible) {
      console.log('❌ Registration form did not appear - test cannot continue');
      return;
    }
    
    // Step 2: Fill registration form
    console.log('📋 Filling registration form...');
    await page.fill('input[id="full_name"]', 'Bug Test User');
    await page.fill('input[id="preferred_name"]', 'Bug');
    
    // Check that the registration form is properly set up
    const emailField = await page.locator('#error-message-div input[name="email"]').inputValue();
    const originField = await page.locator('#error-message-div input[name="origin_function"]').inputValue();
    console.log(`📧 Hidden email field: ${emailField}`);
    console.log(`🎯 Hidden origin function: ${originField}`);
    
    // Step 3: Submit registration form and monitor closely
    console.log('🚀 Submitting registration form...');
    console.log('⏱️ Watch server logs for detailed debugging info...');
    
    await page.click('button:has-text("Send verification code")');
    
    // Wait and monitor what happens
    await page.waitForTimeout(5000);
    
    // Check what happened after submission
    const verificationFormVisible = await page.locator(':has-text("verification code")').count() > 0;
    const errorVisible = await page.locator(':has-text("Registration failed"), :has-text("error")').count() > 0;
    const stillRegistrationForm = await page.locator(':has-text("do not have an account")').count() > 0;
    
    console.log('📊 RESULTS AFTER REGISTRATION SUBMISSION:');
    console.log(`✅ Verification form visible: ${verificationFormVisible}`);
    console.log(`❌ Error message visible: ${errorVisible}`);
    console.log(`🔄 Still showing registration form: ${stillRegistrationForm}`);
    
    if (verificationFormVisible) {
      console.log('🎉 SUCCESS! Registration worked and verification form appeared');
      console.log('🔍 Now check server logs above for the verification code');
    } else if (errorVisible) {
      console.log('💥 REGISTRATION FAILED - Check error message and server logs');
      const errorText = await page.locator(':has-text("Registration failed"), :has-text("error")').textContent();
      console.log(`Error text: ${errorText}`);
    } else if (stillRegistrationForm) {
      console.log('🔁 Registration form still visible - submission may have failed silently');
      console.log('📋 Check server logs for clues about what went wrong');
    } else {
      console.log('❓ Unexpected state - check page content and server logs');
    }
    
    console.log('');
    console.log('💡 NEXT STEPS:');
    console.log('1. Look at the server output above for detailed debug logs');
    console.log('2. Check if "=== NEW_USER ROUTE CALLED ===" appears');
    console.log('3. Follow the step-by-step debug output');
    console.log('4. Look for any error messages or exceptions');
  });

  test('should test basic page loading', async ({ page }) => {
    console.log('🔍 BASIC PAGE LOADING DEBUG');
    console.log('===========================');
    
    // Test basic functionality
    await page.goto('https://example.com');
    await expect(page).toHaveTitle(/Example/);
    await expect(page.locator('h1')).toBeVisible();
    
    console.log('✅ External site loading works');
    
    // Test local development server
    await page.goto('/');
    await expect(page.locator('body')).toBeVisible();
    
    console.log('✅ Local server loading works');
    console.log('Current URL:', page.url());
    console.log('Page title:', await page.title());
  });

  test('should capture network activity', async ({ page }) => {
    console.log('🌐 NETWORK ACTIVITY DEBUG');
    console.log('=========================');
    
    const requests = [];
    const responses = [];
    
    page.on('request', request => {
      requests.push({
        url: request.url(),
        method: request.method(),
        headers: request.headers()
      });
      console.log(`📤 Request: ${request.method()} ${request.url()}`);
    });
    
    page.on('response', response => {
      responses.push({
        url: response.url(),
        status: response.status(),
        headers: response.headers()
      });
      console.log(`📥 Response: ${response.status()} ${response.url()}`);
    });
    
    await page.goto('/makepoll');
    await page.waitForLoadState('networkidle');
    
    console.log(`📊 Total requests: ${requests.length}`);
    console.log(`📊 Total responses: ${responses.length}`);
    
    const failedResponses = responses.filter(r => r.status >= 400);
    if (failedResponses.length > 0) {
      console.log('❌ Failed responses:');
      failedResponses.forEach(r => console.log(`  ${r.status} ${r.url}`));
    } else {
      console.log('✅ All responses successful');
    }
  });
}); 