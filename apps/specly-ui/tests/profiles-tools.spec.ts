import { test, expect } from '@playwright/test';

test('Profiles and Tools integration', async ({ page }) => {
    test.setTimeout(60000);
    const timestamp = Date.now();
    const toolName = `Integration Tool ${timestamp}`;
    const profileName = `Integration Profile ${timestamp}`;

    // 1. Create a Tool
    await page.goto('/tools/new');
    await page.waitForLoadState('domcontentloaded');
    await page.locator('#name').fill(toolName);
    await page.getByLabel('Description').fill('Test Description');
    await page.getByRole('button', { name: 'Create Tool' }).click();

    // Verify tool created and redirected to detail page (or list)
    // Assuming redirect to list or detail. Let's wait for navigation.
    await expect(page).toHaveURL(/\/tools/);

    // 2. Create a Profile
    await page.goto('/profiles');
    await page.getByRole('button', { name: 'New Profile' }).click();
    await page.getByLabel('Name').fill(profileName);
    await page.getByLabel('Description').fill('Test Profile Description');
    await page.getByRole('button', { name: 'Create Profile' }).click();

    // Verify profile appears in list
    await expect(page.getByText(profileName)).toBeVisible();

    // 3. Go to Profile Detail
    await page.getByText(profileName).click();
    await expect(page).toHaveURL(/\/profiles\/.*/);
    await expect(page.getByRole('heading', { name: profileName })).toBeVisible();

    // 4. Attach Tool
    await page.getByRole('button', { name: 'Attach Tool' }).click();
    await page.getByRole('combobox').click();
    await page.getByLabel(toolName).click(); // Select the tool
    // Note: Shadcn Select might behave differently, might need to click the option text
    // If getByLabel doesn't work for the option, try getByRole('option', { name: toolName })

    // Wait for the dialog to be fully open and select populated
    // The select trigger opens the content.
    // We clicked combobox (trigger). Now we need to find the item.
    // Shadcn select items are usually in a portal.
    // Let's try to find the text in the page.
    await page.getByRole('option', { name: toolName }).click();

    await page.getByRole('button', { name: 'Attach', exact: true }).click();

    // 5. Verify Attachment
    await expect(page.getByText(toolName)).toBeVisible();
    // Verify version hash is visible (partial check)
    await expect(page.getByText(/^[a-f0-9]{8}$/)).toBeVisible();
});
