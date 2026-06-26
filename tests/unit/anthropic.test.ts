import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createAnthropicProvider } from '../../src/services/llm/anthropic';
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

const req = {
  system: 'sys',
  user: 'usr',
  model: 'claude-3-5-sonnet-latest',
  maxTokens: 4000,
  signal: new AbortController().signal,
};

beforeEach(() => {
  vi.restoreAllMocks();
  vi.mocked(getApiKeyForRequest).mockResolvedValue('sk-ant-secret');
});

describe('anthropic: usage parsing', () => {
  it('解析 usage.input_tokens / output_tokens，但 complete 仍只返回文本', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse({
        content: [{ type: 'text', text: '{"shots":[1]}' }],
        usage: { input_tokens: 234, output_tokens: 56 },
      }),
    );
    const provider = createAnthropicProvider();
    const out = await provider.complete(req);
    expect(out).toBe('{"shots":[1]}');
    expect(provider.lastUsage?.()).toEqual({ input: 234, output: 56 });
  });
});
