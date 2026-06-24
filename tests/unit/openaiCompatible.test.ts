import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createOpenAiCompatibleProvider } from '../../src/services/llm/openaiCompatible';
import { ProviderCallError } from '../../src/services/llm/provider';
import { getApiKeyForRequest } from '../../src/services/keyVault';

vi.mock('../../src/services/keyVault', () => ({
  getApiKeyForRequest: vi.fn(),
}));

function jsonResponse(body: unknown, init: { status?: number } = {}): Response {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

function okCompletion(content = '{"shots":[]}'): Response {
  return jsonResponse({ choices: [{ message: { content } }] });
}

const req = {
  system: 'sys',
  user: 'usr',
  model: 'gpt-4o-mini',
  maxTokens: 4000,
  signal: new AbortController().signal,
};

beforeEach(() => {
  vi.restoreAllMocks();
  vi.mocked(getApiKeyForRequest).mockResolvedValue('sk-secret-1234');
});

describe('openaiCompatible: 请求形状', () => {
  it('带 Authorization Bearer 头与 messages/max_tokens', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(okCompletion());
    await createOpenAiCompatibleProvider('https://api.moonshot.cn/v1').complete(req);
    expect(fetchSpy).toHaveBeenCalledOnce();
    const [url, opts] = fetchSpy.mock.calls[0];
    expect(url).toBe('https://api.moonshot.cn/v1/chat/completions');
    const headers = (opts as RequestInit).headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer sk-secret-1234');
    const body = JSON.parse((opts as RequestInit).body as string);
    expect(body.model).toBe('gpt-4o-mini');
    expect(body.max_tokens).toBe(4000);
    expect(body.messages).toHaveLength(2);
    expect(body.response_format).toEqual({ type: 'json_object' });
  });

  it('默认 baseUrl 回退到 OpenAI', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(okCompletion());
    await createOpenAiCompatibleProvider().complete(req);
    expect(fetchSpy.mock.calls[0][0]).toBe('https://api.openai.com/v1/chat/completions');
  });

  it('返回内容透传为待解析文本', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(okCompletion('{"shots":[1]}'));
    const out = await createOpenAiCompatibleProvider().complete(req);
    expect(out).toBe('{"shots":[1]}');
  });
});

describe('openaiCompatible: response_format 兼容回退（api-spec §4.2）', () => {
  it('400 unsupported response_format → 去字段重试一次', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        jsonResponse({ error: { message: 'unsupported parameter: response_format' } }, { status: 400 }),
      )
      .mockResolvedValueOnce(okCompletion());
    await createOpenAiCompatibleProvider().complete(req);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    const body2 = JSON.parse((fetchSpy.mock.calls[1][1] as RequestInit).body as string);
    expect(body2.response_format).toBeUndefined();
  });
});

describe('openaiCompatible: 状态码 → ErrorCode（api-spec §5）', () => {
  it('401 → AUTH_FAILED 不重试', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({ e: 1 }, { status: 401 }));
    await expect(createOpenAiCompatibleProvider().complete(req)).rejects.toMatchObject({
      code: 'AUTH_FAILED',
      retriable: false,
    });
  });

  it('429 → RATE_LIMITED retriable', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({ e: 1 }, { status: 429 }));
    await expect(createOpenAiCompatibleProvider().complete(req)).rejects.toMatchObject({
      code: 'RATE_LIMITED',
      retriable: true,
    });
  });

  it('500 → NETWORK_ERROR retriable', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({ e: 1 }, { status: 500 }));
    await expect(createOpenAiCompatibleProvider().complete(req)).rejects.toMatchObject({
      code: 'NETWORK_ERROR',
      retriable: true,
    });
  });

  it('fetch 抛错 → NETWORK_ERROR', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('Failed to fetch'));
    await expect(createOpenAiCompatibleProvider().complete(req)).rejects.toBeInstanceOf(
      ProviderCallError,
    );
  });

  it('错误不泄露明文 Key', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({ e: 1 }, { status: 401 }));
    try {
      await createOpenAiCompatibleProvider().complete(req);
    } catch (e) {
      expect((e as Error).message).not.toContain('sk-secret-1234');
    }
  });
});
