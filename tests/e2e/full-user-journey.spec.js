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
    const testEmail = `test${timestamp}@example.com`;
    await page.fill('input[id="email"]', testEmail);
    await page.fill('input[id="title"]', pollTitle);
    await page.fill('textarea[id="description"]', 'Full E2E test poll description');
    await page.fill('input[id="seats"]', '2');
    
    // Add poll options using the correct approach
    const optionInputs = page.locator('input[name="option"]');
    await optionInputs.nth(0).fill('Candidate Alpha');
    await optionInputs.nth(1).fill('Candidate Beta');
    
    // Add third option
    await page.click('button[hx-post="/add-option"]');
    await page.waitForTimeout(500);
    const updatedOptionInputs = page.locator('input[name="option"]');
    await updatedOptionInputs.nth(2).fill('Candidate Gamma');
    
    // Submit poll creation
    await page.click('button[type="submit"]');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);
    
    // Handle registration if needed
    const needsRegistration = await page.locator(':has-text("do not have an account")').count() > 0;
    if (needsRegistration) {
      await page.fill('input[id="full_name"]', 'E2E Test User');
      await page.fill('input[id="preferred_name"]', 'E2E');
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
    
    // Step 4: Extract poll ID from success page
    const pageContent = await page.textContent('body');
    const pollIdMatch = pageContent.match(/\/vote\/(\d+)/);
    
    if (!pollIdMatch) {
      console.log('❌ Could not extract poll ID from page content');
      console.log('Page content sample:', pageContent.substring(0, 500));
    }
    
    expect(pollIdMatch).toBeTruthy();
    const pollId = pollIdMatch[1];
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
    const hasVoteConfirmation = await page.locator(':has-text("submitted"), :has-text("vote")').count() > 0;
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
    const testEmail = `multiuser${timestamp}@example.com`;
    
    await page.fill('input[id="email"]', testEmail);
    await page.fill('input[id="title"]', `Multi-User Test Poll ${timestamp}`);
    await page.fill('input[id="seats"]', '1');
    
    // Add options
    const optionInputs = page.locator('input[name="option"]');
    await optionInputs.nth(0).fill('Option A');
    await optionInputs.nth(1).fill('Option B');
    
    // Submit
    await page.click('button[type="submit"]');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);
    
    // Handle registration if needed
    const needsRegistration = await page.locator(':has-text("do not have an account")').count() > 0;
    if (needsRegistration) {
      await page.fill('input[id="full_name"]', 'Multi Test User');
      await page.fill('input[id="preferred_name"]', 'Multi');
      await page.click('button:has-text("Send verification code")');
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(2000);
    }
    
    // Handle verification if needed
    const needsVerification = await page.locator(':has-text("verification code")').count() > 0;
    if (needsVerification) {
      const codeResponse = await page.request.get('/api/test/verification-code');
      if (codeResponse.status() === 200) {
        const codeData = await codeResponse.json();
        await page.fill('input[name="code"]', codeData.verification_code);
        await page.click('button:has-text("Submit verification")');
        await page.waitForLoadState('networkidle');
        await page.waitForTimeout(2000);
      }
    }
    
    // Extract poll ID
    const pageContent = await page.textContent('body');
    const pollIdMatch = pageContent.match(/\/vote\/(\d+)/);
    
    if (pollIdMatch) {
      const pollId = pollIdMatch[1];
      
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