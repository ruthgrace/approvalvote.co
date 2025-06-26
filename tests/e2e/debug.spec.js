const { test, expect } = require('@playwright/test');
const { getLastVerificationCode } = require('./utils/test-helpers');

// Debug tests - these are skipped by default
// Remove .skip to enable when debugging production issues
test.describe.skip('Debug Tests', () => {
  test('should handle basic poll creation and user registration', async ({ page }) => {
    const testEmail = 'noreply@approvalvote.co';
    let pollId = null;
    
    console.log('🐛 DEBUG BASIC FLOW TEST');
    console.log('========================');
    console.log(`Email: ${testEmail}`);
    
    // Clean existing user to ensure clean state
    try {
      await page.request.delete('/api/user', {
        data: { email: testEmail },
        headers: { 'Content-Type': 'application/json' }
      });
    } catch (error) {
      // User might not exist, which is fine
    }
    
    try {
      console.log('Step 1: Going to make poll page');
      await page.goto('/makepoll');
      await page.waitForLoadState('networkidle');
      
      console.log('Step 2: Filling poll form');
      await page.fill('input[id="email"]', testEmail);
      await page.fill('input[id="title"]', `Debug Poll ${Date.now()}`);
      await page.fill('textarea[id="description"]', 'Debug test poll');
      await page.fill('input[id="seats"]', '1');
      
      const optionInputs = page.locator('input[name="option"]');
      await optionInputs.nth(0).fill('Debug Option A');
      await optionInputs.nth(1).fill('Debug Option B');
      
      console.log('Step 3: Submitting form');
      await page.click('button[type="submit"]');
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(2000);
      
      // Check registration form
      const registrationVisible = await page.locator(':has-text("do not have an account")').count() > 0;
      console.log(`Registration form visible: ${registrationVisible}`);
      
      // Check error message
      const errorVisible = await page.locator(':has-text("Registration failed"), :has-text("error")').count() > 0;
      console.log(`Error message visible: ${errorVisible}`);
      
      // Check verification form
      const verificationVisible = await page.locator(':has-text("verification code")').count() > 0;
      console.log(`Verification form visible: ${verificationVisible}`);
      
      if (registrationVisible) {
        console.log('Step 4: Completing registration');
        await page.fill('input[id="full_name"]', 'Debug Test User');
        await page.fill('input[id="preferred_name"]', 'Debug');
        
        await page.click('button:has-text("Send verification code")');
        await page.waitForLoadState('networkidle');
        await page.waitForTimeout(3000);
        
        // Check if verification form appeared
        const needsVerification = await page.locator(':has-text("verification code")').count() > 0;
        
        if (needsVerification) {
          const verificationCode = await getLastVerificationCode(page);
          if (verificationCode) {
            await page.fill('input[name="code"]', verificationCode);
            await page.click('button:has-text("Submit verification")');
            await page.waitForLoadState('networkidle');
            await page.waitForTimeout(2000);
            
            // Try to extract poll ID
            pollId = await extractPollId(page);
            console.log(`Poll ID extracted: ${pollId}`);
          }
        }
      }
      
      if (errorVisible) {
        console.log('❌ Registration failed - debugging needed');
      } else {
        console.log('✅ SUCCESS! Registration worked and verification form appeared');
      }
      
      expect(registrationVisible || verificationVisible || pollId).toBeTruthy();
    } finally {
      // Cleanup: Delete poll if created
      if (pollId) {
        try {
          const deleteResponse = await page.request.delete(`/api/poll/${pollId}`, {
            data: { email: testEmail },
            headers: { 'Content-Type': 'application/json' }
          });
          console.log(`🧹 Cleanup: Poll ${pollId} deletion status: ${deleteResponse.status()}`);
        } catch (error) {
          console.log(`⚠️ Cleanup warning: Could not delete poll ${pollId}`);
        }
      }
      
      // Cleanup: Delete user
      try {
        const userDeleteResponse = await page.request.delete('/api/user', {
          data: { email: testEmail },
          headers: { 'Content-Type': 'application/json' }
        });
        console.log(`🧹 Cleanup: User ${testEmail} deletion status: ${userDeleteResponse.status()}`);
      } catch (error) {
        console.log(`⚠️ Cleanup warning: Could not delete user ${testEmail}`);
      }
    }
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