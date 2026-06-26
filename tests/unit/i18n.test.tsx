import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { t, useT } from '../../src/i18n';

function NoProviderProbe() {
  const tt = useT();
  return <div>{tt('shotList.title', { n: 3 })}</div>;
}

describe('i18n', () => {
  it('resolves zh and en strings', () => {
    expect(t('settings.title', 'zh')).toBe('设置');
    expect(t('settings.title', 'en')).toBe('Settings');
  });

  it('interpolates named params without changing zh punctuation', () => {
    expect(t('shotList.title', 'zh', { n: 3 })).toBe('分镜（3 个镜头）');
    expect(t('shotList.title', 'en', { n: 3 })).toBe('Storyboard (3 shots)');
  });

  it('falls back to zh before returning the key', () => {
    expect(t('settings.title', 'xx' as never)).toBe('设置');
    expect(t('missing.key', 'en')).toBe('missing.key');
  });

  it('useT falls back to zh without a Provider', () => {
    render(<NoProviderProbe />);
    expect(screen.getByText('分镜（3 个镜头）')).toBeTruthy();
  });
});
