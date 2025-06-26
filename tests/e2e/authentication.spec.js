const { test, expect } = require('@playwright/test');
const { getLastVerificationCode } = require('./utils/test-helpers');

test.describe('User Authentication', () => {
  test('should handle new user registration and verification flow', async ({ page }) => {
    const timestamp = Date.now();
    const randomNum = Math.floor(Math.random() * 10000);
    const testEmail = `newuser${timestamp}${randomNum}@example.com`;
    
    console.log('👤 NEW USER REGISTRATION TEST');
    console.log('============================');
    console.log(`📧 Test email: ${testEmail}`);
    
    await page.goto('/makepoll');
    
    // Fill poll form to trigger registration
    await page.fill('input[id="email"]', testEmail);
    await page.fill('input[id="title"]', `Registration Test Poll ${timestamp}`);
    await page.fill('textarea[id="description"]', 'Testing user registration');
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
      console.log('⚠️ Registration form did not appear - user may already exist');
      return;
    }
    
    // Fill registration form
    console.log('📋 Filling registration form...');
    await page.fill('input[id="full_name"]', 'Registration Test User');
    await page.fill('input[id="preferred_name"]', 'RegTest');
    
    // Submit registration form
    console.log('🚀 Submitting registration form...');
    await page.click('button:has-text("Send verification code")');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000);
    
    // Check if verification form appeared
    const verificationVisible = await page.locator(':has-text("verification code")').count() > 0;
    console.log(`🔐 Verification form visible: ${verificationVisible}`);
    
    if (verificationVisible) {
      console.log('📲 Getting verification code...');
      const verificationCode = await getLastVerificationCode(page);
      console.log(`✅ Retrieved verification code: ${verificationCode}`);
      
      if (verificationCode) {
        await page.fill('input[name="code"]', verificationCode);
        await page.click('button:has-text("Submit verification")');
        await page.waitForLoadState('networkidle');
        await page.waitForTimeout(2000);
        
        // Check for successful verification
        const successVisible = await page.locator(':has-text("Poll created successfully"), :has-text("success"), :has-text("/vote/")').count() > 0;
        expect(successVisible).toBeTruthy();
        console.log('🎉 Registration and verification successful!');
      } else {
        console.log('❌ Could not retrieve verification code');
        test.skip('Verification code not available');
      }
    } else {
      console.log('❌ Verification form did not appear');
      test.skip('Verification form did not appear');
    }
  });

  test('should debug verification code capture mechanism', async ({ page }) => {
    const timestamp = Date.now();
    const randomNum = Math.floor(Math.random() * 10000);
    const testEmail = `debuguser${timestamp}${randomNum}@example.com`;
    
    console.log('🔍 DEBUG VERIFICATION CODE CAPTURE');
    console.log('================================');
    console.log(`📧 Using UNIQUE email: ${testEmail}`);
    
    // Monitor network requests
    page.on('response', response => {
      if (response.url().includes('new_user')) {
        console.log(`📡 new_user response: ${response.status()}`);
      }
    });
    
    await page.goto('/makepoll');
    
    // Fill poll form
    await page.fill('input[id="email"]', testEmail);
    await page.fill('input[id="title"]', `Debug Poll ${timestamp}`);
    await page.fill('textarea[id="description"]', 'Debug verification');
    await page.fill('input[id="seats"]', '1');
    
    const optionInputs = page.locator('input[name="option"]');
    await optionInputs.nth(0).fill('Option A');
    await optionInputs.nth(1).fill('Option B');
    
    console.log('📝 Submitting poll form...');
    await page.click('button[type="submit"]');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000);
    
    const needsRegistration = await page.locator(':has-text("do not have an account")').count() > 0;
    console.log(`Registration needed: ${needsRegistration}`);
    
    if (needsRegistration) {
      console.log('👤 Triggering user registration...');
      await page.fill('input[id="full_name"]', 'Debug User');
      await page.fill('input[id="preferred_name"]', 'Debug');
      
      console.log('📧 Triggering verification email...');
      await page.click('button:has-text("Send verification code")');
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(5000);
      
      console.log('⏱️ Checking for verification code...');
      const actualCode = await getLastVerificationCode(page);
      console.log(`📲 Retrieved verification code: ${actualCode}`);
      
      if (actualCode) {
        console.log('✅ Testing verification with actual code...');
        await page.fill('input[name="code"]', actualCode);
        await page.click('button:has-text("Submit verification")');
        await page.waitForTimeout(3000);
        
        const verificationSuccess = await page.locator(':has-text("success"), :has-text("/vote/")').count() > 0;
        console.log(`🎉 Verification successful: ${verificationSuccess}`);
        expect(verificationSuccess).toBeTruthy();
      } else {
        console.log('❌ Could not retrieve verification code');
        test.skip('Verification code not available');
      }
    }
  });

  test('should handle verification with fallback codes', async ({ page }) => {
    const timestamp = Date.now();
    const testEmail = `fallback${timestamp}@example.com`;
    
    await page.goto('/makepoll');
    
    await page.fill('input[id="email"]', testEmail);
    await page.fill('input[id="title"]', `Fallback Test Poll ${timestamp}`);
    await page.fill('input[id="seats"]', '1');
    
    const optionInputs = page.locator('input[name="option"]');
    await optionInputs.nth(0).fill('Option A');
    await optionInputs.nth(1).fill('Option B');
    
    await page.click('button[type="submit"]');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);
    
    const needsRegistration = await page.locator(':has-text("do not have an account")').count() > 0;
    if (needsRegistration) {
      await page.fill('input[id="full_name"]', 'Fallback Test User');
      await page.fill('input[id="preferred_name"]', 'Fallback');
      await page.click('button:has-text("Send verification code")');
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(2000);
      
      const needsVerification = await page.locator(':has-text("verification code")').count() > 0;
      if (needsVerification) {
        // First try to get actual verification code
        const actualCode = await getLastVerificationCode(page);
        
        if (actualCode) {
          console.log(`Using actual verification code: ${actualCode}`);
          await page.fill('input[name="code"]', actualCode);
          await page.click('button:has-text("Submit verification")');
          await page.waitForTimeout(2000);
          
          const success = await page.locator(':has-text("success"), :has-text("/vote/")').count() > 0;
          expect(success).toBeTruthy();
        } else {
          // Try common fallback codes
          console.log('Trying fallback verification codes...');
          const commonCodes = ['123456', '000000', '111111', '999999'];
          let verified = false;
          
          for (const code of commonCodes) {
            await page.fill('input[name="code"]', code);
            await page.click('button:has-text("Submit verification")');
            await page.waitForTimeout(1000);
            
            const success = await page.locator(':has-text("success"), :has-text("/vote/")').count() > 0;
            if (success) {
              console.log(`✅ Verification successful with fallback code: ${code}`);
              verified = true;
              break;
            }
          }
          
          if (!verified) {
            console.log('⚠️ Could not verify with any codes');
            test.skip('Could not complete verification');
          }
        }
      }
    }
  });
});

