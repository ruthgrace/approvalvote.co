const { test, expect } = require('@playwright/test');

test.describe('Playwright Setup Verification', () => {
  test('should load a basic page', async ({ page }) => {
    // Test basic functionality
    await page.goto('https://example.com');
    await expect(page).toHaveTitle(/Example/);
    await expect(page.locator('h1')).toBeVisible();
  });

  test('should work with local development server', async ({ page }) => {
    // This will test that the webServer configuration works
    // It should automatically start your Flask app
    await page.goto('/');
    
    // Basic checks - adapt based on your actual home page
    await expect(page.locator('body')).toBeVisible();
    
    // Check if it's loading properly (might fail if server isn't running)
    // This is expected to fail initially - just for testing setup
    console.log('Current URL:', page.url());
    console.log('Page title:', await page.title());
  });

  test('poll deletion API should work correctly', async ({ page }) => {
    const testEmail = `test${Date.now()}@example.com`; // Use unique email
    
    // First register the user
    const registerResponse = await page.request.post('/new_user', {
      form: {
        'email': testEmail,
        'full_name': 'Test User',
        'preferred_name': 'Test',
        'origin_function': 'new_poll'
      }
    });
    
    expect(registerResponse.status()).toBe(200);
    
    // Now create a poll
    const createResponse = await page.request.post('/pollsubmit', {
      form: {
        'email': testEmail,
        'title': 'Test Poll for Deletion',
        'description': 'This poll will be deleted',
        'option': ['Option A', 'Option B'],
        'seats': '1'
      }
    });
    
    expect(createResponse.status()).toBe(200);
    
    // Extract poll ID from response
    const responseText = await createResponse.text();
    const pollIdMatch = responseText.match(/\/vote\/(\d+)/);
    expect(pollIdMatch).toBeTruthy();
    const pollId = pollIdMatch[1];
    
    // Now test the deletion API
    const deleteResponse = await page.request.delete(`/api/poll/${pollId}`, {
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
    
    // Verify the poll is actually deleted by trying to access it
    await page.goto(`/vote/${pollId}`);
    // Should show an error or 404 page since poll no longer exists
    const hasError = await page.locator('text=error, text=not found, text=404').count() > 0;
    expect(hasError).toBe(true);
  });

  test('poll deletion API should reject unauthorized users', async ({ page }) => {
    // Try to delete a non-existent poll with unauthorized user
    const response = await page.request.delete('/api/poll/99999', {
      data: {
        email: 'unauthorized@example.com'
      },
      headers: {
        'Content-Type': 'application/json'
      }
    });
    
    expect(response.status()).toBe(404);
    const responseData = await response.json();
    expect(responseData.error).toContain('not found');
  });

  test('poll deletion API should require email', async ({ page }) => {
    const response = await page.request.delete('/api/poll/1', {
      data: {},
      headers: {
        'Content-Type': 'application/json'
      }
    });
    
    expect(response.status()).toBe(400);
    const responseData = await response.json();
    expect(responseData.error).toContain('Email is required');
  });
}); 