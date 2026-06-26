import { useEffect, useState, type ReactElement, type ReactNode } from 'react';
import { useT } from '../i18n';
import { getSettings, setPanelCollapsed } from '../services/storage';

interface Props {
  title: ReactNode;
  children: ReactNode;
  headerRight?: ReactNode;
  persistKey?: string;
  collapsed?: boolean;
  onToggleCollapsed?: (collapsed: boolean) => void;
  className?: string;
  contentClassName?: string;
}

function titleText(node: ReactNode): string {
  if (node == null || typeof node === 'boolean') return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(titleText).join('');
  if (typeof node === 'object' && 'props' in node) {
    return titleText((node as ReactElement<{ children?: ReactNode }>).props.children);
  }
  return '';
}

export default function CollapsiblePanel({
  title,
  children,
  headerRight,
  persistKey,
  collapsed,
  onToggleCollapsed,
  className = 'flex flex-col gap-2 border-t border-gray-200 p-3',
  contentClassName,
}: Props) {
  const t = useT();
  const controlled = collapsed !== undefined;
  const [localCollapsed, setLocalCollapsed] = useState(false);
  const isCollapsed = controlled ? collapsed : localCollapsed;
  const labelTitle = titleText(title).trim();

  useEffect(() => {
    if (!persistKey || controlled) return;
    let active = true;
    getSettings()
      .then((settings) => {
        if (!active) return;
        setLocalCollapsed(settings.panelCollapsed?.[persistKey] ?? false);
      })
      .catch(() => {
        if (active) setLocalCollapsed(false);
      });
    return () => {
      active = false;
    };
  }, [controlled, persistKey]);

  function toggle() {
    const next = !isCollapsed;
    if (!controlled) setLocalCollapsed(next);
    onToggleCollapsed?.(next);
    if (persistKey) void setPanelCollapsed(persistKey, next);
  }

  return (
    <section className={className}>
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={toggle}
          className="text-sm font-semibold"
          aria-expanded={!isCollapsed}
          aria-label={t(isCollapsed ? 'collapsible.expandAria' : 'collapsible.collapseAria', { title: labelTitle })}
        >
          {title}
          {isCollapsed ? ' ▸' : ' ▾'}
        </button>
        {headerRight}
      </div>
      {!isCollapsed && <div className={contentClassName}>{children}</div>}
    </section>
  );
}
