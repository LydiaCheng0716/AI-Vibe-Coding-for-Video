import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import CollapsiblePanel from '../../src/components/CollapsiblePanel';
import { getSettings, saveSettings } from '../../src/services/storage';
import { defaultSettings } from '../../src/core/defaults';

describe('CollapsiblePanel', () => {
  it('defaults expanded, renders down triangle, and toggles children', async () => {
    const user = userEvent.setup();
    render(
      <CollapsiblePanel title="测试面板">
        <p>面板内容</p>
      </CollapsiblePanel>,
    );

    const toggle = screen.getByRole('button', { name: '收起 测试面板' });
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(toggle.textContent).toBe('测试面板 ▾');
    expect(screen.getByText('面板内容')).toBeTruthy();

    await user.click(toggle);

    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(toggle.textContent).toBe('测试面板 ▸');
    expect(screen.queryByText('面板内容')).toBeNull();
    expect(screen.getByRole('button', { name: '展开 测试面板' })).toBeTruthy();
  });

  it('does not toggle when a headerRight control is clicked', async () => {
    const user = userEvent.setup();
    const onHeaderClick = vi.fn();
    render(
      <CollapsiblePanel
        title="角色"
        headerRight={
          <button type="button" onClick={onHeaderClick}>
            + 新增角色
          </button>
        }
      >
        <p>角色内容</p>
      </CollapsiblePanel>,
    );

    await user.click(screen.getByRole('button', { name: '+ 新增角色' }));

    expect(onHeaderClick).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: '收起 角色' }).getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByText('角色内容')).toBeTruthy();
  });

  it('supports controlled collapsed state', async () => {
    const user = userEvent.setup();
    const onToggleCollapsed = vi.fn();
    render(
      <CollapsiblePanel title="受控面板" collapsed onToggleCollapsed={onToggleCollapsed}>
        <p>受控内容</p>
      </CollapsiblePanel>,
    );

    const toggle = screen.getByRole('button', { name: '展开 受控面板' });
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByText('受控内容')).toBeNull();

    await user.click(toggle);

    expect(onToggleCollapsed).toHaveBeenCalledWith(false);
    expect(screen.queryByText('受控内容')).toBeNull();
  });

  it('reads persisted collapsed state and remembers toggles by key', async () => {
    const user = userEvent.setup();
    await saveSettings({ ...defaultSettings(), panelCollapsed: { character: true } });

    render(
      <CollapsiblePanel title="角色" persistKey="character">
        <p>角色内容</p>
      </CollapsiblePanel>,
    );

    const toggle = await screen.findByRole('button', { name: '展开 角色' });
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByText('角色内容')).toBeNull();

    await user.click(toggle);

    expect(screen.getByRole('button', { name: '收起 角色' }).getAttribute('aria-expanded')).toBe('true');
    await waitFor(async () => {
      expect((await getSettings()).panelCollapsed?.character).toBe(false);
    });
  });

  it('falls back expanded when persisted state read fails', async () => {
    vi.spyOn(chrome.storage.local, 'get').mockRejectedValueOnce(new Error('read failed'));

    render(
      <CollapsiblePanel title="草稿" persistKey="drafts">
        <p>草稿内容</p>
      </CollapsiblePanel>,
    );

    expect((await screen.findByRole('button', { name: '收起 草稿' })).getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByText('草稿内容')).toBeTruthy();
  });

  it('keeps the visible toggle state when persistence write fails', async () => {
    const user = userEvent.setup();
    render(
      <CollapsiblePanel title="风格" persistKey="style">
        <p>风格内容</p>
      </CollapsiblePanel>,
    );

    const toggle = await screen.findByRole('button', { name: '收起 风格' });
    vi.spyOn(chrome.storage.local, 'set').mockRejectedValueOnce(new Error('quota'));

    await user.click(toggle);

    expect(screen.getByRole('button', { name: '展开 风格' }).getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByText('风格内容')).toBeNull();
  });
});
