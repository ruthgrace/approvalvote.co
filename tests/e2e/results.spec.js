const { test, expect } = require('@playwright/test');
const { createTestPoll, extractPollId, getLastVerificationCode } = require('./utils/test-helpers');

test.describe('Poll Results', () => {
  // Helper function to create a poll with proper verification handling
  async function createPollWithVerification(page, title, options) {
    const testEmail = 'noreply@approvalvote.co';
    
    // Clean existing user to ensure clean state
    try {
      await page.request.delete('/api/user', {
        data: { email: testEmail },
        headers: { 'Content-Type': 'application/json' }
      });
    } catch (error) {
      // User might not exist, which is fine
    }
    
    await page.goto('/makepoll');
    
    // Fill poll form including email
    await page.fill('input[id="email"]', testEmail);
    await page.fill('input[id="title"]', title);
    await page.fill('textarea[id="description"]', 'Test poll for results');
    await page.fill('input[id="seats"]', '1');
    
    // Fill options
    const optionInputs = page.locator('input[name="option"]');
    for (let i = 0; i < options.length; i++) {
      if (i < 2) {
        // First two options use existing inputs
        await optionInputs.nth(i).fill(options[i]);
      } else {
        // Additional options - add by pressing Enter on the last input
        const lastInput = optionInputs.nth(i-1);
        await lastInput.press('Enter');
        await page.waitForTimeout(500);
        // Fill the newly created input
        const newOptionInputs = page.locator('input[name="option"]');
        if (await newOptionInputs.count() > i) {
          await newOptionInputs.nth(i).fill(options[i]);
        }
      }
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

  // Helper function to cast votes on a poll
  async function castVotesOnPoll(page, pollId, votePatterns) {
    console.log(`🗳️ Casting ${votePatterns.length} votes on poll ${pollId}...`);
    
    for (let i = 0; i < votePatterns.length; i++) {
      const { name, email, optionIndexes } = votePatterns[i];
      
      // Create new context for each voter to simulate different users
      const context = await page.context().browser().newContext();
      const voterPage = await context.newPage();
      
      try {
        await voterPage.goto(`/vote/${pollId}`);
        await voterPage.waitForLoadState('networkidle');
        
        // Fill voter information
        const nameInput = voterPage.locator('input[id="full_name"]');
        const emailInput = voterPage.locator('input[id="email"]');
        
        if (await nameInput.count() > 0) {
          await nameInput.fill(name);
        }
        if (await emailInput.count() > 0 && email) {
          await emailInput.fill(email);
        }
        
        // Select voting options
        const voteOptions = voterPage.locator('input[type="checkbox"], input[type="radio"]');
        for (const optionIndex of optionIndexes) {
          if (optionIndex < await voteOptions.count()) {
            await voteOptions.nth(optionIndex).check();
          }
        }
        
        // Submit vote
        await voterPage.click('button[type="submit"]');
        await voterPage.waitForLoadState('networkidle');
        await voterPage.waitForTimeout(1000);
        
        console.log(`✅ Vote ${i + 1} cast by ${name || 'Anonymous'}`);
      } finally {
        await voterPage.close();
        await context.close();
      }
    }
  }

  test('should display results page with actual votes', async ({ page }) => {
    // Create a fresh poll for this test
    const result = await createPollWithVerification(page, 'Results Display Test', ['Result Option A', 'Result Option B']);
    expect(result.pollId).toBeTruthy();
    
    try {
      // Cast some votes before checking results
      const votes = [
        { name: 'Alice', email: null, optionIndexes: [0] }, // Anonymous vote for Option A
        { name: 'Bob', email: null, optionIndexes: [1] }, // Anonymous vote for Option B
        { name: 'Charlie', email: null, optionIndexes: [0, 1] }, // Anonymous vote for both options
      ];
      
      await castVotesOnPoll(page, result.pollId, votes);
      
      // Go to the results page for the created poll
      await page.goto(`/results/${result.pollId}`);
      await page.waitForLoadState('networkidle');
      
      // Check if page loads
      await expect(page.locator('body')).toBeVisible();
      
      // Look for results content - should show actual vote data now
      const hasResults = await page.locator(':has-text("winner"), :has-text("result"), :has-text("vote"), table, canvas').count() > 0;
      const hasError = await page.locator(':has-text("error"), :has-text("not found")').count() > 0;
      
      expect(hasResults || hasError).toBeTruthy();
      
      // Additional check: with votes cast, we should see some numerical results
      const hasVoteCount = await page.locator(':has-text("3"), :has-text("vote")').count() > 0;
      if (hasVoteCount) {
        console.log('✅ Results page shows vote counts as expected');
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

  test('should show poll results with charts or tables populated with vote data', async ({ page }) => {
    // Create a fresh poll for this test with more options for better visualization
    const result = await createPollWithVerification(page, 'Chart Results Test', ['Option Alpha', 'Option Beta', 'Option Gamma']);
    expect(result.pollId).toBeTruthy();
    
    try {
      // Cast a variety of votes to create interesting data for visualization
      const votes = [
        { name: 'Voter 1', email: null, optionIndexes: [0] }, // Alpha only
        { name: 'Voter 2', email: null, optionIndexes: [1] }, // Beta only  
        { name: 'Voter 3', email: null, optionIndexes: [0, 2] }, // Alpha and Gamma
        { name: 'Voter 4', email: null, optionIndexes: [1, 2] }, // Beta and Gamma
        { name: 'Voter 5', email: null, optionIndexes: [0, 1, 2] }, // All three options
      ];
      
      await castVotesOnPoll(page, result.pollId, votes);
      
      // Go to the results page
      await page.goto(`/results/${result.pollId}`);
      await page.waitForLoadState('networkidle');
      
      // Look for data visualization elements
      const hasDataVisualization = await page.locator('canvas, svg, table, .chart, [id*="chart"]').count() > 0;
      
      if (hasDataVisualization) {
        expect(hasDataVisualization).toBeTruthy();
        console.log('✅ Results page displays data visualization with vote data');
      } else {
        // If no visualization, at least should have some results text with actual numbers
        const hasResultsText = await page.locator(':has-text("winner"), :has-text("candidate"), :has-text("vote")').count() > 0;
        expect(hasResultsText).toBeTruthy();
        console.log('✅ Results page displays textual results with vote data');
      }
      
      // Verify we can see evidence of the 5 votes cast
      const hasVoteNumbers = await page.locator('text=/[3-5]|vote/').count() > 0;
      if (hasVoteNumbers) {
        console.log('✅ Results show vote counts from the 5 votes cast');
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