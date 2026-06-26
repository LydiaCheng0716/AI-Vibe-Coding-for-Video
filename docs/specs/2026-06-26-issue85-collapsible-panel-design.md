# Issue #85: Unified Collapsible Panel Design

## Context

StoryPop currently has three collapsible side-panel sections with different interaction models:

- `StylePanel` toggles by clicking the title button and appends `▾` or `▸` to the title.
- `DraftsPanel` uses a local `open` state and the same triangle convention, but defaults closed.
- `CharacterPanel` uses a separate text button (`展开` / `收起`) and hides the add-character button while collapsed.

All three states are local React state only, so switching tabs or reopening the extension loses the user's collapse preference.

## Goals

- Use one reusable `CollapsiblePanel` component for all three panels.
- Match the existing global-style visual convention: expanded `▾`, collapsed `▸`.
- Persist panel collapsed state per panel key.
- Keep default state expanded when no persisted value exists or storage reads fail.
- Keep each panel's business logic and non-collapse controls unchanged.

## Component Contract

`src/components/CollapsiblePanel.tsx` exports a reusable React component with:

- `title: ReactNode`
- `children: ReactNode`
- `headerRight?: ReactNode`
- `persistKey?: string`
- `collapsed?: boolean`
- `onToggleCollapsed?: (collapsed: boolean) => void`
- `className?: string`
- `contentClassName?: string`

Rendering:

- Root element is a `<section>`.
- Header row uses a left toggle `<button>` and a right-side `headerRight` slot.
- The toggle button renders title content followed by `▾` when expanded or `▸` when collapsed.
- The toggle button exposes `aria-expanded`.
- The toggle button exposes an i18n `aria-label`, using the action plus title text:
  - expanded: collapse action
  - collapsed: expand action
- Children render only when expanded.

State:

- Uncontrolled mode defaults to expanded.
- Controlled mode uses `collapsed` and calls `onToggleCollapsed(nextCollapsed)`.
- When `persistKey` is provided, uncontrolled mode reads `getSettings().panelCollapsed?.[persistKey]`.
- Missing or invalid persisted values fall back to expanded.
- Storage read failures fall back to expanded and do not break render.
- On toggle, the component updates UI immediately and calls `setPanelCollapsed(persistKey, nextCollapsed)`. Write failures are non-fatal for UI.

The right-side slot is outside the toggle button so clicking lock/add/save controls does not trigger collapse.

## Persistence

`Settings` gains:

```ts
panelCollapsed?: Record<string, boolean>;
```

`getSettings()` shallow-normalizes this optional map:

- Missing map remains `{}` or equivalent optional-friendly value.
- Only boolean entries are retained.

`src/services/storage.ts` gains:

```ts
setPanelCollapsed(key: string, collapsed: boolean): Promise<Result<void>>
```

The implementation runs inside the existing `withSettingsLock` and performs read-modify-write:

1. Read current settings.
2. Copy current `panelCollapsed`.
3. Set the one requested key.
4. Write the whole settings object with current `SCHEMA_VERSION`.

This keeps concurrent updates to `character`, `style`, and `drafts` from overwriting each other.

## Panel Migration

- `CharacterPanel`
  - Replace the separate `展开` / `收起` text button with `CollapsiblePanel`.
  - `persistKey="character"`.
  - Keep `+ 新增角色` in `headerRight`.
  - Keep collapsed hint inside the expanded content removed from collapse state rendering; collapsed state is now represented by hidden content and the triangle.

- `StylePanel`
  - Replace local collapsed state with `CollapsiblePanel`.
  - `persistKey="style"`.
  - Keep lock/unlock button in `headerRight`.
  - Keep locked badge inside title.

- `DraftsPanel`
  - Replace local `open` state with `CollapsiblePanel`.
  - `persistKey="drafts"`.
  - Keep save-current button in `headerRight`.
  - Default becomes expanded when no persisted value exists, matching the new shared contract and preserving default-expanded expectations.

## i18n

Add keys in both `zh.ts` and `en.ts`:

- `collapsible.expandAria`
- `collapsible.collapseAria`

The values interpolate `{title}`.

## Tests

Storage tests:

- `panelCollapsed` defaults to no collapsed panels.
- `setPanelCollapsed` persists a single key.
- Concurrent `setPanelCollapsed` calls for different keys do not overwrite each other.
- Existing settings fields survive collapse-state writes.

Component tests:

- Default render is expanded and uses `▾`.
- Toggle hides children, flips to `▸`, and exposes correct `aria-expanded`.
- `headerRight` click does not toggle the panel.
- Controlled mode calls `onToggleCollapsed`.
- `persistKey` reads remembered state.
- Read failures fall back to expanded.
- Write failures do not break the visible toggle.

Migration tests:

- Character, style, and drafts panels render through the shared triangle toggle.
- Header-right controls still work independently.
- Each panel uses its own persisted key.

## Rollback

Rollback is limited to UI state:

1. Revert the three panel migrations to local state.
2. Leave `Settings.panelCollapsed` unused; it is optional and ignored by older code.
3. Remove `CollapsiblePanel` and associated tests if needed.

Stored `panelCollapsed` data is harmless because settings normalization ignores unknown optional fields in older branches.
