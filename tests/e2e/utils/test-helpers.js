/**
 * Utility functions for E2E tests
 */

/**
 * Creates a basic test poll with given options
 * @param {import('@playwright/test').Page} page 
 * @param {Object} options - Poll configuration
 * @returns {Promise<string|null>} Poll ID if successful
 */
async function createTestPoll(page, options = {}) {
  const {
    title = `Test Poll ${Date.now()}`,
    description = 'Auto-generated test poll',
    seats = '1',
    candidates = ['Option A', 'Option B']
  } = options;

  await page.goto('/makepoll');
  
  // Fill in poll details
  const titleInput = page.locator('input[name="title"], input[id*="title"], #poll-title');
  if (await titleInput.count() > 0) {
    await titleInput.fill(title);
  }
  
  const descriptionInput = page.locator('textarea[name="description"], textarea[id*="description"], #poll-description');
  if (await descriptionInput.count() > 0) {
    await descriptionInput.fill(description);
  }
  
  const seatsInput = page.locator('input[name="seats"], input[id*="seats"], input[type="number"]');
  if (await seatsInput.count() > 0) {
    await seatsInput.fill(seats);
  }
  
  // Add candidates
  const optionInputs = page.locator('input[name*="option"], input[id*="option"]').first();
  if (await optionInputs.count() > 0 && candidates.length > 0) {
    await optionInputs.fill(candidates[0]);
    
    // Add additional candidates
    const addOptionBtn = page.locator('button:has-text("add"), button[id*="add"], [hx-post*="add-option"]');
    for (let i = 1; i < candidates.length; i++) {
      if (await addOptionBtn.count() > 0) {
        await addOptionBtn.click();
        await page.waitForTimeout(500);
        
        const nextOption = page.locator('input[name*="option"], input[id*="option"]').nth(i);
        if (await nextOption.count() > 0) {
          await nextOption.fill(candidates[i]);
        }
      }
    }
  }
  
  // Submit
  const submitBtn = page.locator('button[type="submit"], input[type="submit"], button:has-text("create"), button:has-text("submit")');
  await submitBtn.click();
  await page.waitForLoadState('networkidle');
  
  // Extract poll ID from URL or page content
  return await extractPollId(page);
}

/**
 * Extracts poll ID from current page URL or content
 * @param {import('@playwright/test').Page} page 
 * @returns {Promise<string|null>}
 */
async function extractPollId(page) {
  const currentUrl = page.url();
  
  // Try to find poll ID in URL
  const urlMatch = currentUrl.match(/\/vote\/(\d+)|\/results\/(\d+)|poll[_-]?id[=:](\d+)|id[=:](\d+)/);
  if (urlMatch) {
    return urlMatch[1] || urlMatch[2] || urlMatch[3] || urlMatch[4];
  }
  
  // Look for poll ID in success page text content (approvalvote.co/vote/123)
  const pageText = await page.textContent('body');
  if (pageText) {
    const textMatch = pageText.match(/approvalvote\.co\/vote\/(\d+)|approvalvote\.co\/results\/(\d+)/);
    if (textMatch) {
      return textMatch[1] || textMatch[2];
    }
  }
  
  // Try to find poll ID in href attributes
  const pollIdElements = await page.locator('a[href*="/vote/"], a[href*="/results/"]').all();
  for (const element of pollIdElements) {
    const href = await element.getAttribute('href');
    if (href) {
      const hrefMatch = href.match(/\/vote\/(\d+)|\/results\/(\d+)/);
      if (hrefMatch) {
        return hrefMatch[1] || hrefMatch[2];
      }
    }
  }
  
  // Look for poll ID in onclick attributes (copy button)
  const copyButtons = await page.locator('button[onclick*="vote/"], button[onclick*="results/"]').all();
  for (const button of copyButtons) {
    const onclick = await button.getAttribute('onclick');
    if (onclick) {
      const onclickMatch = onclick.match(/vote\/(\d+)|results\/(\d+)/);
      if (onclickMatch) {
        return onclickMatch[1] || onclickMatch[2];
      }
    }
  }
  
  return null;
}

/**
 * Casts a vote on a poll
 * @param {import('@playwright/test').Page} page 
 * @param {string} pollId 
 * @param {Object} options - Voting options
 * @returns {Promise<boolean>} Success status
 */
