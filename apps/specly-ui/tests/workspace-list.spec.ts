import { test, expect } from '@playwright/test';

test('Workspace List displays workspaces', async ({ page }) => {
    // Mock workspaces response
    await page.route('*/**/api/workspaces', async route => {
        await route.fulfill({
            json: {
                workspaces: [
                    {
                        id: 'ws-1',
                        name: 'Test Workspace',
                        path: '/tmp/test',
                        status: 'connected',
                        last_activity: new Date().toISOString(),
                        task_count: 5,
                        active_task: null,
                        created_at: new Date().toISOString(),
                        updated_at: new Date().toISOString()
                    }
                ]
            }
        });
    });

    await page.goto('/');

    // Verify header
    await expect(page.getByRole('heading', { name: 'Workspaces' })).toBeVisible();

    // Verify workspace cards are present
    await expect(page.getByText('Test Workspace')).toBeVisible();
    await expect(page.getByText('/tmp/test')).toBeVisible();
});
