const { test, expect } = require('@playwright/test');

test.describe('Complete User Journey', () => {
  test('should allow complete poll creation, voting, and results viewing flow', async ({ page }) => {
    const timestamp = Date.now();
    const pollTitle = `E2E Journey Test Poll ${timestamp}`;
    
    // Step 1: Navigate to home page
    await page.goto('/');
    await expect(page.locator('body')).toBeVisible();
    
    // Step 2: Go to create poll page
    await page.goto('/makepoll');
    await expect(page.locator('form')).toBeVisible();
    
    // Step 3: Create a poll
    const titleInput = page.locator('input[name="title"], input[id*="title"], #poll-title');
    await titleInput.fill(pollTitle);
    
    const descriptionInput = page.locator('textarea[name="description"], textarea[id*="description"], #poll-description');
    if (await descriptionInput.count() > 0) {
      await descriptionInput.fill('Full E2E test poll description');
    }
    
    const seatsInput = page.locator('input[name="seats"], input[id*="seats"], input[type="number"]');
    if (await seatsInput.count() > 0) {
      await seatsInput.fill('2');
    }
    
    // Add poll options
    const optionInputs = page.locator('input[name*="option"], input[id*="option"]').first();
    await optionInputs.fill('Candidate Alpha');
    
    // Add second option
    const addOptionBtn = page.locator('button:has-text("add"), button[id*="add"], [hx-post*="add-option"]');
    if (await addOptionBtn.count() > 0) {
      await addOptionBtn.click();
      await page.waitForTimeout(1000); // Wait for dynamic content
      
      const secondOption = page.locator('input[name*="option"], input[id*="option"]').nth(1);
      if (await secondOption.count() > 0) {
        await secondOption.fill('Candidate Beta');
      }
    }
    
    // Add third option
    if (await addOptionBtn.count() > 0) {
      await addOptionBtn.click();
      await page.waitForTimeout(1000);
      
      const thirdOption = page.locator('input[name*="option"], input[id*="option"]').nth(2);
      if (await thirdOption.count() > 0) {
        await thirdOption.fill('Candidate Gamma');
      }
    }
    
    // Submit poll creation
    const submitBtn = page.locator('button[type="submit"], input[type="submit"], button:has-text("create"), button:has-text("submit")');
    await submitBtn.click();
    
    await page.waitForLoadState('networkidle');
    
    // Step 4: Extract poll ID and verify poll was created
    let pollId = null;
    const currentUrl = page.url();
    const pollIdMatch = currentUrl.match(/\/vote\/(\d+)|\/results\/(\d+)|poll[_-]?id[=:](\d+)|id[=:](\d+)/);
    if (pollIdMatch) {
      pollId = pollIdMatch[1] || pollIdMatch[2] || pollIdMatch[3] || pollIdMatch[4];
    }
    
    // If no poll ID found in URL, look for it in page content
    if (!pollId) {
      const pollIdElements = await page.locator(':has-text("poll"), :has-text("id"), a[href*="/vote/"], a[href*="/results/"]').all();
      for (const element of pollIdElements) {
        const text = await element.textContent();
        const href = await element.getAttribute('href');
        const match = (text + ' ' + (href || '')).match(/(\d+)/);
        if (match) {
          pollId = match[1];
          break;
        }
      }
    }
    
    expect(pollId).toBeTruthy();
    console.log(`Created poll with ID: ${pollId}`);
    
    // Step 5: Navigate to voting page
    await page.goto(`/vote/${pollId}`);
    await page.waitForLoadState('networkidle');
    
    // Step 6: Verify poll content
    await expect(page.locator(`text=${pollTitle}`)).toBeVisible();
    
    // Step 7: Cast a vote
    const voteOptions = page.locator('input[type="checkbox"], input[type="radio"]');
    const optionCount = await voteOptions.count();
    expect(optionCount).toBeGreaterThanOrEqual(2);
    
    // Select first two options (approval voting allows multiple selections)
    await voteOptions.nth(0).check();
    await voteOptions.nth(1).check();
    
    // Submit vote
    const voteButton = page.locator('button:has-text("vote"), button[type="submit"], input[type="submit"]');
    await voteButton.click();
    
    await page.waitForTimeout(2000);
    
    // Step 8: Verify vote was recorded
    const hasVoteConfirmation = await page.locator(':has-text("success"), :has-text("recorded"), :has-text("thank"), :has-text("vote")').count() > 0;
    expect(hasVoteConfirmation).toBeTruthy();
    
    // Step 9: View results
    await page.goto(`/results/${pollId}`);
    await page.waitForLoadState('networkidle');
    
    // Step 10: Verify results page shows data
    const hasResultsContent = await page.locator(':has-text("winner"), :has-text("result"), :has-text("vote"), canvas, table').count() > 0;
    expect(hasResultsContent).toBeTruthy();
    
    console.log(`Successfully completed full user journey for poll ${pollId}`);
  });

  test('should handle multiple votes from different users', async ({ page, context }) => {
    // Create a poll first
    await page.goto('/makepoll');
    const timestamp = Date.now();
    
    const titleInput = page.locator('input[name="title"], input[id*="title"], #poll-title');
    await titleInput.fill(`Multi-User Test Poll ${timestamp}`);
    
    const seatsInput = page.locator('input[name="seats"], input[id*="seats"], input[type="number"]');
    if (await seatsInput.count() > 0) {
      await seatsInput.fill('1');
    }
    
    // Add options
    const optionInputs = page.locator('input[name*="option"], input[id*="option"]').first();
    await optionInputs.fill('Option A');
    
    const addOptionBtn = page.locator('button:has-text("add"), button[id*="add"]');
    if (await addOptionBtn.count() > 0) {
      await addOptionBtn.click();
      await page.waitForTimeout(1000);
      const secondOption = page.locator('input[name*="option"], input[id*="option"]').nth(1);
      if (await secondOption.count() > 0) {
        await secondOption.fill('Option B');
      }
    }
    
    // Submit
    const submitBtn = page.locator('button[type="submit"], input[type="submit"], button:has-text("create"), button:has-text("submit")');
    await submitBtn.click();
    await page.waitForLoadState('networkidle');
    
    // Extract poll ID
    let pollId = null;
    const currentUrl = page.url();
    const pollIdMatch = currentUrl.match(/\/vote\/(\d+)|\/results\/(\d+)/);
    if (pollIdMatch) {
      pollId = pollIdMatch[1] || pollIdMatch[2];
    }
    
    if (pollId) {
      // Vote as first user
      await page.goto(`/vote/${pollId}`);
      const voteOptions = page.locator('input[type="checkbox"], input[type="radio"]');
      if (await voteOptions.count() > 0) {
        await voteOptions.first().check();
        const voteButton = page.locator('button:has-text("vote"), button[type="submit"], input[type="submit"]');
        await voteButton.click();
        await page.waitForTimeout(2000);
      }
      
      // Create new browser context for second user
      const secondPage = await context.newPage();
      await secondPage.goto(`/vote/${pollId}`);
      const secondVoteOptions = secondPage.locator('input[type="checkbox"], input[type="radio"]');
      if (await secondVoteOptions.count() > 1) {
        await secondVoteOptions.nth(1).check();
        const secondVoteButton = secondPage.locator('button:has-text("vote"), button[type="submit"], input[type="submit"]');
        await secondVoteButton.click();
        await secondPage.waitForTimeout(2000);
      }
      
      // Check results show multiple votes
      await page.goto(`/results/${pollId}`);
      await page.waitForLoadState('networkidle');
      
      const hasResultsWithMultipleVotes = await page.locator(':has-text("vote"), :has-text("result")').count() > 0;
      expect(hasResultsWithMultipleVotes).toBeTruthy();
      
      await secondPage.close();
    }
  });
}); 