async function castVote(page, pollId, options = {}) {
  const {
    email = null,
    selectedIndices = [0], // Which options to select (by index)
    waitForConfirmation = true
  } = options;

  await page.goto(`/vote/${pollId}`);
  await page.waitForLoadState('networkidle');
  
  // Fill email if provided
  if (email) {
    const emailInput = page.locator('input[type="email"], input[name*="email"], input[id*="email"]');
    if (await emailInput.count() > 0) {
      await emailInput.fill(email);
    }
  }
  
  // Select voting options
  const voteOptions = page.locator('input[type="checkbox"], input[type="radio"]');
  const optionCount = await voteOptions.count();
  
  if (optionCount === 0) {
    return false;
  }
  
  // Select specified options
  for (const index of selectedIndices) {
    if (index < optionCount) {
      await voteOptions.nth(index).check();
    }
  }
  
  // Submit vote
  const voteButton = page.locator('button:has-text("vote"), button[type="submit"], input[type="submit"]');
  await voteButton.click();
  
  if (waitForConfirmation) {
    await page.waitForTimeout(2000);
    
    // Check for success confirmation
    const hasConfirmation = await page.locator(':has-text("success"), :has-text("recorded"), :has-text("thank"), :has-text("vote")').count() > 0;
    return hasConfirmation;
  }
  
  return true;
}

/**
 * Waits for an element to be visible with retry logic
 * @param {import('@playwright/test').Page} page 
 * @param {string} selector 
 * @param {number} timeout 
 * @returns {Promise<boolean>}
 */
async function waitForElement(page, selector, timeout = 10000) {
  try {
    await page.waitForSelector(selector, { timeout, state: 'visible' });
    return true;
  } catch (error) {
    return false;
  }
}

/**
 * Takes a screenshot with timestamp for debugging
 * @param {import('@playwright/test').Page} page 
 * @param {string} name 
 */
async function debugScreenshot(page, name) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  await page.screenshot({ 
    path: `test-results/debug-${name}-${timestamp}.png`,
    fullPage: true 
  });
}

/**
 * Gets the last verification code from the test endpoint
 * @param {import('@playwright/test').Page} page 
 * @returns {Promise<string|null>} Verification code or null if not available
 */
async function getLastVerificationCode(page) {
  try {
    const response = await page.request.get('/api/test/verification-code');
    if (response.ok()) {
      const data = await response.json();
      return data.verification_code;
    }
    return null;
  } catch (error) {
    console.log('Failed to get verification code:', error);
    return null;
  }
}

/**
 * Establishes a user session by creating and verifying a user through the normal browser flow
 * This is needed for API requests that require session authentication
 * @param {Page} page - Playwright page object
 * @param {string} email - Email address for the user
 * @param {string} fullName - Full name for the user (optional, defaults to "Test User")
 * @param {string} preferredName - Preferred name for the user (optional, defaults to "Test")
 * @returns {Promise<void>}
 */
async function establishUserSession(page, email, fullName = 'Test User', preferredName = 'Test') {
  // Create and verify user through the normal flow to establish session
  await page.goto('/makepoll');
  
  // Fill minimal poll form to trigger user registration/verification
  await page.fill('input[id="email"]', email);
  await page.fill('input[id="title"]', `Session Test ${Date.now()}`);
  await page.fill('textarea[id="description"]', 'Establishing session');
  await page.fill('input[id="seats"]', '1');
  
  const optionInputs = page.locator('input[name="option"]');
  await optionInputs.nth(0).fill('Option A');
  await optionInputs.nth(1).fill('Option B');
  
  await page.click('button[type="submit"]');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(2000);
  
  // Handle registration if needed
  const needsRegistration = await page.locator(':has-text("do not have an account")').count() > 0;
  if (needsRegistration) {
    await page.fill('input[id="full_name"]', fullName);
    await page.fill('input[id="preferred_name"]', preferredName);
    await page.click('button:has-text("Send verification code")');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);
  }
  
  // Handle verification to establish session
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
  
  // Session is now established for this email
}

module.exports = {
  createTestPoll,
  extractPollId,
  castVote,
  waitForElement,
  debugScreenshot,
  getLastVerificationCode,
  establishUserSession
}; 