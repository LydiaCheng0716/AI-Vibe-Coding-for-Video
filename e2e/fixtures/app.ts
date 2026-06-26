import type { Page, Route } from '@playwright/test';
import { SCHEMA_VERSION, STORAGE_KEYS } from '../../src/core/config';
import { defaultSettings } from '../../src/core/defaults';
import type { Settings } from '../../src/core/models';

type StorageStore = Record<string, unknown>;

export function fullFlowSettings(): Settings {
  const settings = defaultSettings();
  return {
    ...settings,
    provider: {
      kind: 'openai-compatible',
      baseUrl: 'https://e2e.local/v1',
      model: 'e2e-model',
    },
    params: {
      ...settings.params,
      outputLanguage: 'zh',
    },
    persistApiKey: false,
    autoTranslateSync: false,
    schemaVersion: SCHEMA_VERSION,
  };
}

export async function installAppFixtures(
  page: Page,
  options: { initialStore?: StorageStore; stubClipboard?: boolean } = {},
): Promise<void> {
  await page.addInitScript(
    ({ initialStore, stubClipboard }) => {
      const store: Record<string, unknown> = { ...initialStore };
      const target = window as unknown as {
        chrome: unknown;
        __copiedText?: string;
        __chromeStore?: Record<string, unknown>;
      };
      target.__chromeStore = store;
      target.chrome = {
        storage: {
          local: {
            get: async (keys?: unknown) => {
              if (keys == null) return { ...store };
              if (typeof keys === 'string') return { [keys]: store[keys] };
              if (Array.isArray(keys)) {
                return Object.fromEntries(keys.map((key) => [key, store[String(key)]]));
              }
              if (typeof keys === 'object') {
                const defaults = keys as Record<string, unknown>;
                return {
                  ...defaults,
                  ...Object.fromEntries(
                    Object.keys(defaults).map((key) => [key, store[key] ?? defaults[key]]),
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

      if (stubClipboard) {
        Object.defineProperty(navigator, 'clipboard', {
          configurable: true,
          value: {
            writeText: async (text: string) => {
              target.__copiedText = text;
            },
          },
        });
      }
    },
    {
      initialStore: options.initialStore ?? {},
      stubClipboard: options.stubClipboard ?? false,
    },
  );
}

export function fullFlowInitialStore(): StorageStore {
  return {
    [STORAGE_KEYS.settings]: fullFlowSettings(),
  };
}

export const storyboardFixture = {
  shots: [
    {
      summary: '雨夜里女孩发现旧相机',
      shotSize: '中景',
      cameraMovement: '缓慢推进',
      durationSuggestion: '4秒',
      prompt: '雨夜街角，小女孩撑伞停在旧橱窗前，发现一台微微发光的复古相机，霓虹倒影铺满湿漉漉的地面。',
    },
    {
      summary: '相机显影出隐藏小路',
      shotSize: '特写',
      cameraMovement: '轻微手持',
      durationSuggestion: '5秒',
      prompt: '女孩按下快门，照片在她手中显影，画面里出现现实中看不见的蓝色光路，雨滴在镜头前闪烁。',
    },
    {
      summary: '女孩走向光路入口',
      shotSize: '远景',
      cameraMovement: '跟拍',
      durationSuggestion: '6秒',
      prompt: '女孩沿着蓝色光路穿过雨幕，城市巷口缓缓打开一道温暖的门，旧相机在她怀里发出柔和光芒。',
    },
  ],
};

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

export async function routeChatCompletions(
  page: Page,
  options: {
    failFirstPost?: boolean;
    // 流式 401 会回退到非流式 complete()（第二次 POST）。要测「认证失败」必须每次 POST 都失败，
    // 否则回退请求成功 → 反而生成成功（本机真跑发现的真实子链路）。
    failAllPosts?: boolean;
    onPostBody?: (body: { stream?: unknown }) => void;
  } = {},
): Promise<void> {
  let postCount = 0;
  await page.route('**/chat/completions', async (route: Route) => {
    const request = route.request();
    const method = request.method();
    if (method === 'OPTIONS') {
      await route.fulfill({ status: 204, headers: corsHeaders, body: '' });
      return;
    }
    if (method !== 'POST') {
      await route.fulfill({
        status: 405,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: { message: 'Method Not Allowed' } }),
      });
      return;
    }

    postCount += 1;
    let body: { stream?: unknown } = {};
    try {
      body = JSON.parse(request.postData() ?? '{}') as { stream?: unknown };
    } catch {
      body = {};
    }
    options.onPostBody?.(body);

    if (options.failAllPosts || (options.failFirstPost && postCount === 1)) {
      await route.fulfill({
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: { message: 'invalid api key' } }),
      });
      return;
    }

    const content = JSON.stringify(storyboardFixture);
    if (body.stream === false) {
      await route.fulfill({
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          choices: [{ message: { content }, finish_reason: 'stop' }],
          usage: { prompt_tokens: 12, completion_tokens: 34 },
        }),
      });
      return;
    }

    const sse = [
      `data: ${JSON.stringify({ choices: [{ delta: { content } }] })}`,
      '',
      'data: {"choices":[],"usage":{"prompt_tokens":12,"completion_tokens":34}}',
      '',
      'data: [DONE]',
      '',
      '',
    ].join('\n');
    await route.fulfill({
      status: 200,
      headers: {
        ...corsHeaders,
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
      },
      body: sse,
    });
  });
}
