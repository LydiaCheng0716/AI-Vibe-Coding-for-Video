import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { defaultSettings } from '../../src/core/defaults';
import { saveSettings } from '../../src/services/storage';
import { OneTimeKeyInput, useOneTimeKey } from '../../src/components/OneTimeKeyInput';

function Harness({ persistApiKey }: { persistApiKey?: boolean }) {
  const oneTimeKey = useOneTimeKey(
    persistApiKey === undefined ? undefined : { persistApiKey },
  );
  return (
    <div>
      <span data-testid="persist">{String(oneTimeKey.persistApiKey)}</span>
      <span data-testid="apiKey">{oneTimeKey.apiKey ?? ''}</span>
      <span data-testid="hasKey">{String(oneTimeKey.hasKey)}</span>
      <OneTimeKeyInput
        oneTimeKey={oneTimeKey}
        placeholder="一次性 Key"
        className="custom-key-input"
      />
      <button type="button" onClick={oneTimeKey.clear}>
        clear
      </button>
    </div>
  );
}

describe('useOneTimeKey + OneTimeKeyInput', () => {
  it('未传 persistApiKey 时读取 settings，显示一次性 Key 输入并返回 trim 后 apiKey', async () => {
    const settings = defaultSettings();
    settings.persistApiKey = false;
    await saveSettings(settings);
    const user = userEvent.setup();

    render(<Harness />);

    await waitFor(() => expect(screen.getByTestId('persist').textContent).toBe('false'));
    const input = screen.getByPlaceholderText('一次性 Key') as HTMLInputElement;
    expect(input.className).toContain('custom-key-input');

    await user.type(input, '  sk-once  ');

    expect(screen.getByTestId('apiKey').textContent).toBe('sk-once');
    expect(screen.getByTestId('hasKey').textContent).toBe('true');

    await user.click(screen.getByRole('button', { name: 'clear' }));

    expect(input.value).toBe('');
    expect(screen.getByTestId('apiKey').textContent).toBe('');
    expect(screen.getByTestId('hasKey').textContent).toBe('false');
  });

  it('传入 persistApiKey=true 时不渲染输入，且不暴露 apiKey', async () => {
    render(<Harness persistApiKey />);

    expect(screen.queryByPlaceholderText('一次性 Key')).toBeNull();
    expect(screen.getByTestId('persist').textContent).toBe('true');
    expect(screen.getByTestId('apiKey').textContent).toBe('');
    expect(screen.getByTestId('hasKey').textContent).toBe('false');
  });
});
