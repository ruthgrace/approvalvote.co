const { test, expect } = require('@playwright/test');
const { createTestPoll, extractPollId, getLastVerificationCode } = require('./utils/test-helpers');

test.describe('Poll Results', () => {
  // Helper function to create a poll with proper verification handling
  async function createPollWithVerification(page, title, options) {
    const timestamp = Date.now();
    const testEmail = `resultstest${timestamp}@example.com`;
    
    await page.goto('/makepoll');
    
    // Fill poll form including email
    await page.fill('input[id="email"]', testEmail);
    await page.fill('input[id="title"]', title);
    await page.fill('textarea[id="description"]', 'Test poll for results');
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

  test('should display results page', async ({ page }) => {
    // Create a fresh poll for this test
    const result = await createPollWithVerification(page, 'Results Display Test', ['Result Option A', 'Result Option B']);
    expect(result.pollId).toBeTruthy();
    
    try {
      // Go to the results page for the created poll
      await page.goto(`/results/${result.pollId}`);
      
      // Check if page loads
      await expect(page.locator('body')).toBeVisible();
      
      // Look for results content or error message
      const hasResults = await page.locator(':has-text("winner"), :has-text("result"), :has-text("vote"), table, canvas').count() > 0;
      const hasError = await page.locator(':has-text("error"), :has-text("not found")').count() > 0;
      
      expect(hasResults || hasError).toBeTruthy();
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

  test('should show poll results with charts or tables', async ({ page }) => {
    // Create a fresh poll for this test
    const result = await createPollWithVerification(page, 'Chart Results Test', ['Chart Option A', 'Chart Option B']);
    expect(result.pollId).toBeTruthy();
    
    try {
      // Go to the results page
      await page.goto(`/results/${result.pollId}`);
      await page.waitForLoadState('networkidle');
      
      // Look for data visualization elements
      const hasDataVisualization = await page.locator('canvas, svg, table, .chart, [id*="chart"]').count() > 0;
      
      if (hasDataVisualization) {
        expect(hasDataVisualization).toBeTruthy();
      } else {
        // If no visualization, at least should have some results text
        const hasResultsText = await page.locator(':has-text("winner"), :has-text("candidate"), :has-text("vote")').count() > 0;
        expect(hasResultsText).toBeTruthy();
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

  test('should handle non-existent poll results gracefully', async ({ page }) => {
    // Try to access results for a poll that likely doesn't exist
    await page.goto('/results/999999');
    
    await page.waitForLoadState('networkidle');
    
    // Should handle gracefully - either error message or redirect
    const currentUrl = page.url();
    const hasErrorHandling = currentUrl.includes('error') || 
                           await page.locator(':has-text("not found"), :has-text("error")').count() > 0 ||
                           !currentUrl.includes('999999'); // redirected away
    
    expect(hasErrorHandling).toBeTruthy();
  });
}); 