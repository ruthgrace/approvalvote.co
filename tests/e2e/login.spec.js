const { test, expect } = require('@playwright/test');

test.describe('Login Functionality', () => {
  const testEmail = 'logintest@approvalvote.co';
  
  test.beforeEach(async ({ page }) => {
    // Clean up any existing test user using API
    try {
      const response = await page.request.delete('/api/user', {
        data: { email: testEmail }
      });
    } catch (error) {
      // User might not exist, which is fine
    }
  });

  test.afterEach(async ({ page }) => {
    // Clean up test user after each test
    try {
      const response = await page.request.delete('/api/user', {
        data: { email: testEmail }
      });
    } catch (error) {
      // User might not exist, which is fine
    }
  });

  test('should show login button on home page', async ({ page }) => {
    // Navigate to home page
    await page.goto('/');
    
    // Check if login button exists and has correct styling
    const loginButton = page.locator('a[href="/login"] button');
    await expect(loginButton).toBeVisible();
    await expect(loginButton).toHaveText('Log in');
    
    // Check if button has blue text and border styling
    await expect(loginButton).toHaveClass(/text-blue-600/);
    await expect(loginButton).toHaveClass(/border-blue-600/);
  });

  test('should navigate to login page when button is clicked', async ({ page }) => {
    // Navigate to home page
    await page.goto('/');
    
    // Click login button
    await page.click('a[href="/login"] button');
    
    // Should be on login page
    await expect(page).toHaveURL('/login');
    await expect(page.locator('h1')).toContainText('Log in to your account');
    
    // Check form elements
    await expect(page.locator('input[name="email"]')).toBeVisible();
    await expect(page.locator('button[type="submit"]')).toContainText('Continue');
  });

  test('should handle login for non-existent user', async ({ page }) => {
    await page.goto('/login');
    
    // Fill in email for non-existent user
    await page.fill('input[name="email"]', 'nonexistent@example.com');
    await page.click('button[type="submit"]');
    
    // Should show error message
    await expect(page.locator('#response')).toContainText('No account found with this email address');
  });

  test('should require authentication for dashboard access', async ({ page }) => {
    // Try to access dashboard without authentication
    await page.goto('/dashboard');
    
    // Should redirect to login
    await expect(page).toHaveURL('/login');
  });

  test('should complete full login flow for existing user', async ({ page }) => {
    console.log('🧪 FULL LOGIN FLOW TEST');
    console.log('======================');
    console.log(`📧 Test email: ${testEmail}`);
    
    // First, create a user by creating a poll
    console.log('👤 Creating user by making a poll...');
    await page.goto('/makepoll');
    
    // Fill out poll form
    await page.fill('input[name="email"]', testEmail);
    await page.fill('input[name="title"]', 'Test Poll for Login');
    await page.fill('input[name="description"]', 'Test description');
    await page.fill('input[name="seats"]', '1');
    
    // Add first option
    const optionInputs = page.locator('input[name="option"]');
    await optionInputs.first().fill('Option A');
    
    // Add second option using HTMX add button
    const addButton = page.locator('button[hx-post="/add-option"]');
    await addButton.click();
    await page.waitForTimeout(500);
    
    // Fill second option
    await optionInputs.nth(1).fill('Option B');
    
    // Submit poll form
    await page.click('button[type="submit"]');
    await page.waitForTimeout(1000);
    
    // Handle user registration if needed
    const registrationForm = page.locator('input[name="name"]');
    if (await registrationForm.count() > 0) {
      await page.fill('input[name="name"]', 'Test User');
      await page.click('button[type="submit"]');
      await page.waitForTimeout(1000);
    }
    
    // Handle verification code
    const verificationForm = page.locator('input[name="code"]');
    if (await verificationForm.count() > 0) {
      const response = await page.request.get('/api/test/verification-code');
      const data = await response.json();
      await page.fill('input[name="code"]', data.verification_code);
      await page.click('button[type="submit"]');
      await page.waitForTimeout(1000);
    }
    
    console.log('✅ User created successfully');
    
    // Now test the login flow
    console.log('🔐 Testing login flow...');
    await page.goto('/login');
    
    // Fill in email
    await page.fill('input[name="email"]', testEmail);
    await page.click('button[type="submit"]');
    
    // Should show verification code form
    console.log('📲 Verification form should appear...');
    await expect(page.locator('form')).toContainText('verification code has been sent');
    await expect(page.locator('input[name="code"]')).toBeVisible();
    
    // Get verification code
    const verificationResponse = await page.request.get('/api/test/verification-code');
    const verificationData = await verificationResponse.json();
    const verificationCode = verificationData.verification_code;
    console.log(`✅ Retrieved verification code: ${verificationCode}`);
    
    // Enter verification code
    await page.fill('input[name="code"]', verificationCode);
    await page.click('button[type="submit"]');
    
    // Should redirect to dashboard
    console.log('📊 Should redirect to dashboard...');
    await page.waitForURL('/dashboard');
    await expect(page).toHaveURL('/dashboard');
    
    // Check dashboard content
    await expect(page.locator('h1')).toContainText('Your Polls');
    await expect(page.locator('text=Test Poll for Login')).toBeVisible();
    
    console.log('🎉 Login flow completed successfully!');
  });
}); 