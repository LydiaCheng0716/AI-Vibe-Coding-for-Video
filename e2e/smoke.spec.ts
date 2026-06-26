import { expect, test } from '@playwright/test';
import { installAppFixtures } from './fixtures/app';

test.describe('StoryPop side panel smoke', () => {
  test('mounts, accepts story input, and opens settings without page errors', async ({ page }) => {
    const pageErrors: string[] = [];
    page.on('pageerror', (error) => {
      pageErrors.push(error.stack ?? error.message);
    });

    await installAppFixtures(page);
    await page.goto('/');

    await expect(page.getByRole('heading', { name: 'StoryPop' })).toBeVisible();

    const storyInput = page.getByLabel('你的故事');
    await expect(storyInput).toBeVisible();
    await storyInput.fill('一个小女孩在雨夜发现会发光的旧相机。');
    await expect(storyInput).toHaveValue('一个小女孩在雨夜发现会发光的旧相机。');

    await page.getByRole('button', { name: '设置' }).click();
    await expect(page.getByRole('heading', { name: '设置' })).toBeVisible();
    await expect(page.getByText('LLM Provider（自带 Key）')).toBeVisible();

    await page.getByRole('button', { name: '返回' }).click();
    await expect(page.getByLabel('你的故事')).toBeVisible();

    expect(pageErrors).toEqual([]);
  });
});
