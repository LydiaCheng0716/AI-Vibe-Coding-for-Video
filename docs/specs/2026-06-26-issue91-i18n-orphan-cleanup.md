# Issue 91: i18n Orphan Key Cleanup

## Scope

Remove confirmed unused i18n keys from both locale tables without changing runtime behavior or visible copy.

Deleted keys:

- `common.expand`
- `common.collapse`
- `shotCard.copyZh`
- `shotCard.copyEn`
- `character.collapsedHint`

Retained sibling accessibility keys:

- `shotCard.copyZhAria`
- `shotCard.copyZhFirstFrameAria`
- `shotCard.copyEnAria`
- `shotCard.copyEnFirstFrameAria`

## Verification Evidence

Pre-delete grep excluded the locale tables themselves and searched `src/`, `tests/`, and `docs/` for exact keys plus likely suffix fragments:

```bash
rg -n "common\\.expand|common\\.collapse|shotCard\\.copyZh|shotCard\\.copyEn|character\\.collapsedHint|expand|collapse|copyZh|copyEn|collapsedHint" src tests docs --glob '!src/i18n/zh.ts' --glob '!src/i18n/en.ts'
```

Findings:

- No `src/` or `tests/` references to the five deleted full keys.
- `src/components/ShotCard.tsx` still references only retained sibling aria keys.
- `src/components/CollapsiblePanel.tsx` uses `collapsible.expandAria` and `collapsible.collapseAria`, not `common.expand` or `common.collapse`.
- Historical design docs mention `shotCard.copyZh` / `shotCard.copyEn`; these are not runtime references.

Post-delete checks:

- `zh.ts` and `en.ts` key sets must remain identical.
- `npm run lint`
- `npm run test`
- `npm run test:coverage`
- `npm run build`
- `npm run check:bundle`

## Rollback

Revert this cleanup commit or restore the five deleted keys in both `src/i18n/zh.ts` and `src/i18n/en.ts` with their prior translations. No data migration is required because only unused static locale entries are removed.
