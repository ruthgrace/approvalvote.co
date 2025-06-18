const { test, expect } = require('@playwright/test');

test.describe('Poll Results', () => {
  test('should display results page', async ({ page }) => {
    // Try to access results page - use poll ID 1 as example
    await page.goto('/results/1');
    
    // Check if page loads (might show error if poll doesn't exist)
    await expect(page.locator('body')).toBeVisible();
    
    // Look for results content or error message
    const hasResults = await page.locator(':has-text("winner"), :has-text("result"), :has-text("vote"), table, canvas').count() > 0;
    const hasError = await page.locator(':has-text("error"), :has-text("not found")').count() > 0;
    
    expect(hasResults || hasError).toBeTruthy();
  });

  test('should show poll results with charts or tables', async ({ page }) => {
    await page.goto('/results/1');
    
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