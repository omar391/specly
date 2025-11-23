import { test, expect } from '@playwright/test';

test('App Shell loads and displays navigation', async ({ page }) => {
    // Mock workspaces for sidebar if needed
    await page.route('*/**/api/workspaces', async route => {
        await route.fulfill({ json: { workspaces: [] } });
    });

    await page.goto('/');

    // Verify sidebar exists
    const sidebar = page.locator('nav');
    await expect(sidebar).toBeVisible();

    // Verify navigation links
    await expect(page.getByRole('link', { name: 'Overview' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Tasks' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Sessions' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Rules' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Settings' })).toBeVisible();

    // Verify main content area
    await expect(page.locator('main')).toBeVisible();
});
