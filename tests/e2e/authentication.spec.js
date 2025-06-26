const { test, expect } = require('@playwright/test');
const { getLastVerificationCode, establishUserSession } = require('./utils/test-helpers');

test.describe('User Authentication', () => {
  test('should handle new user registration and verification flow', async ({ page }) => {
    const testEmail = 'noreply@approvalvote.co';
    
    console.log('👤 NEW USER REGISTRATION TEST');
    console.log('============================');
    console.log(`📧 Test email: ${testEmail}`);
    
    try {
      // First, delete the user to ensure clean state for registration test
      console.log('🧹 Cleaning existing user...');
      try {
        // Try to establish session first, then delete
        await establishUserSession(page, testEmail, 'Cleanup User', 'Cleanup');
        await page.request.delete('/api/user', {
          data: { email: testEmail },
          headers: { 'Content-Type': 'application/json' }
        });
        console.log('✅ Existing user cleaned up');
      } catch (error) {
        // User might not exist or cleanup failed, continue with test
        console.log('ℹ️ No existing user to clean up');
      }
      
      await page.goto('/makepoll');
      
      // Fill poll form to trigger registration
      await page.fill('input[id="email"]', testEmail);
      await page.fill('input[id="title"]', `Registration Test Poll ${Date.now()}`);
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
        console.log('❌ Registration form did not appear - user may already exist');
        expect(registrationVisible).toBeTruthy();
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
          expect(verificationCode).toBeTruthy();
        }
      } else {
        console.log('❌ Verification form did not appear');
        expect(verificationVisible).toBeTruthy();
      }
    } finally {
      // Cleanup: Delete the user we created (session should already be established)
      try {
        const deleteResponse = await page.request.delete('/api/user', {
          data: { email: testEmail },
          headers: { 'Content-Type': 'application/json' }
        });
        console.log(`🧹 Cleanup: User ${testEmail} deletion status: ${deleteResponse.status()}`);
      } catch (error) {
        console.log(`⚠️ Cleanup warning: Could not delete user ${testEmail}`);
      }
    }
  });

  test.skip('should debug verification code capture mechanism', async ({ page }) => {
    const testEmail = 'noreply@approvalvote.co';
    
    console.log('🔍 DEBUG VERIFICATION CODE CAPTURE');
    console.log('================================');
    console.log(`📧 Using email: ${testEmail}`);
    
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
      // Monitor network requests
      page.on('response', response => {
        if (response.url().includes('new_user')) {
          console.log(`📡 new_user response: ${response.status()}`);
        }
      });
      
      await page.goto('/makepoll');
      
      // Fill poll form
      await page.fill('input[id="email"]', testEmail);
      await page.fill('input[id="title"]', `Debug Poll ${Date.now()}`);
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
          expect(actualCode).toBeTruthy();
        }
      }
    } finally {
      // Cleanup: Delete the user we created
      try {
        const deleteResponse = await page.request.delete('/api/user', {
          data: { email: testEmail },
          headers: { 'Content-Type': 'application/json' }
        });
        console.log(`🧹 Cleanup: User ${testEmail} deletion status: ${deleteResponse.status()}`);
      } catch (error) {
        console.log(`⚠️ Cleanup warning: Could not delete user ${testEmail}`);
      }
    }
  });

  test('should handle verification with fallback codes', async ({ page }) => {
    const testEmail = 'noreply@approvalvote.co';
    
    // Clean existing user to ensure clean state
    try {
      // Try to establish session first, then delete
      await establishUserSession(page, testEmail, 'Cleanup User', 'Cleanup');
      await page.request.delete('/api/user', {
        data: { email: testEmail },
        headers: { 'Content-Type': 'application/json' }
      });
    } catch (error) {
      // User might not exist, which is fine
    }
    
    try {
      await page.goto('/makepoll');
      
      await page.fill('input[id="email"]', testEmail);
      await page.fill('input[id="title"]', `Fallback Test Poll ${Date.now()}`);
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
              console.log('❌ Could not verify with any codes');
              expect(verified).toBeTruthy();
            }
          }
        }
      }
    } finally {
      // Cleanup: Delete the user we created (session should be established from verification)
      try {
        const deleteResponse = await page.request.delete('/api/user', {
          data: { email: testEmail },
          headers: { 'Content-Type': 'application/json' }
        });
        console.log(`🧹 Cleanup: User ${testEmail} deletion status: ${deleteResponse.status()}`);
      } catch (error) {
        console.log(`⚠️ Cleanup warning: Could not delete user ${testEmail}`);
      }
    }
  });
});

