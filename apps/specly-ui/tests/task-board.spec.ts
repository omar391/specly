import { test, expect } from '@playwright/test';

test('Task Board loads and allows view toggling', async ({ page }) => {
    // Navigate to a workspace tasks page (assuming workspace-1 exists or mocking)
    // For E2E we might need to seed data or mock the API network requests
    // Here we'll assume we can mock the network

    await page.route('*/**/api/workspaces/*/tasks', async route => {
        const json = {
            tasks: [
                { id: 'task-1', title: 'E2E Task 1', status: 'pending', priority: 'high', progress: 0 },
                { id: 'task-2', title: 'E2E Task 2', status: 'in_progress', priority: 'medium', progress: 50 }
            ]
        };
        await route.fulfill({ json });
    });

    await page.goto('/workspaces/workspace-1/tasks');

    // Verify title
    await expect(page.getByRole('heading', { name: 'Tasks' })).toBeVisible();

    // Verify List View is default
    await expect(page.getByText('E2E Task 1')).toBeVisible();
    await expect(page.getByText('E2E Task 2')).toBeVisible();

    // Toggle to Board View
    await page.getByRole('button', { name: 'Board' }).click();

    // Verify Board columns
    await expect(page.getByText('Pending')).toBeVisible();
    await expect(page.getByText('In Progress')).toBeVisible();

    // Verify tasks in board
    // We can check if the task card is present in the board
    await expect(page.getByText('E2E Task 1')).toBeVisible();
});