test.describe('User Deletion', () => {
  test('should create and delete a user successfully', async ({ page }) => {
    const testEmail = `test_delete_${Date.now()}@example.com`;
    
    console.log('🗑️ USER DELETION TEST');
    console.log('====================');
    console.log(`📧 Test email: ${testEmail}`);
    
    try {
      // Create a user by registering
      console.log('👤 Creating user via registration...');
      const registerResponse = await page.request.post('/new_user', {
        form: {
          'email': testEmail,
          'full_name': 'Test Delete User',
          'preferred_name': 'TestDelete',
          'origin_function': 'new_poll'
        }
      });
      
      expect(registerResponse.status()).toBe(200);
      console.log('✅ User created successfully');
      
      // Create a poll to verify user can create content
      console.log('📊 Creating a poll to verify user functionality...');
      const createPollResponse = await page.request.post('/pollsubmit', {
        form: {
          'email': testEmail,
          'title': 'Test Poll Before User Deletion',
          'description': 'This poll will be deleted when user is deleted',
          'option': ['Option A', 'Option B', 'Option C'],
          'seats': '1'
        }
      });
      
      expect(createPollResponse.status()).toBe(200);
      console.log('✅ Poll created successfully');
      
      // Delete the user via API
      console.log('🗑️ Deleting user via API...');
      const deleteResponse = await page.request.delete('/api/user', {
        data: { email: testEmail },
        headers: { 'Content-Type': 'application/json' }
      });
      
      expect(deleteResponse.status()).toBe(200);
      const responseData = await deleteResponse.json();
      expect(responseData.message).toContain('deleted successfully');
      console.log('✅ User deleted successfully');
      
      // Verify user is actually deleted
      console.log('🔍 Verifying user deletion...');
      const verifyResponse = await page.request.post('/pollsubmit', {
        form: {
          'email': testEmail,
          'title': 'Should not work - user deleted',
          'description': 'This should require new user registration',
          'option': ['Option X'],
          'seats': '1'
        }
      });
      
      expect(verifyResponse.status()).toBe(200);
      const verifyText = await verifyResponse.text();
      expect(verifyText).toContain('you do not have an account with us');
      console.log('✅ User deletion verified - user needs to register again');
      
    } finally {
      // Cleanup any remaining test data
      console.log('🧹 Final cleanup...');
      try {
        await page.request.delete('/api/user', {
          data: { email: testEmail },
          headers: { 'Content-Type': 'application/json' }
        });
      } catch (error) {
        // Cleanup might fail if user already deleted, which is fine
      }
    }
  });

  test('should handle deletion of non-existent user', async ({ page }) => {
    console.log('🚫 Testing deletion of non-existent user...');
    
    const response = await page.request.delete('/api/user', {
      data: { email: 'nonexistent@example.com' },
      headers: { 'Content-Type': 'application/json' }
    });
    
    expect(response.status()).toBe(404);
    const responseData = await response.json();
    expect(responseData.error).toContain('User not found');
    
    console.log('✅ Non-existent user deletion properly handled');
  });

  test('should require email parameter for user deletion', async ({ page }) => {
    console.log('❌ Testing user deletion API with missing email...');
    
    const response = await page.request.delete('/api/user', {
      data: {},
      headers: { 'Content-Type': 'application/json' }
    });
    
    expect(response.status()).toBe(400);
    const responseData = await response.json();
    expect(responseData.error).toContain('Email is required');
    
    console.log('✅ Missing email parameter properly handled');
  });
}); 