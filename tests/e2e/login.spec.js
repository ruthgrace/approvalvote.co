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
    await expect(page.locator('h1.text-3xl')).toContainText('Log in to your account');
    
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
    await page.fill('textarea[name="description"]', 'Test description');
    await page.fill('input[name="seats"]', '1');
    
    // Fill the existing option inputs first (there are 2 by default)¥
    const initialOptionInputs = page.locator('input[name="option"]');
    await initialOptionInputs.nth(0).fill('Option A');
    await initialOptionInputs.nth(1).fill('Option B');
    
    console.log('📝 Filled option inputs: Option A, Option B');
    
    // Submit poll form
    console.log('📝 Submitting poll form...');
    await page.click('button[type="submit"]');
    await page.waitForTimeout(2000); // Wait longer for form processing
    
    console.log('📊 Checking for form response...');
    await page.waitForLoadState('networkidle');
    
    // Handle user registration if needed
    const registrationForm = page.locator('input[name="full_name"]');
    const registrationFormVisible = await registrationForm.count() > 0;
    console.log(`👤 Registration form visible: ${registrationFormVisible}`);
    
    if (registrationFormVisible) {
      console.log('👤 Registration form appeared - filling out user details...');
      await page.fill('input[name="full_name"]', 'Test User');
      await page.fill('input[name="preferred_name"]', 'Test');
      
      // Click the registration submit button (should be the new_user form button)
      console.log('🚀 Submitting registration form...');
      const submitButtons = page.locator('button[type="submit"]');
      const buttonCount = await submitButtons.count();
      console.log(`🔍 Found ${buttonCount} submit buttons on page`);
      
      // Click the last submit button (should be the registration form button)
      await submitButtons.last().click();
      await page.waitForTimeout(3000);
      await page.waitForLoadState('networkidle');
    } else {
      console.log('👤 No registration form - checking if this is expected...');
      // If no registration form appears, either:
      // 1. User already exists (check for verification form instead)
      // 2. Form submission failed (should be an error)
      
      await page.waitForTimeout(1000);
      const hasVerificationDirectly = await page.locator('input[name="code"]').count() > 0;
      const hasErrorMessage = await page.locator('body').textContent().then(text => 
        text.includes('error') || text.includes('Error') || text.includes('failed')
      );
      
      if (!hasVerificationDirectly && !hasErrorMessage) {
        console.log('❌ No registration form, no verification form, and no error - form submission likely failed');
        const currentPageContent = await page.locator('body').textContent();
        console.log(`📄 Page content: ${currentPageContent.substring(0, 300)}...`);
        throw new Error('Poll form submission appears to have failed - no registration, verification, or error response');
      }
      
      console.log(`🔐 User may already exist - verification form present: ${hasVerificationDirectly}`);
    }
    
    // Handle verification code (check again after registration)
    await page.waitForTimeout(1000); // Give time for verification form to appear
    const verificationForm = page.locator('input[name="code"]');
    const verificationFormVisible = await verificationForm.count() > 0;
    console.log(`🔐 Verification form visible after registration: ${verificationFormVisible}`);
    
    if (verificationFormVisible) {
      console.log('🔐 Verification form appeared - getting code...');
      const response = await page.request.get('/api/test/verification-code');
      const data = await response.json();
      console.log(`📲 Retrieved verification code: ${data.verification_code}`);
      await page.fill('input[name="code"]', data.verification_code);
      
      // Find and click the verification submit button (use specific text)
      const verificationSubmit = page.locator('button:has-text("Submit verification code")');
      await verificationSubmit.click();
      await page.waitForTimeout(3000); // Wait longer for verification
      
      // Check for poll creation success  
      const successText = await page.locator('body').textContent();
      if (successText.includes('vote') || successText.includes('Poll created')) {
        console.log('✅ Poll creation appears successful');
      } else {
        console.log('❌ Poll creation FAILED after verification');
        console.log(`📄 Page content: ${successText.substring(0, 200)}...`);
        throw new Error('Poll creation failed after verification - expected success indicators but none found');
      }
    } else {
      console.log('🔐 No verification form - checking if user creation succeeded without verification...');
      const pageContent = await page.locator('body').textContent();
      console.log(`📄 Current page content: ${pageContent.substring(0, 200)}...`);
    }
    
    console.log('✅ User creation process completed');
    
    // Let's verify the user was actually created by trying to access dashboard
    console.log('🔍 Checking if user session was established...');
    await page.goto('/dashboard');
    const currentUrl = page.url();
    
    if (currentUrl.includes('/dashboard')) {
      console.log('✅ User session established - user creation successful');
      // Clear session to test login flow properly
      await page.goto('/logout');
      await page.waitForTimeout(1000);
    } else {
      console.log('❌ User creation FAILED - no dashboard access');
      console.log(`📍 Current URL: ${currentUrl}`);
      console.log('🚨 This is a critical failure in the user creation flow');
      throw new Error(`User creation failed - expected dashboard access but got URL: ${currentUrl}`);
    }
    
    // Now test the login flow
    console.log('🔐 Testing login flow...');
    await page.goto('/login');
    
    // Fill in email
    await page.fill('input[name="email"]', testEmail);
    await page.click('button[type="submit"]');
    await page.waitForTimeout(2000); // Wait for response
    
    // Check what happened after login submit
    const pageContent = await page.locator('body').textContent();
    const hasVerificationForm = await page.locator('input[name="code"]').count() > 0;
    const hasErrorMessage = pageContent.includes('No account found');
    
    console.log(`📲 Verification form present: ${hasVerificationForm}`);
    console.log(`❌ Error message present: ${hasErrorMessage}`);
    
    if (hasErrorMessage) {
      console.log('❌ User not found - user creation failed in earlier step');
      throw new Error('User creation did not work properly - user not found during login');
    }
    
    // SECURITY CHECK: Fresh browser context should ALWAYS require verification
    if (!hasVerificationForm) {
      console.log('🚨 SECURITY VULNERABILITY: Login did not require verification in fresh context!');
      console.log('🚨 Each test should have fresh browser context with no cookies');
      console.log('🚨 If verification is not required, this indicates a serious security flaw');
      throw new Error('SECURITY FAILURE: Login bypass detected - verification should be required in fresh browser context');
    }
    
    // Should show verification code form
    console.log('📲 Verification form should appear...');
    await expect(page.locator('form:has(input[name="code"])')).toContainText('A verification code has been sent');
    await expect(page.locator('input[name="code"]')).toBeVisible();
    
    // Get verification code
    const verificationResponse = await page.request.get('/api/test/verification-code');
    const verificationData = await verificationResponse.json();
    const verificationCode = verificationData.verification_code;
    console.log(`✅ Retrieved verification code: ${verificationCode}`);
    
    // Enter verification code
    await page.fill('input[name="code"]', verificationCode);
    console.log('🔐 Submitting verification code for login...');
    
    // Submit verification and wait for navigation
    await Promise.all([
      page.waitForNavigation({ url: '/dashboard', timeout: 10000 }),
      page.click('button:has-text("Submit verification code")')
    ]);
    
    console.log('📊 Should be redirected to dashboard...');
    await expect(page).toHaveURL('/dashboard');
    
    // Check dashboard content
    await expect(page.locator('h1.text-3xl')).toContainText('Your Polls');
    
    // Check if there are any polls on the dashboard (the test poll should be there)
    // Look for poll containers (each poll has class bg-gray-50 and rounded-3xl)
    const pollContainers = await page.locator('div.bg-gray-50.rounded-3xl').count();
    const testPollExists = await page.locator('h2:has-text("Test Poll for Login")').count() > 0;
    
    if (pollContainers > 0 || testPollExists) {
      console.log(`✅ Found ${pollContainers} poll container(s) on dashboard`);
      if (testPollExists) {
        console.log('✅ Specific test poll "Test Poll for Login" found');
      }
    } else {
      console.log('❌ No polls found on dashboard after successful poll creation');
      console.log('🚨 This indicates the poll creation may not have persisted properly');
      const dashboardContent = await page.locator('body').textContent();
      console.log(`📄 Dashboard content: ${dashboardContent.substring(0, 300)}...`);
      // Let's also check what poll-related elements are actually present
      const allH2s = await page.locator('h2').allTextContents();
      console.log(`📋 All H2 elements found: ${JSON.stringify(allH2s)}`);
      throw new Error('Poll not found on dashboard despite successful creation - data persistence issue');
    }
    
    console.log('🎉 Login flow completed successfully!');
  });
}); 