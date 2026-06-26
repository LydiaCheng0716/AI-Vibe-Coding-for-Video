import { expect, test } from '@playwright/test';
import {
  fullFlowInitialStore,
  installAppFixtures,
  routeChatCompletions,
} from './fixtures/app';

test.describe('StoryPop full flow', () => {
  test('generates via SSE, edits a shot, and copies exported content', async ({ page }) => {
    const pageErrors: string[] = [];
    page.on('pageerror', (error) => {
      pageErrors.push(error.stack ?? error.message);
    });

    await installAppFixtures(page, {
      initialStore: fullFlowInitialStore(),
      stubClipboard: true,
    });
    const postBodies: Array<{ stream?: unknown }> = [];
    await routeChatCompletions(page, {
      onPostBody: (body) => postBodies.push(body),
    });
    await page.goto('/');

    await expect(page.getByRole('heading', { name: 'StoryPop' })).toBeVisible();

    await page
      .getByTestId('story-input')
      .fill('一个小女孩在雨夜发现会发光的旧相机，并跟着照片里的线索进入隐藏街区。');
    await page.getByTestId('onetime-key-input').fill('sk-e2e-test-key');
    await page.getByTestId('generate-button').click();

    // 标题 h2 在 shot-list 容器之外（同级），故在 page 级断言；镜头卡数量在 shot-list 内断言。
    await expect(page.getByText('分镜（3 个镜头）')).toBeVisible();
    const shotList = page.getByTestId('shot-list');
    await expect(shotList.getByTestId('shot-card')).toHaveCount(3);
    expect(postBodies.some((body) => body.stream === true)).toBe(true);

    const editedPrompt = '编辑后的 E2E 提示词：女孩举起发光旧相机，雨滴悬停在空中，蓝色光路延伸到隐藏街区。';
    const firstShot = shotList.getByTestId('shot-card').first();
    await firstShot.getByTestId('shot-edit').click();
    await firstShot.getByTestId('shot-edit-input').fill(editedPrompt);
    await firstShot.getByTestId('shot-save').click();

    await expect(firstShot.getByText(editedPrompt)).toBeVisible();
    await expect(firstShot.getByText('（已编辑）')).toBeVisible();

    await page.getByTestId('export-copy').click();
    const copied = await page.evaluate(() => {
      return (window as unknown as { __copiedText?: string }).__copiedText ?? '';
    });
    expect(copied).toContain(editedPrompt);
    expect(pageErrors).toEqual([]);
  });

  test('shows a readable error when generation auth fails', async ({ page }) => {
    const pageErrors: string[] = [];
    page.on('pageerror', (error) => {
      pageErrors.push(error.stack ?? error.message);
    });

    await installAppFixtures(page, {
      initialStore: fullFlowInitialStore(),
      stubClipboard: true,
    });
    // 每次 POST 都 401：流式失败会回退非流式 complete()（第二次 POST），只失败首个会被回退救活。
    await routeChatCompletions(page, { failAllPosts: true });
    await page.goto('/');

    await expect(page.getByRole('heading', { name: 'StoryPop' })).toBeVisible();
    await page
      .getByTestId('story-input')
      .fill('一个小女孩在雨夜发现会发光的旧相机，并跟着照片里的线索进入隐藏街区。');
    await page.getByTestId('onetime-key-input').fill('sk-invalid-e2e-key');
    await page.getByTestId('generate-button').click();

    await expect(page.getByTestId('notice')).toContainText('API Key 无效');
    await expect(page.getByTestId('shot-list')).toHaveCount(0);
    expect(pageErrors).toEqual([]);
  });
});
