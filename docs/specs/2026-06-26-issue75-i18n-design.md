# Issue #75 UI i18n Design

## Scope

Issue #75 adds a lightweight UI internationalization layer for StoryPop. It covers the side panel shell and user-facing component copy in:

- `src/sidepanel/App.tsx`
- `src/components/StoryInput.tsx`
- `src/components/SettingsPanel.tsx`
- `src/components/ShotList.tsx`
- `src/components/ShotCard.tsx`
- `src/components/ExportPanel.tsx`
- `src/components/CharacterPanel.tsx`
- `src/components/CharacterLibrary.tsx`
- `src/components/StylePanel.tsx`
- `src/components/BgmPanel.tsx`
- `src/components/DraftsPanel.tsx`
- `src/components/OneTimeKeyInput.tsx`

Prompt content, project data, model identifiers, provider identifiers, storage keys, function names, export file names, and business logic are out of scope. `OutputLanguage` remains the generated content language; UI language is a separate `UiLanguage`.

## Architecture

`src/i18n/` contains:

- `zh.ts`: canonical Simplified Chinese UI strings. These values must match pre-i18n hardcoded UI output byte-for-byte.
- `en.ts`: same keys as `zh.ts`, translated to English.
- `index.ts`: `UiLanguage = 'zh' | 'en'`, pure `t(key, lang, params?)`, `I18nProvider`, `useT()`, and language state helpers for components that need to change UI language.

The resource values are either strings with `{name}` placeholders or functions. The `t()` function never throws: unknown language falls back to `zh`, missing key falls back to the `zh` resource, and still-missing keys return the raw key.

## Key Naming

Keys use `component.intent` naming, with nested dynamic variants where useful:

- `storyInput.generate`
- `shotList.title`
- `shotCard.copyZhAria`
- `settings.uiLanguage`
- `drafts.title`

Dynamic text uses named parameters, for example `t('shotList.title', { n })` returns `分镜（3 个镜头）` in `zh`.

## Chinese Byte Consistency

The current Chinese UI is treated as the golden output. The migration keeps:

- Full-width punctuation such as `（` and `）`.
- Existing spaces in aria-labels such as `上移 镜头 1`.
- Existing ellipses `…`.
- Existing mixed English terms such as `input tokens` and `BGM`.

Existing tests are intentionally left unchanged. Their exact Chinese text assertions are the main regression guard for byte consistency.

## UI Language Persistence

`Settings` gains optional `uiLanguage?: UiLanguage`. `defaultSettings()` returns `uiLanguage: 'zh'`, and `getSettings()` normalizes invalid or missing values to `zh`.

`App` reads `getSettings()` on mount and when returning from settings, then provides the value through `I18nProvider`. `SettingsPanel` exposes a `界面语言` selector. Changing it updates local UI immediately, persists via `updateSettings({ uiLanguage })`, and reports any storage failure without crashing.

## Coverage And Non-Migrated Copy

The intended coverage is all visible UI strings in the listed components, including button text, labels, placeholders, aria-labels, confirmation text, and status notices. Project content and generated/exported artifact content are intentionally not translated by this UI layer.

No intentionally visible UI copy should remain zh-only in English mode after the migration, except user/project data and provider/category/model names that are domain values rather than UI copy.

## Rollback

Rollback is a single-feature revert:

1. Remove `src/i18n/` and tests added for Issue #75.
2. Revert component substitutions from `t(...)` back to literal strings.
3. Remove `uiLanguage` from `Settings`, `defaultSettings()`, and storage normalization.

Because `uiLanguage` is optional and defaults to `zh`, stored settings with the field are backward-compatible with older code that ignores unknown properties.

## Tests

- Unit test `t()` zh/en hits, interpolation, missing key fallback to zh and then key.
- Unit test `useT()` without Provider returns zh.
- SettingsPanel test changes UI language to English, persists `uiLanguage: 'en'`, and immediately renders key copy in English.
- Existing component tests remain unchanged and assert Chinese output byte-for-byte under the no-Provider/default-zh path.
- Full gates: `npm run lint`, `npm run test`, `npm run test:coverage`, `npm run build`, `npm run check:bundle`.
