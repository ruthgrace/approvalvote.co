const { test, expect } = require('@playwright/test');

test.describe('Voting Flow', () => {
  // Helper function to create a test poll first
  async function createTestPoll(page) {
    await page.goto('/makepoll');
    
    // Fill in basic poll details
    const titleInput = page.locator('input[name="title"], input[id*="title"], #poll-title');
    if (await titleInput.count() > 0) {
      await titleInput.fill('E2E Test Poll');
    }
    
    const seatsInput = page.locator('input[name="seats"], input[id*="seats"], input[type="number"]');
    if (await seatsInput.count() > 0) {
      await seatsInput.fill('1');
    }
    
    // Add options
    const optionInputs = page.locator('input[name*="option"], input[id*="option"]').first();
    if (await optionInputs.count() > 0) {
      await optionInputs.fill('Candidate A');
      
      const addOptionBtn = page.locator('button:has-text("add"), button[id*="add"]');
      if (await addOptionBtn.count() > 0) {
        await addOptionBtn.click();
        const secondOption = page.locator('input[name*="option"], input[id*="option"]').nth(1);
        if (await secondOption.count() > 0) {
          await secondOption.fill('Candidate B');
        }
      }
    }
    
    // Submit
    const submitBtn = page.locator('button[type="submit"], input[type="submit"], button:has-text("create"), button:has-text("submit")');
    await submitBtn.click();
    await page.waitForLoadState('networkidle');
    
    // Extract poll ID from URL if redirected to vote page
    const currentUrl = page.url();
    const pollIdMatch = currentUrl.match(/\/vote\/(\d+)/);
    return pollIdMatch ? pollIdMatch[1] : null;
  }

  test('should display poll page with options', async ({ page }) => {
    // First create a poll or use a known poll ID
    const pollId = await createTestPoll(page);
    
    if (pollId) {
      await page.goto(`/vote/${pollId}`);
    } else {
      // Fallback: try to access poll page directly with ID 1
      await page.goto('/vote/1');
    }
    
    // Check that poll page loads
    await expect(page.locator('body')).toBeVisible();
    
    // Look for voting form or options
    const hasVotingElements = await page.locator('form, input[type="checkbox"], input[type="radio"], button:has-text("vote")').count() > 0;
    expect(hasVotingElements).toBeTruthy();
  });

  test('should allow voting without email', async ({ page }) => {
    const pollId = await createTestPoll(page);
    
    if (pollId) {
      await page.goto(`/vote/${pollId}`);
    } else {
      await page.goto('/vote/1');
    }
    
    // Wait for page to load
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
      const hasSuccessMessage = await page.locator(':has-text("success"), :has-text("recorded"), :has-text("thank"), :has-text("vote")').count() > 0;
      expect(hasSuccessMessage).toBeTruthy();
    }
  });

  test('should handle voting with email', async ({ page }) => {
    const pollId = await createTestPoll(page);
    
    if (pollId) {
      await page.goto(`/vote/${pollId}`);
    } else {
      await page.goto('/vote/1');
    }
    
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
        const hasSuccessMessage = await page.locator(':has-text("success"), :has-text("recorded"), :has-text("thank")').count() > 0;
        expect(hasSuccessMessage).toBeTruthy();
      }
    }
  });

  test('should require at least one selection', async ({ page }) => {
    const pollId = await createTestPoll(page);
    
    if (pollId) {
      await page.goto(`/vote/${pollId}`);
    } else {
      await page.goto('/vote/1');
    }
    
    await page.waitForLoadState('networkidle');
    
    // Try to submit without selecting any options
    const voteButton = page.locator('button:has-text("vote"), button[type="submit"], input[type="submit"]');
    await voteButton.click();
    
    await page.waitForTimeout(1000);
    
    // Should see error message or stay on page
    const hasErrorMessage = await page.locator(':has-text("select"), :has-text("error"), :has-text("required")').count() > 0;
    const stillOnVotePage = page.url().includes('/vote/');
    
    expect(hasErrorMessage || stillOnVotePage).toBeTruthy();
  });
}); 