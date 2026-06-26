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

  it('解析 usage.prompt_tokens / completion_tokens，但 complete 仍只返回文本', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse({
        choices: [{ message: { content: '{"shots":[1]}' } }],
        usage: { prompt_tokens: 123, completion_tokens: 45 },
      }),
    );
    const provider = createOpenAiCompatibleProvider();
    const out = await provider.complete(req);
    expect(out).toBe('{"shots":[1]}');
    expect(provider.lastUsage?.()).toEqual({ input: 123, output: 45 });
  });

  it('缺失 usage 时 lastUsage 为 null', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(okCompletion('{"shots":[1]}'));
    const provider = createOpenAiCompatibleProvider();
    await provider.complete(req);
    expect(provider.lastUsage?.()).toBeNull();
  });

  it('finish_reason=length（截断）→ BAD_RESPONSE_FORMAT（ADR-6(4)）', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ choices: [{ message: { content: '{' }, finish_reason: 'length' }] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    await expect(createOpenAiCompatibleProvider().complete(req)).rejects.toMatchObject({
      code: 'BAD_RESPONSE_FORMAT',
    });
  });

  it('优先使用传入的 apiKey，不二次解密（ADR-1）', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(okCompletion());
    await createOpenAiCompatibleProvider().complete({ ...req, apiKey: 'sk-passed-in' });
    const headers = (fetchSpy.mock.calls[0][1] as RequestInit).headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer sk-passed-in');
    expect(getApiKeyForRequest).not.toHaveBeenCalled();
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

describe('openaiCompatible: probe（连接探针，Issue #28）', () => {
  it('2xx → resolve（不解析 body、不查截断）', async () => {
    // 即便 body 是空/截断也算成功——探针只判通断。
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({}, { status: 200 }));
    await expect(createOpenAiCompatibleProvider().probe(req)).resolves.toBeUndefined();
  });
  it('probe 不带 response_format（最大兼容）', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({}, { status: 200 }));
    await createOpenAiCompatibleProvider().probe(req);
    const body = JSON.parse((fetchSpy.mock.calls[0][1] as RequestInit).body as string);
    expect(body.response_format).toBeUndefined();
  });
  it('403 → FORBIDDEN', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({ e: 1 }, { status: 403 }));
    await expect(createOpenAiCompatibleProvider().probe(req)).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
  it('404 → MODEL_NOT_FOUND', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({ e: 1 }, { status: 404 }));
    await expect(createOpenAiCompatibleProvider().probe(req)).rejects.toMatchObject({ code: 'MODEL_NOT_FOUND' });
  });
  it('fetch 抛错 → ProviderCallError（网络）', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('Failed to fetch'));
    await expect(createOpenAiCompatibleProvider().probe(req)).rejects.toBeInstanceOf(ProviderCallError);
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

  it('429 带 Retry-After: 2 → retryAfterMs=2000（TASK-009）', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ e: 1 }), { status: 429, headers: { 'Retry-After': '2' } }),
    );
    await expect(createOpenAiCompatibleProvider().complete(req)).rejects.toMatchObject({
      code: 'RATE_LIMITED',
      retryAfterMs: 2000,
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
