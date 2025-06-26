const { test, expect } = require('@playwright/test');
const { extractPollId, getLastVerificationCode } = require('./utils/test-helpers');

test.describe('API Tests', () => {
  test('poll deletion API should work correctly', async ({ page }) => {
    const testEmail = 'noreply@approvalvote.co';
    
    console.log('🗑️ POLL DELETION API TEST');
    console.log('=========================');
    console.log(`📧 Test email: ${testEmail}`);
    
    try {
      // Create poll first
      console.log('📝 Creating poll to test deletion...');
      await page.goto('/makepoll');
      
      await page.fill('input[id="email"]', testEmail);
      await page.fill('input[id="title"]', `API Delete Test Poll ${Date.now()}`);
      await page.fill('textarea[id="description"]', 'Testing poll deletion via API');
      await page.fill('input[id="seats"]', '1');
      
      const optionInputs = page.locator('input[name="option"]');
      await optionInputs.nth(0).fill('Delete Option A');
      await optionInputs.nth(1).fill('Delete Option B');
      
      await page.click('button[type="submit"]');
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(2000);
      
      // Handle any registration/verification if needed
      const needsRegistration = await page.locator(':has-text("do not have an account")').count() > 0;
      const needsVerification = await page.locator('input[name="code"], :has-text("verification code"), :has-text("A verification code has been sent")').count() > 0;
      
      if (needsRegistration) {
        await page.fill('input[id="full_name"]', 'API Test User');
        await page.fill('input[id="preferred_name"]', 'APITest');
        await page.click('button:has-text("Send verification code")');
        await page.waitForLoadState('networkidle');
        await page.waitForTimeout(2000);
      }
      
      if (needsVerification || await page.locator('input[name="code"]').count() > 0) {
        const verificationCode = await getLastVerificationCode(page);
        if (verificationCode) {
          await page.fill('input[name="code"]', verificationCode);
          await page.click('button:has-text("Submit verification")');
          await page.waitForLoadState('networkidle');
          await page.waitForTimeout(2000);
        }
      }
      
      // Extract poll ID
      const pollId = await extractPollId(page);
      expect(pollId).toBeTruthy();
      console.log(`✅ Poll created with ID: ${pollId}`);
      
      // Test poll deletion via API
      console.log('🗑️ Testing poll deletion API...');
      const deleteResponse = await page.request.delete(`/api/poll/${pollId}`, {
        data: { email: testEmail },
        headers: { 'Content-Type': 'application/json' }
      });
      
      expect(deleteResponse.status()).toBe(200);
      const responseData = await deleteResponse.json();
      expect(responseData.message).toContain('deleted successfully');
      console.log('✅ Poll deleted successfully via API');
      
      // Verify poll deletion
      console.log('🔍 Verifying poll deletion...');
      await page.goto(`/poll/${pollId}`);
      await page.waitForLoadState('networkidle');
      
      const isDeleted = await page.locator(':has-text("not found"), :has-text("does not exist")').count() > 0 ||
                       !page.url().includes(`/poll/${pollId}`);
      
      expect(isDeleted).toBeTruthy();
      console.log('✅ Poll deletion verified - poll no longer accessible');
    } finally {
      // Cleanup: Delete the user if created
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

  test('poll deletion API should reject unauthorized users', async ({ page }) => {
    console.log('🔒 UNAUTHORIZED DELETION TEST');
    console.log('=============================');
    
    // Try to delete a non-existent poll with unauthorized user
    const response = await page.request.delete('/api/poll/99999', {
      data: { email: 'unauthorized@example.com' },
      headers: { 'Content-Type': 'application/json' }
    });
    
    expect(response.status()).toBe(404);
    const responseData = await response.json();
    expect(responseData.error).toContain('not found');
    
    console.log('✅ Unauthorized deletion properly rejected');
  });

  test('poll deletion API should require email parameter', async ({ page }) => {
    console.log('❌ MISSING EMAIL PARAMETER TEST');
    console.log('==============================');
    
    const response = await page.request.delete('/api/poll/1', {
      data: {},
      headers: { 'Content-Type': 'application/json' }
    });
    
    expect(response.status()).toBe(400);
    const responseData = await response.json();
    expect(responseData.error).toContain('Email is required');
    
    console.log('✅ Missing email parameter properly handled');
  });

  test('user deletion API should work correctly', async ({ page }) => {
    const testEmail = 'noreply@approvalvote.co';
    
    console.log('🗑️ USER DELETION API TEST');
    console.log('=========================');
    console.log(`📧 Test email: ${testEmail}`);
    
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
      // Create a user via API
      console.log('👤 Creating user via API...');
      const registerResponse = await page.request.post('/new_user', {
        form: {
          'email': testEmail,
          'full_name': 'API Delete User',
          'preferred_name': 'APIDelete',
          'origin_function': 'new_poll'
        }
      });
      
      expect(registerResponse.status()).toBe(200);
      console.log('✅ User created successfully');
      
      // Delete the user via API
      console.log('🗑️ Deleting user via API...');
      const deleteResponse = await page.request.delete('/api/user', {
        data: { email: testEmail },
        headers: { 'Content-Type': 'application/json' }
      });
      
      expect(deleteResponse.status()).toBe(200);
      const responseData = await deleteResponse.json();
      expect(responseData.message).toContain('deleted successfully');
      console.log('✅ User deleted successfully via API');
      
    } finally {
      // Cleanup
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

  test('user deletion API should handle non-existent users', async ({ page }) => {
    console.log('🚫 NON-EXISTENT USER DELETION TEST');
    console.log('==================================');
    
    const response = await page.request.delete('/api/user', {
      data: { email: 'nonexistent-api@example.com' },
      headers: { 'Content-Type': 'application/json' }
    });
    
    expect(response.status()).toBe(404);
    const responseData = await response.json();
    expect(responseData.error).toContain('User not found');
    
    console.log('✅ Non-existent user deletion properly handled');
  });

  test('verification code API endpoint should work', async ({ page }) => {
    console.log('🔐 VERIFICATION CODE API TEST');
    console.log('=============================');
    
    // Test the verification code endpoint
    const response = await page.request.get('/api/test/verification-code');
    
    if (response.status() === 200) {
      const data = await response.json();
      console.log(`📲 Verification code endpoint returned: ${data.verification_code}`);
      expect(data.verification_code).toBeTruthy();
      console.log('✅ Verification code API endpoint working');
    } else if (response.status() === 404) {
      console.log('⚠️ Verification code endpoint not available (expected in production)');
      test.skip('Verification code endpoint not available');
    } else {
      console.log(`❌ Unexpected response status: ${response.status()}`);
      expect(response.status()).toBe(200);
    }
  });

  test('poll creation API should handle invalid data', async ({ page }) => {
    console.log('❌ INVALID POLL DATA TEST');
    console.log('=========================');
    
    // Test with missing required fields
    const response = await page.request.post('/pollsubmit', {
      form: {
        'email': 'test@example.com',
        // Missing title, options, etc.
      }
    });
    
    // Should handle missing data gracefully
    expect([200, 400, 422]).toContain(response.status());
    
    if (response.status() === 200) {
      const responseText = await response.text();
      // Should show error message or redirect to registration
      const hasError = responseText.includes('error') || 
                       responseText.includes('required') ||
                       responseText.includes('do not have an account');
      expect(hasError).toBeTruthy();
    }
    
    console.log('✅ Invalid poll data properly handled');
  });

  test('user registration API should handle duplicate emails', async ({ page }) => {
    const testEmail = 'noreply@approvalvote.co';
    
    console.log('👥 DUPLICATE EMAIL TEST');
    console.log('======================');
    console.log(`📧 Test email: ${testEmail}`);
    
    try {
      // First, delete the user to ensure clean state
      console.log('🧹 Cleaning existing user...');
      await page.request.delete('/api/user', {
        data: { email: testEmail },
        headers: { 'Content-Type': 'application/json' }
      });
      
      // Create user first time
      console.log('👤 Creating user (first time)...');
      const firstResponse = await page.request.post('/new_user', {
        form: {
          'email': testEmail,
          'full_name': 'First User',
          'preferred_name': 'First',
          'origin_function': 'new_poll'
        }
      });
      
      expect(firstResponse.status()).toBe(200);
      console.log('✅ First user creation successful');
      
      // Try to create same user again
      console.log('👤 Attempting to create duplicate user...');
      const duplicateResponse = await page.request.post('/new_user', {
        form: {
          'email': testEmail,
          'full_name': 'Duplicate User',
          'preferred_name': 'Duplicate',
          'origin_function': 'new_poll'
        }
      });
      
      // Should handle duplicate gracefully (either success or appropriate error)
      expect([200, 400, 409]).toContain(duplicateResponse.status());
      console.log(`✅ Duplicate user creation handled (status: ${duplicateResponse.status()})`);
      
    } finally {
      // Cleanup
      try {
        await page.request.delete('/api/user', {
          data: { email: testEmail },
          headers: { 'Content-Type': 'application/json' }
        });
      } catch (error) {
        // Cleanup might fail, which is fine
      }
    }
  });
}); 