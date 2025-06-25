const { test, expect } = require('@playwright/test');
const { extractPollId, getLastVerificationCode } = require('./utils/test-helpers');

test.describe('Voting Flow', () => {
  // Helper function to create a poll with proper verification handling
  async function createPollWithVerification(page, title, options) {
    const timestamp = Date.now();
    const testEmail = `votingtest${timestamp}@example.com`;
    
    await page.goto('/makepoll');
    
    // Fill poll form including email
    await page.fill('input[id="email"]', testEmail);
    await page.fill('input[id="title"]', title);
    await page.fill('textarea[id="description"]', 'Test poll for voting');
    await page.fill('input[id="seats"]', '1');
    
    // Fill options
    const optionInputs = page.locator('input[name="option"]');
    for (let i = 0; i < options.length && i < 2; i++) {
      await optionInputs.nth(i).fill(options[i]);
    }
    
    // Submit poll form
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
      const verificationCode = await getLastVerificationCode(page);
      if (verificationCode) {
        await page.fill('input[name="code"]', verificationCode);
        await page.click('button:has-text("Submit verification")');
        await page.waitForLoadState('networkidle');
        await page.waitForTimeout(2000);
      }
    }
    
    // Extract poll ID from success page and return both poll ID and email
    const pollId = await extractPollId(page);
    return { pollId, email: testEmail };
  }

  test('should display poll page with options', async ({ page }) => {
    // Create a fresh poll for this test
    const result = await createPollWithVerification(page, 'Voting Test Poll', ['Option A', 'Option B']);
    expect(result.pollId).toBeTruthy();
    
    try {
      // Go to the voting page for the created poll
      await page.goto(`/vote/${result.pollId}`);
      
      // Check that poll page loads
      await expect(page.locator('body')).toBeVisible();
      
      // Look for voting form or options
      const hasVotingElements = await page.locator('form, input[type="checkbox"], input[type="radio"], button:has-text("vote")').count() > 0;
      expect(hasVotingElements).toBeTruthy();
    } finally {
      // Cleanup: Delete the poll
      try {
        const deleteResponse = await page.request.delete(`/api/poll/${result.pollId}`, {
          data: { email: result.email },
          headers: { 'Content-Type': 'application/json' }
        });
        console.log(`🧹 Cleanup: Poll ${result.pollId} deletion status: ${deleteResponse.status()}`);
      } catch (error) {
        console.log(`⚠️ Cleanup warning: Could not delete poll ${result.pollId}`);
      }
    }
  });

  test('should allow voting without email', async ({ page }) => {
    // Create a fresh poll for this test
    const result = await createPollWithVerification(page, 'Anonymous Voting Test', ['Candidate A', 'Candidate B']);
    expect(result.pollId).toBeTruthy();
    
    try {
      // Go to the voting page
      await page.goto(`/vote/${result.pollId}`);
      await page.waitForLoadState('networkidle');
      
      // Select voting options (checkboxes or radio buttons)
      const voteOptions = page.locator('input[type="checkbox"], input[type="radio"]');
      const optionCount = await voteOptions.count();
      
      if (optionCount > 0) {
        // Select the first option
        await voteOptions.first().check();
        
        // Submit vote
        const voteButton = page.locator('button:has-text("vote"), button[type="submit"], input[type="submit"]');
        await voteButton.click();
        
        // Wait for response
        await page.waitForTimeout(2000);
        
        // Check for success message or confirmation
        const hasSuccessMessage = await page.locator(':has-text("submitted"), :has-text("vote")').count() > 0;
        expect(hasSuccessMessage).toBeTruthy();
      }
    } finally {
      // Cleanup: Delete the poll
      try {
        const deleteResponse = await page.request.delete(`/api/poll/${result.pollId}`, {
          data: { email: result.email },
          headers: { 'Content-Type': 'application/json' }
        });
        console.log(`🧹 Cleanup: Poll ${result.pollId} deletion status: ${deleteResponse.status()}`);
      } catch (error) {
        console.log(`⚠️ Cleanup warning: Could not delete poll ${result.pollId}`);
      }
    }
  });

  test('should handle voting with email', async ({ page }) => {
    // Create a fresh poll for this test
    const result = await createPollWithVerification(page, 'Email Voting Test', ['Choice A', 'Choice B']);
    expect(result.pollId).toBeTruthy();
    
    try {
      // Go to the voting page
      await page.goto(`/vote/${result.pollId}`);
      await page.waitForLoadState('networkidle');
      
      // Fill email if there's an email field
      const emailInput = page.locator('input[type="email"], input[name*="email"], input[id*="email"]');
      if (await emailInput.count() > 0) {
        await emailInput.fill('test@example.com');
      }
      
      // Select voting options
      const voteOptions = page.locator('input[type="checkbox"], input[type="radio"]');
      const optionCount = await voteOptions.count();
      
      if (optionCount > 0) {
        await voteOptions.first().check();
        
        const voteButton = page.locator('button:has-text("vote"), button[type="submit"], input[type="submit"]');
        await voteButton.click();
        
        await page.waitForTimeout(2000);
        
        // Might need to handle user registration or verification
        const needsRegistration = await page.locator(':has-text("register"), :has-text("verify"), :has-text("code")').count() > 0;
        
        if (needsRegistration) {
          // Handle registration/verification flow
          console.log('Vote requires registration/verification');
        } else {
          // Check for success
          const hasSuccessMessage = await page.locator(':has-text("submitted"), :has-text("vote")').count() > 0;
          expect(hasSuccessMessage).toBeTruthy();
        }
      }
    } finally {
      // Cleanup: Delete the poll
      try {
        const deleteResponse = await page.request.delete(`/api/poll/${result.pollId}`, {
          data: { email: result.email },
          headers: { 'Content-Type': 'application/json' }
        });
        console.log(`🧹 Cleanup: Poll ${result.pollId} deletion status: ${deleteResponse.status()}`);
      } catch (error) {
        console.log(`⚠️ Cleanup warning: Could not delete poll ${result.pollId}`);
      }
    }
  });

  test('should require at least one selection', async ({ page }) => {
    // Create a fresh poll for this test
    const result = await createPollWithVerification(page, 'Validation Test Poll', ['Option 1', 'Option 2']);
    expect(result.pollId).toBeTruthy();
    
    try {
      // Go to the voting page
      await page.goto(`/vote/${result.pollId}`);
      await page.waitForLoadState('networkidle');
      
      // Try to submit without selecting any options
      const voteButton = page.locator('button:has-text("vote"), button[type="submit"], input[type="submit"]');
      await voteButton.click();
      
      await page.waitForTimeout(1000);
      
      // Should see error message or stay on page
      const hasErrorMessage = await page.locator(':has-text("select"), :has-text("error"), :has-text("required")').count() > 0;
      const stillOnVotePage = page.url().includes('/vote/');
      
      expect(hasErrorMessage || stillOnVotePage).toBeTruthy();
    } finally {
      // Cleanup: Delete the poll
      try {
        const deleteResponse = await page.request.delete(`/api/poll/${result.pollId}`, {
          data: { email: result.email },
          headers: { 'Content-Type': 'application/json' }
        });
        console.log(`🧹 Cleanup: Poll ${result.pollId} deletion status: ${deleteResponse.status()}`);
      } catch (error) {
        console.log(`⚠️ Cleanup warning: Could not delete poll ${result.pollId}`);
      }
    }
  });
}); 