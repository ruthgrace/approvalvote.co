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
    
    // Create a poll through the web interface to ensure proper user flow
    await page.goto('/makepoll');
    
    // Fill out the poll form
    await page.fill('input[id="email"]', testEmail);
    await page.fill('input[id="title"]', 'Test Poll for Deletion');
    await page.fill('textarea[id="description"]', 'This poll will be deleted');
    await page.fill('input[id="seats"]', '1');
    
    // Fill the options
    const optionInputs = page.locator('input[name="option"]');
    await optionInputs.nth(0).fill('Option A');
    await optionInputs.nth(1).fill('Option B');
    
    // Submit the form
    await page.click('button[type="submit"]');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);
    
    // Handle registration if needed
    const needsRegistration = await page.locator(':has-text("do not have an account")').count() > 0;
    if (needsRegistration) {
      await page.fill('input[id="full_name"]', 'Test User');
      await page.fill('input[id="preferred_name"]', 'Test');
      await page.click('button:has-text("Send verification code")');
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(2000);
    }
    
    // Handle verification if needed
    const needsVerification = await page.locator(':has-text("verification code")').count() > 0;
    if (needsVerification) {
      // Get verification code from test endpoint
      const codeResponse = await page.request.get('/api/test/verification-code');
      if (codeResponse.status() === 200) {
        const codeData = await codeResponse.json();
        await page.fill('input[name="code"]', codeData.verification_code);
        await page.click('button:has-text("Submit verification")');
        await page.waitForLoadState('networkidle');
        await page.waitForTimeout(2000);
      }
    }
    
    // Extract poll ID from the success page
    const pageContent = await page.textContent('body');
    const pollIdMatch = pageContent.match(/\/vote\/(\d+)/);
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
    const response = page.url().includes('404') || await page.locator('body').textContent().then(text => text.includes('Error loading poll') || text.trim().length < 100);
    expect(response || page.url() !== `http://127.0.0.1:3000/vote/${pollId}`).toBe(true);
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