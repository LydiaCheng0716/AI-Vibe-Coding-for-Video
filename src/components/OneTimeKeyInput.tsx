import { useEffect, useMemo, useState, type InputHTMLAttributes } from 'react';
import { getSettings } from '../services/storage';

export interface OneTimeKeyState {
  persistApiKey: boolean;
  tempKey: string;
  apiKey?: string;
  hasKey: boolean;
  setTempKey: (value: string) => void;
  clear: () => void;
}

interface UseOneTimeKeyOptions {
  persistApiKey?: boolean;
}

export function useOneTimeKey(options: UseOneTimeKeyOptions = {}): OneTimeKeyState {
  const hasExternalPersist = options.persistApiKey !== undefined;
  const [persistApiKey, setPersistApiKey] = useState(options.persistApiKey ?? true);
  const [tempKey, setTempKey] = useState('');

  useEffect(() => {
    if (hasExternalPersist) {
      setPersistApiKey(options.persistApiKey ?? true);
      return;
    }

    let alive = true;
    getSettings()
      .then((s) => {
        if (alive) setPersistApiKey(s.persistApiKey);
      })
      .catch(() => {
        /* 读取失败按默认保存模式 */
      });
    return () => {
      alive = false;
    };
  }, [hasExternalPersist, options.persistApiKey]);

  useEffect(() => {
    if (persistApiKey && tempKey) setTempKey('');
  }, [persistApiKey, tempKey]);

  const apiKey = useMemo(() => {
    if (persistApiKey) return undefined;
    const trimmed = tempKey.trim();
    return trimmed || undefined;
  }, [persistApiKey, tempKey]);

  return {
    persistApiKey,
    tempKey,
    apiKey,
    hasKey: !!apiKey,
    setTempKey,
    clear: () => setTempKey(''),
  };
}

interface OneTimeKeyInputProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'value' | 'onChange'> {
  oneTimeKey: OneTimeKeyState;
}

export function OneTimeKeyInput({
  oneTimeKey,
  autoComplete = 'off',
  ...props
}: OneTimeKeyInputProps) {
  if (oneTimeKey.persistApiKey) return null;
  return (
    <input
      {...props}
      data-testid="onetime-key-input"
      type="password"
      autoComplete={autoComplete}
      value={oneTimeKey.tempKey}
      onChange={(e) => oneTimeKey.setTempKey(e.target.value)}
    />
  );
}
