import { expect, test } from '@playwright/test';

const chromeShim = () => {
  const store: Record<string, unknown> = {};
  (window as unknown as { chrome: unknown }).chrome = {
    storage: {
      local: {
        get: async (keys?: unknown) => {
          if (keys == null) return { ...store };
          if (typeof keys === 'string') return { [keys]: store[keys] };
          if (Array.isArray(keys)) {
            return Object.fromEntries(keys.map((key) => [key, store[String(key)]]));
          }
          if (typeof keys === 'object') {
            return {
              ...keys,
              ...Object.fromEntries(
                Object.keys(keys).map((key) => [
                  key,
                  store[key] ?? (keys as Record<string, unknown>)[key],
                ]),
              ),
            };
          }
          return {};
        },
        set: async (obj: Record<string, unknown>) => {
          Object.assign(store, obj);
        },
        remove: async (key: string) => {
          delete store[key];
        },
      },
    },
    runtime: {
      id: 'test',
      getURL: (path: string) => path,
      onMessage: { addListener() {}, removeListener() {} },
    },
    permissions: {
      contains: async () => true,
      request: async () => true,
    },
    sidePanel: {
      setPanelBehavior: async () => {},
    },
  };
};

test.describe('StoryPop side panel smoke', () => {
  test('mounts, accepts story input, and opens settings without page errors', async ({ page }) => {
    const pageErrors: string[] = [];
    page.on('pageerror', (error) => {
      pageErrors.push(error.stack ?? error.message);
    });

    await page.addInitScript(chromeShim);
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
