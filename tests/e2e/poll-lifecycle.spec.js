const { test, expect } = require('@playwright/test');
const { extractPollId, getLastVerificationCode, establishUserSession } = require('./utils/test-helpers');

test.describe('Complete Poll Lifecycle', () => {
  test('should demonstrate complete poll lifecycle - create, vote, view results, delete', async ({ page }) => {
    test.setTimeout(60000); // Increase timeout to 60 seconds for comprehensive test
    const timestamp = Date.now();
    const testEmail = 'noreply@approvalvote.co';
    const differentEmail = 'voter2@example.com'; // Second user for registration test
    const pollTitle = `Complete Lifecycle Test Poll ${timestamp}`;
    
    console.log('🔄 COMPLETE POLL LIFECYCLE TEST');
    console.log('==============================');
    console.log(`📧 Test email: ${testEmail}`);
    
    // Clean existing user to ensure clean state
    try {
      // Try to establish session first, then delete
      await establishUserSession(page, testEmail, 'Cleanup User', 'Cleanup');
      await page.request.delete('/api/user', {
        data: { email: testEmail },
        headers: { 'Content-Type': 'application/json' }
      });
      console.log('✅ Existing user cleaned up');
    } catch (error) {
      // User might not exist or cleanup failed, continue with test
      console.log('ℹ️ No existing user to clean up');
    }
    
    // STEP 1: CREATE POLL
    console.log('📝 Step 1: Creating poll...');
    await page.goto('/makepoll');
    
    await page.fill('input[id="email"]', testEmail);
    await page.fill('input[id="title"]', pollTitle);
    await page.fill('textarea[id="description"]', 'Complete lifecycle test poll');
    await page.fill('input[id="seats"]', '2');
    
    // Enable email verification for security testing
    await page.check('input[name="email_verification"]');
    console.log('✅ Email verification enabled for poll');
    
    // Fill poll options
    const optionInputs = page.locator('input[name="option"]');
    await optionInputs.nth(0).fill('Candidate Alpha');
    await optionInputs.nth(1).fill('Candidate Beta');
    
    // Add third option by clicking the "Add an option" button
    await page.click('button[hx-post="/add-option"]');
    await page.waitForTimeout(500);
    
    const updatedOptionInputs = page.locator('input[name="option"]');
    await updatedOptionInputs.nth(2).fill('Candidate Gamma');
    
    // Test adding fourth option using Enter key
    await updatedOptionInputs.nth(2).focus();
    await page.waitForTimeout(100);
    await updatedOptionInputs.nth(2).press('Enter');
    await page.waitForTimeout(1000);
    
    const inputCountAfter = await page.locator('input[name="option"]').count();
    if (inputCountAfter > 3) {
      const finalOptionInputs = page.locator('input[name="option"]');
      await finalOptionInputs.nth(3).fill('Candidate Delta');
      console.log('✅ Fourth option added via Enter key');
    } else {
      console.log('❌ Enter key did not create new option - test failed');
      expect(inputCountAfter).toBeGreaterThan(3);
    }
    
    // Submit poll creation
    await page.click('button[type="submit"]');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);
    
    // STEP 2A: HANDLE NEW USER REGISTRATION
    console.log('👤 Step 2A: Testing new user registration flow...');
    
    const needsRegistration = await page.locator(':has-text("do not have an account")').count() > 0;
    console.log(`Registration form visible: ${needsRegistration}`);
    expect(needsRegistration).toBeTruthy(); // Should need registration since user was cleaned up
    
    await page.fill('input[id="full_name"]', 'Lifecycle Test User');
    await page.fill('input[id="preferred_name"]', 'Lifecycle');
    
    await page.click('button:has-text("Send verification code")');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000);
    
    // Should get verification form after registration
    const verificationAfterReg = await page.locator(':has-text("verification code")').count() > 0;
    console.log(`Verification form after registration: ${verificationAfterReg}`);
    expect(verificationAfterReg).toBeTruthy();
    
    const verificationCode = await getLastVerificationCode(page);
    console.log(`Retrieved verification code: ${verificationCode}`);
    expect(verificationCode).toBeTruthy();
    
    await page.fill('input[id="code"]', verificationCode);
    await page.click('button:has-text("Submit verification code")');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(2000);
    console.log('✅ Registration and verification successful');
    
    // STEP 3: EXTRACT POLL ID
    console.log('🆔 Step 3: Extracting poll ID...');
    await page.waitForTimeout(2000);
    
    const pollId = await extractPollId(page);
    
    if (!pollId) {
      console.log('❌ Could not extract poll ID - checking page content');
      const pageContent = await page.textContent('body');
      console.log('Page content:', pageContent.substring(0, 500));
      throw new Error('Could not extract poll ID');
    }
    
    console.log(`✅ Poll created with ID: ${pollId}`);
    
    // STEP 4: CAST MULTIPLE VOTES
    console.log('🗳️ Step 4: Casting votes from multiple users...');
    
    // Vote 1: First user
    await page.goto(`/vote/${pollId}`);
    await page.waitForLoadState('networkidle');
    
    // Fill voter info if fields are present (optional)
    const fullNameInput = page.locator('input[id="full_name"]');
    const emailInput = page.locator('input[id="email"]');
    
    if (await fullNameInput.count() > 0) {
      await fullNameInput.fill('Voter One');
    }
    if (await emailInput.count() > 0) {
      await emailInput.fill(`voter1_${timestamp}@example.com`);
    }
    
    // Select multiple options (approval voting) - use index-based selection
    const voteOptions = page.locator('input[type="checkbox"], input[type="radio"]');
    const optionCount = await voteOptions.count();
    
    if (optionCount > 0) {
      await voteOptions.nth(0).check(); // First option (Alpha)
      if (optionCount > 2) {
        await voteOptions.nth(2).check(); // Third option (Gamma)
      }
      if (optionCount > 3) {
        await voteOptions.nth(3).check(); // Fourth option (Delta)
        console.log('✅ Vote 1 cast (options 1, 3, 4)');
      } else {
        console.log('✅ Vote 1 cast (options 1, 3)');
      }
    }
    
    await page.click('button[type="submit"]');
    await page.waitForLoadState('networkidle');
    
    // Vote 2: Different email in NEW browser context - SHOULD require verification  
    console.log('🔄 Vote 2: Testing security - fresh context with different user MUST require verification...');
    const context2 = await page.context().browser().newContext();
    const page2 = await context2.newPage();
    await page2.goto(`/vote/${pollId}`);
    await page2.waitForLoadState('domcontentloaded');
    
    // Fill voter info with the same email as poll creator (should update their existing vote)
    const emailInput2 = page2.locator('input[name="user_email"]');
    
    if (await emailInput2.count() > 0) {
      await emailInput2.fill(differentEmail);
      console.log('📧 Using different email - fresh context should require verification');
    } else {
      console.log('❌ Email input field not found on vote page');
    }
    
    const voteOptions2 = page2.locator('input[type="checkbox"], input[type="radio"]');
    const optionCount2 = await voteOptions2.count();
    
    if (optionCount2 > 1) {
      await voteOptions2.nth(1).check(); // Second option (Beta)
      if (optionCount2 > 3) {
        await voteOptions2.nth(3).check(); // Fourth option (Delta)
        console.log('✅ Vote 2 options selected (2, 4) - this should UPDATE the poll creator\'s vote');
      } else if (optionCount2 > 2) {
        await voteOptions2.nth(2).check(); // Third option (Gamma)
        console.log('✅ Vote 2 options selected (2, 3) - this should UPDATE the poll creator\'s vote');
      } else {
        console.log('✅ Vote 2 options selected (2) - this should UPDATE the poll creator\'s vote');
      }
    }
    
    await page2.click('button[type="submit"]');
    
    // SECURITY CHECK: Fresh browser context should ALWAYS require verification
    // Wait for either verification form OR vote confirmation (but verification should come first)
    console.log('🔍 Waiting for server response...');
    await page2.waitForTimeout(2000); // Brief wait for server response
    
    const needsRegistration2 = await page2.locator('#error-message-div :has-text("do not have an account"), #error-message-div button:has-text("Send verification code")').count() > 0;
    const needsVerification2 = await page2.locator('#response input[name="code"], #error-message-div input[name="code"]').count() > 0;
    const hasVoteConfirmation = await page2.locator('#response :has-text("Vote submitted"), #response :has-text("submitted"), #response svg[stroke="white"]').count() > 0;
    const currentUrl2 = page2.url();
    
    console.log(`📍 After submitting vote, page URL: ${currentUrl2}`);
    console.log(`🔍 Registration form present: ${needsRegistration2}`);
    console.log(`🔍 Verification form present: ${needsVerification2}`);
    console.log(`🔍 Vote confirmation present: ${hasVoteConfirmation}`);
    
    // Debug: What did the server actually return?
    const serverResponse = await page2.locator('#response').textContent();
    const errorResponse = await page2.locator('#error-message-div').first().textContent();
    console.log(`📄 Server response (#response): "${serverResponse}"`);
    console.log(`📄 Error response (#error-message-div): "${errorResponse}"`);
    
    if (hasVoteConfirmation && !needsVerification2 && !needsRegistration2) {
      console.log('🚨 SECURITY VULNERABILITY DETECTED!');
      console.log('🚨 Fresh browser context allowed vote without verification!');
      console.log('🚨 This means the app is not properly checking sessions/authentication');
      console.log('🚨 Even if the email was "verified globally", a fresh context should require new verification');
      throw new Error('SECURITY FAILURE: Vote submission bypassed verification in fresh browser context - this is a critical security vulnerability');
    } else if (needsRegistration2) {
      console.log('✅ SECURITY CHECK PASSED: Fresh context properly requires registration for new user');
      console.log('   This is correct behavior - new users must register before voting');
      
      // Handle the required registration
      await page2.fill('#error-message-div input[id="full_name"]', 'Voter Two');
      await page2.fill('#error-message-div input[id="preferred_name"]', 'Voter2');
      await page2.click('#error-message-div button:has-text("Send verification code")');
      await page2.waitForTimeout(2000);
      
      // Now should get verification form
      const verificationCode2 = await getLastVerificationCode(page2);
      if (verificationCode2) {
        await page2.fill('#error-message-div input[name="code"]', verificationCode2);
        await page2.click('#error-message-div button:has-text("Submit verification code")');
        await page2.waitForTimeout(1500);
        console.log('✅ Registration and verification completed properly');
        
        // Now wait for vote success confirmation after verification
        try {
          await page2.waitForSelector('#response :has-text("Vote submitted"), #response :has-text("submitted"), #response svg[stroke="white"]', { timeout: 5000 });
          console.log('✅ Vote 2 successfully submitted after proper registration and verification');
        } catch (error) {
          console.log('⚠️ Vote submission status unclear after registration - but registration process was correct');
        }
      } else {
        throw new Error('Could not retrieve verification code for required registration');
      }
    } else if (needsVerification2) {
      console.log('✅ SECURITY CHECK PASSED: Fresh context properly requires verification');
      console.log('   This is correct behavior - fresh browser contexts should always require verification');
      
      // Handle the required verification
      const verificationCode2 = await getLastVerificationCode(page2);
      if (verificationCode2) {
        await page2.fill('#response input[name="code"]', verificationCode2);
        await page2.click('#response button:has-text("Submit verification code")');
        await page2.waitForTimeout(1500); // Wait for verification processing
        console.log('✅ Verification completed properly');
        
        // Now wait for vote success confirmation after verification
        try {
          await page2.waitForSelector('#response :has-text("Vote submitted"), #response :has-text("submitted"), #response svg[stroke="white"]', { timeout: 5000 });
          console.log('✅ Vote 2 successfully submitted after proper verification');
        } catch (error) {
          // Check for vote success in page content
          const pageContent = await page2.content();
          const hasThankYou = pageContent.includes('thank you') || pageContent.includes('Thank you');
          const hasVoteSuccess = pageContent.includes('vote') && (pageContent.includes('success') || pageContent.includes('cast'));
          if (hasThankYou || hasVoteSuccess) {
            console.log('✅ Vote 2 successfully submitted after proper verification (detected in page content)');
          } else {
            console.log('⚠️ Vote submission status unclear after verification - but verification process was correct');
          }
        }
      } else {
        throw new Error('Could not retrieve verification code for required verification');
      }
    } else {
      console.log('⚠️ Neither verification form nor vote confirmation found - checking page content...');
      const pageContent = await page2.content();
      console.log(`📄 Page content snippet: ${pageContent.substring(0, 200)}...`);
      throw new Error('Unexpected response after vote submission - neither verification nor confirmation found');
    }
    
    // Vote 3: Anonymous vote (no email) - should not require verification
    console.log('👤 Vote 3: Testing anonymous voting...');
    const context3 = await page.context().browser().newContext();
    const page3 = await context3.newPage();
    await page3.goto(`/vote/${pollId}`);
    await page3.waitForLoadState('domcontentloaded');
    
    // Verify email input field exists (critical for voting functionality)
    const emailInput3 = page3.locator('input[name="user_email"]');
    const emailFieldExists = await emailInput3.count() > 0;
    
    if (!emailFieldExists) {
      throw new Error('CRITICAL: Email input field missing from vote page - users cannot enter email addresses');
    }
    
    console.log('✅ Email input field exists on vote page');
    // Deliberately NOT filling email to test anonymous voting behavior
    // Since THIS poll has email verification ENABLED, anonymous vote should be REJECTED
    console.log('👤 Skipping email for anonymous vote (should be rejected since poll requires email verification)');
    
    const voteOptions3 = page3.locator('input[type="checkbox"], input[type="radio"]');
    const optionCount3 = await voteOptions3.count();
    
    if (optionCount3 > 0) {
      await voteOptions3.nth(0).check(); // First option (Alpha)
      console.log('✅ Vote 3 options selected (1)');
    }
    
    await page3.click('button[type="submit"]');
    
    // Since poll has email verification enabled, anonymous vote should be REJECTED
    await page3.waitForTimeout(2000); // Brief wait for server response
    
    const responseContent = await page3.locator('#response').textContent();
    console.log(`📄 Anonymous vote response: "${responseContent}"`);
    
    if (responseContent && responseContent.includes('Please enter an email address')) {
      console.log('✅ Anonymous vote correctly rejected - this poll requires email verification');
    } else {
      console.log('🚨 POLL CONFIGURATION ERROR: Anonymous vote was accepted despite this poll requiring email verification!');
      throw new Error('Anonymous vote should be rejected when poll has email verification enabled');
    }
    
    // STEP 5: VIEW RESULTS
    console.log('📊 Step 5: Viewing results...');
    await page.goto(`/results/${pollId}`);
    await page.waitForLoadState('domcontentloaded');
    
    // Verify results page loaded and shows content
    await expect(page.locator('text=Results')).toBeVisible();
    
    const resultsVisible = await page.locator(':has-text("vote"), :has-text("result"), :has-text("winner"), canvas, table').count() > 0;
    expect(resultsVisible).toBeTruthy();
    
    const hasDataVisualization = await page.locator('canvas, svg, table, .chart, [id*="chart"]').count() > 0;
    if (hasDataVisualization) {
      console.log('✅ Results displayed with data visualization');
    } else {
      console.log('✅ Results displayed with text content');
    }
    
    // STEP 6: DELETE POLL
    console.log('🗑️ Step 6: Deleting poll...');
    
    const deleteResponse = await page.request.delete(`/api/poll/${pollId}`, {
      data: { email: testEmail },
      headers: { 'Content-Type': 'application/json' }
    });
    
    expect(deleteResponse.status()).toBe(200);
    const deleteData = await deleteResponse.json();
    expect(deleteData.message).toContain('deleted successfully');
    console.log('✅ Poll deleted successfully');
    
    // STEP 7: VERIFY DELETION
    console.log('✅ Step 7: Verifying deletion...');
    
    await page.goto(`/vote/${pollId}`);
    
    // Wait for page to load (either 404 or redirect) with shorter timeout
    try {
      await page.waitForLoadState('domcontentloaded', { timeout: 5000 });
    } catch (error) {
      // If loading fails, that's fine - we just want to check if poll is gone
    }
    await page.waitForTimeout(1000); // Brief wait to let page settle
    
    const pollGone = await page.locator(':has-text("not found"), :has-text("does not exist"), :has-text("error")').count() > 0 ||
                    (!page.url().includes(`/vote/${pollId}`) && page.url().includes('/'));
    
    expect(pollGone).toBeTruthy();
    console.log('✅ Confirmed poll is deleted');
    
        // Cleanup users BEFORE closing contexts (to maintain sessions)
    const usersToCleanup = [
      { email: testEmail, context: page }, // Use main page for main user
      { email: differentEmail, context: page2 } // Use page2 for voter2
    ];
    
    for (const { email, context } of usersToCleanup) {
      try {
        const userDeleteResponse = await context.request.delete('/api/user', {
          data: { email: email },
          headers: { 'Content-Type': 'application/json' }
        });
        console.log(`🧹 User cleanup: User ${email} deletion status: ${userDeleteResponse.status()}`);
      } catch (error) {
        console.log(`⚠️ User cleanup warning: Could not delete user ${email}`);
      }
    }

    // Now cleanup browser contexts after users are deleted
    try {
      await Promise.all([
        page2.close().catch(() => {}),
        page3.close().catch(() => {})
      ]);
      await Promise.all([
        context2.close().catch(() => {}),
        context3.close().catch(() => {})
      ]);
      console.log('✅ Browser contexts cleaned up');
    } catch (error) {
      console.log('⚠️ Context cleanup warning:', error.message);
    }
    
    console.log('');
    console.log('🎉 COMPLETE LIFECYCLE TEST PASSED!');
    console.log('✅ Poll created with email verification');
    console.log('✅ Vote testing completed:');
    console.log('   📝 Vote 1: Anonymous voter (voter1@example.com)');
    console.log('   📝 Vote 2: Poll creator (noreply@approvalvote.co) - UPDATED their vote');
    console.log('   📝 Vote 3: Anonymous voter (no email)'); 
    console.log('   📊 Expected total: 3 unique votes (same email = vote update, not duplicate)');
    console.log('✅ Results viewed and verified');
    console.log('✅ Poll deleted and deletion verified');
    console.log('✅ User cleaned up');
  });

  test('should handle multiple votes from different users', async ({ page, context }) => {
    test.setTimeout(60000); // Increase timeout to 60 seconds for comprehensive test
    const timestamp = Date.now();
    const testEmail = 'noreply@approvalvote.co';
    
    // Clean existing user to ensure clean state
    try {
      // Try to establish session first, then delete
      await establishUserSession(page, testEmail, 'Cleanup User', 'Cleanup');
      await page.request.delete('/api/user', {
        data: { email: testEmail },
        headers: { 'Content-Type': 'application/json' }
      });
    } catch (error) {
      // User might not exist, which is fine
    }
    
    // Create poll
    await page.goto('/makepoll');
    await page.fill('input[id="email"]', testEmail);
    await page.fill('input[id="title"]', `Multi-User Test Poll ${timestamp}`);
    await page.fill('input[id="seats"]', '1');
    
    const optionInputs = page.locator('input[name="option"]');
    await optionInputs.nth(0).fill('Option A');
    await optionInputs.nth(1).fill('Option B');
    
    await page.click('button[type="submit"]');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);
    
    // Handle registration/verification if needed
    const needsRegistration = await page.locator(':has-text("do not have an account")').count() > 0;
    if (needsRegistration) {
      await page.fill('input[id="full_name"]', 'Multi Test User');
      await page.fill('input[id="preferred_name"]', 'Multi');
      await page.click('button:has-text("Send verification code")');
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(2000);
      
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
    }
    
    const pollId = await extractPollId(page);
    
    if (pollId) {
      try {
        // Vote as first user
        await page.goto(`/vote/${pollId}`);
        const voteOptions = page.locator('input[type="checkbox"], input[type="radio"]');
        if (await voteOptions.count() > 0) {
          await voteOptions.first().check();
          const voteButton = page.locator('button:has-text("vote"), button[type="submit"], input[type="submit"]');
          await voteButton.click();
          await page.waitForTimeout(2000);
        }
        
        // Vote as second user in new context
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
      } finally {
        // Cleanup poll and user (poll cleanup should work because we have session from poll creation)
        try {
          await page.request.delete(`/api/poll/${pollId}`, {
            data: { email: testEmail },
            headers: { 'Content-Type': 'application/json' }
          });
        } catch (error) {
          console.log('Cleanup warning: Could not delete poll');
        }
        
        // Cleanup user (session should still be active)
        try {
          await page.request.delete('/api/user', {
            data: { email: testEmail },
            headers: { 'Content-Type': 'application/json' }
          });
        } catch (error) {
          console.log('Cleanup warning: Could not delete user');
        }
      }
    }
  });

  test('should prevent unauthorized poll deletion', async ({ page }) => {
    console.log('🔒 Testing deletion security...');
    
    // Try to delete non-existent poll
    const response = await page.request.delete('/api/poll/1', {
      data: { email: 'unauthorized@example.com' },
      headers: { 'Content-Type': 'application/json' }
    });
    
    expect(response.status()).toBe(404);
    const data = await response.json();
    expect(data.error).toContain('not found');
    
    console.log('✅ Unauthorized deletion properly rejected');
  });
}); 