test.describe('User Deletion', () => {
  test('should only allow users to delete themselves (authorization check)', async ({ page, browser }) => {
    const userAEmail = 'noreply@approvalvote.co';
    const userBEmail = 'unauthorized@example.com';
    
    console.log('🔒 USER DELETION AUTHORIZATION TEST');
    console.log('===================================');
    console.log(`📧 User A email: ${userAEmail}`);
    console.log(`📧 User B email: ${userBEmail}`);
    
    try {
      // Clean both users to ensure clean state
      console.log('🧹 Cleaning existing users...');
      await page.request.delete('/api/user', {
        data: { email: userAEmail },
        headers: { 'Content-Type': 'application/json' }
      });
      await page.request.delete('/api/user', {
        data: { email: userBEmail },
        headers: { 'Content-Type': 'application/json' }
      });
      
      // Create and verify User A through the normal flow to establish session
      console.log('👤 Creating and verifying User A through browser flow...');
      await page.goto('/makepoll');
      
      // Fill poll form to trigger user registration
      await page.fill('input[id="email"]', userAEmail);
      await page.fill('input[id="title"]', `Auth Test Poll ${Date.now()}`);
      await page.fill('textarea[id="description"]', 'Testing authorization');
      await page.fill('input[id="seats"]', '1');
      
      const optionInputs = page.locator('input[name="option"]');
      await optionInputs.nth(0).fill('Option A');
      await optionInputs.nth(1).fill('Option B');
      
      await page.click('button[type="submit"]');
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(2000);
      
      // Handle registration if needed
      const needsRegistration = await page.locator(':has-text("do not have an account")').count() > 0;
      if (needsRegistration) {
        await page.fill('input[id="full_name"]', 'User A');
        await page.fill('input[id="preferred_name"]', 'UserA');
        await page.click('button:has-text("Send verification code")');
        await page.waitForLoadState('networkidle');
        await page.waitForTimeout(2000);
      }
      
      // Handle verification to establish session
      const needsVerification = await page.locator(':has-text("verification code")').count() > 0;
      if (needsVerification) {
        const verificationCode = await getLastVerificationCode(page);
        if (verificationCode) {
          await page.fill('input[name="code"]', verificationCode);
          await page.click('button:has-text("Submit verification")');
          await page.waitForLoadState('networkidle');
          await page.waitForTimeout(2000);
        }
      }
      
      console.log('✅ User A created and session established');
      
      // Create a NEW context without session for unauthorized request
      console.log('🚫 Attempting unauthorized deletion (fresh context without session)...');
      const unauthorizedContext = await browser.newContext();
      const unauthorizedDeleteResponse = await unauthorizedContext.request.delete('http://127.0.0.1:3000/api/user', {
        data: { email: userAEmail },
        headers: { 'Content-Type': 'application/json' }
      });
      await unauthorizedContext.close();
      
      // Should fail with 401 (Unauthorized), 403 (Forbidden), or 404 (Not Found)
      expect([401, 403, 404]).toContain(unauthorizedDeleteResponse.status());
      console.log(`✅ Unauthorized deletion properly rejected (status: ${unauthorizedDeleteResponse.status()})`);
      
      // Now delete User A using the original context WITH session (should succeed)
      console.log('✅ Attempting authorized deletion (with established session)...');
      const authorizedDeleteResponse = await page.request.delete('/api/user', {
        data: { email: userAEmail },
        headers: { 'Content-Type': 'application/json' }
      });
      
      expect(authorizedDeleteResponse.status()).toBe(200);
      const responseData = await authorizedDeleteResponse.json();
      expect(responseData.message).toContain('deleted successfully');
      console.log('✅ Authorized self-deletion successful');
      
    } finally {
      // Cleanup: Delete both users in case test failed
      try {
        await page.request.delete('/api/user', {
          data: { email: userAEmail },
          headers: { 'Content-Type': 'application/json' }
        });
        await page.request.delete('/api/user', {
          data: { email: userBEmail },
          headers: { 'Content-Type': 'application/json' }
        });
        console.log('🧹 Cleanup: Both users deleted');
      } catch (error) {
        console.log('⚠️ Cleanup warning: Could not delete test users');
      }
    }
  });
});
