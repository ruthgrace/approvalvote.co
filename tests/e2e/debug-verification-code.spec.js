const { test, expect } = require('@playwright/test');
const { getLastVerificationCode } = require('./utils/test-helpers');

test.describe('Debug Verification Code', () => {
  test('should trigger verification and show the code in server output', async ({ page }) => {
    // Use timestamp + random number to ensure uniqueness
    const timestamp = Date.now();
    const randomNum = Math.floor(Math.random() * 10000);
    const testEmail = `newuser${timestamp}${randomNum}@example.com`;
    
    console.log('🔍 DEBUGGING VERIFICATION CODE CAPTURE');
    console.log('=====================================');
    console.log(`Using UNIQUE email: ${testEmail}`);
    
    await page.goto('/makepoll');
    
    // Fill poll form
    await page.fill('input[id="email"]', testEmail);
    await page.fill('input[id="title"]', `Debug Poll ${timestamp}`);
    await page.fill('textarea[id="description"]', 'Debug verification');
    await page.fill('input[id="seats"]', '1');
    
    // Fill first option
    const optionInputs = page.locator('input[name="option"]');
    await optionInputs.nth(0).fill('Option A');
    
    // Also fill the second option to ensure we have enough options
    await optionInputs.nth(1).fill('Option B');
    
    console.log('📝 Checking form validity...');
    
    // Check if the form is valid before submission
    const isValid = await page.evaluate(() => {
      const form = document.getElementById('poll-form');
      return form ? form.checkValidity() : false;
    });
    
    console.log(`Form is valid: ${isValid}`);
    
    // Listen for network responses to see what happens
    page.on('response', response => {
      if (response.url().includes('pollsubmit')) {
        console.log(`📡 Response from pollsubmit: ${response.status()}`);
      }
      if (response.url().includes('new_user')) {
        console.log(`📡 Response from new_user: ${response.status()}`);
      }
    });
    
    console.log('📝 Submitting poll form...');
    await page.click('button[type="submit"]');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000); // Wait longer to see all responses
    
    // Check what happened
    const pageContent = await page.textContent('body');
    console.log('📄 Page content after submit:');
    console.log(pageContent.substring(0, 500) + '...');
    
    const needsRegistration = await page.locator(':has-text("do not have an account")').count() > 0;
    const needsVerification = await page.locator(':has-text("verification code")').count() > 0;
    
    console.log(`Registration needed: ${needsRegistration}`);
    console.log(`Verification needed: ${needsVerification}`);
    
    if (needsRegistration) {
      console.log('👤 Registering user...');
      await page.fill('input[id="full_name"]', 'Debug User');
      await page.fill('input[id="preferred_name"]', 'Debug');
      
      console.log('📧 Triggering verification email...');
      
      // Listen for the new_user response
      page.on('response', response => {
        if (response.url().includes('new_user')) {
          console.log(`📡 new_user response: ${response.status()}`);
        }
      });
      
      await page.click('button:has-text("Send verification code")');
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(5000); // Wait longer for email to be sent
      
      console.log('⏱️  Waited for verification email - check server output above for:');
      console.log('    "verification code is XXXX"');
      
      // Check what the page looks like after registration
      const afterRegistration = await page.textContent('body');
      console.log('📄 Page after registration attempt:');
      console.log(afterRegistration.substring(0, 500) + '...');
    }
    
    const stillNeedsVerification = await page.locator(':has-text("verification code")').count() > 0;
    console.log(`Still needs verification: ${stillNeedsVerification}`);
    
    if (stillNeedsVerification) {
      console.log('');
      console.log('🎯 Getting actual verification code from test endpoint...');
      
      // Get the actual verification code
      const actualCode = await getLastVerificationCode(page);
      console.log(`📲 Retrieved verification code: ${actualCode}`);
      
      if (actualCode) {
        console.log('✅ Testing verification mechanism with ACTUAL code...');
        await page.fill('input[name="code"]', actualCode);
        await page.click('button:has-text("Submit verification")');
        await page.waitForTimeout(3000);
        
        const afterVerification = await page.textContent('body');
        console.log('📄 Page after verification attempt:');
        console.log(afterVerification.substring(0, 500) + '...');
        
        // Check if verification was successful
        const verificationSuccess = afterVerification.includes('Poll is ready') || 
                                   afterVerification.includes('success') ||
                                   afterVerification.includes('/vote/');
        console.log(`🎉 Verification successful: ${verificationSuccess}`);
      } else {
        console.log('❌ Could not retrieve verification code from test endpoint');
        console.log('💡 MANUAL STEPS:');
        console.log('1. Look at the server output above');
        console.log('2. Find the line that says "verification code is XXXX"');
        console.log('3. Use that code in the main test');
      }
    }
  });
}); 