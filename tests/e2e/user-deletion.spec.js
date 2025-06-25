const { test, expect } = require('@playwright/test');

test.describe('User Deletion API', () => {
  test('should create and delete a user successfully', async ({ page }) => {
    const testEmail = `test_delete_${Date.now()}@example.com`;
    
    console.log('🚀 Testing user deletion API...');
    console.log(`📧 Using test email: ${testEmail}`);
    
    try {
      // Step 1: Create a user by registering
      console.log('👤 Creating user...');
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
      
      // Step 2: Create a poll to verify user can create content
      console.log('📊 Creating a poll...');
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
      
      // Step 3: Delete the user via API
      console.log('🗑️ Deleting user via API...');
      const deleteResponse = await page.request.delete('/api/user', {
        data: {
          email: testEmail
        },
        headers: {
          'Content-Type': 'application/json'
        }
      });
      
      expect(deleteResponse.status()).toBe(200);
      const responseData = await deleteResponse.json();
      expect(responseData.message).toContain('deleted successfully');
      console.log('✅ User deleted successfully');
      
      // Step 4: Verify user is actually deleted by trying to create another poll
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
      
      // Should get a response asking for new user registration
      expect(verifyResponse.status()).toBe(200);
      const verifyText = await verifyResponse.text();
      expect(verifyText).toContain('you do not have an account with us'); // Should redirect to user registration
      console.log('✅ User deletion verified - user needs to register again');
      
      console.log('🎉 USER DELETION TEST COMPLETED SUCCESSFULLY!');
      
    } finally {
      // Step 5: Always clean up any remaining test data
      console.log('🧹 Cleaning up any remaining test data...');
      const cleanupResponse = await page.request.delete('/api/user', {
        data: {
          email: testEmail
        },
        headers: {
          'Content-Type': 'application/json'
        }
      });
      
      // This might return 404 if user was already deleted, which is fine
      if (cleanupResponse.status() === 200) {
        console.log('✅ Final cleanup performed');
      } else {
        console.log('ℹ️ No final cleanup needed');
      }
    }
  });

  test('should handle deletion of non-existent user', async ({ page }) => {
    console.log('🚫 Testing deletion of non-existent user...');
    
    const response = await page.request.delete('/api/user', {
      data: {
        email: 'nonexistent@example.com'
      },
      headers: {
        'Content-Type': 'application/json'
      }
    });
    
    expect(response.status()).toBe(404);
    const responseData = await response.json();
    expect(responseData.error).toContain('User not found');
    
    console.log('✅ Non-existent user deletion properly handled');
  });

  test('should require email parameter', async ({ page }) => {
    console.log('❌ Testing API with missing email...');
    
    const response = await page.request.delete('/api/user', {
      data: {},
      headers: {
        'Content-Type': 'application/json'
      }
    });
    
    expect(response.status()).toBe(400);
    const responseData = await response.json();
    expect(responseData.error).toContain('Email is required');
    
    console.log('✅ Missing email properly handled');
  });
}); 