---
name: kimi-review
description: Run Kimi (Kimi Code CLI) as a final, read-only, second-opinion review gate on the current PR/branch, then triage and fix the findings. The PRIMARY external gate in AFK mode; default /afk may fall back to Codex, but /afk codex falls back to Claude and never Codex. Interchangeable with codex-review interactively when gate != implementer. Same role, different model. Scoped to architecture + real bugs. CTO review first, external gate last. Triggers include "/kimi-review", "run kimi review", "kimi gate".
preferred_model: claude-opus-4-7
role: external-reviewer
phase: pre-merge
---

# Kimi Review Gate

You are running the **Kimi review gate** — an independent second-opinion review by
the Kimi Code CLI (a *different* model), used as the **last** check before a PR is
handed back for approval. It is the **primary external gate in AFK mode** (with
variant-specific fallback if Kimi self-skips: default `/afk` may fall back to
[`codex-review`](../codex-review/SKILL.md), while `/afk codex` may fall back to
Claude only and **never Codex**). In interactive sessions it is interchangeable
with `codex-review` only when the chosen gate is not the implementation model —
the operator's choice, or whichever valid gate remains when one is out of
credits. Same role, same discipline — only the underlying model differs.

Run the CTO review (`cto-pr-review`) **first** and resolve its verdict, then run an
external gate on the result: **CTO first, external gate last.** Kimi reviews the
diff read-only; you (Claude) triage and fix.

The helper and prompt **ship with this repo** at
[`skill/kimi-review/kimi-gate.mjs`](kimi-gate.mjs) — the gate travels with the code.

## Activation

Triggered when the operator runs `/kimi-review`, or says "run the kimi review",
"kimi gate", etc. **In every `afk` waterfall this is the first external gate.**
Fallback is driver-specific: default `/afk` can fall back to Codex if Kimi
self-skips; `/afk codex` can fall back to Claude only, and records
`external gate unavailable` if neither Kimi nor Claude can run. In interactive
sessions it's optional (the operator's call) — also the natural pick when a valid
non-implementer gate is needed.

**Metered like Codex — keep invocations to an absolute minimum.** Batch all findings
into one fix pass, self-review, and only then re-run; defer documentation/minor items
to a single final pass. Never burn a round-trip on a small or doc-only edit.

**Scope:** the gate drives Kimi as a **structural code reviewer** — architecture/
design, correctness, security, safety, missed edge cases. Unlike Codex (built-in
`review` subcommand), Kimi is a general agentic CLI, so the helper passes a strict
READ-ONLY review prompt via `kimi -p` and lets Kimi run git itself to read the diff.
Treat what comes back as high-signal — but still verify each finding, prioritise
structural items over nitpicks, and do **not** chase exhaustive polish (see **When
to stop**).

## How to run it

1. Invoke the in-repo helper **in the background** (the review is slow — it reads the
   diff, traces code paths, may run tests). Capture stdout to a file, and pass any
   operator-provided target flag (`--base <branch>` / `--commit <sha>` /
   `--uncommitted`; default = current branch vs the repo's default branch):

   - **Windows (PowerShell):**
     `node "skill/kimi-review/kimi-gate.mjs" 1> "$env:TEMP\kimi_gate.out" 2> "$env:TEMP\kimi_gate.err"`
   - **macOS / Linux (zsh/bash):**
     `node "skill/kimi-review/kimi-gate.mjs" 1> "${TMPDIR:-/tmp}/kimi_gate.out" 2> "${TMPDIR:-/tmp}/kimi_gate.err"`

   Run it with `run_in_background: true` and a generous timeout (≥ 600000 ms). Do not
   poll in a sleep loop — wait for the completion notification.

2. When it completes, read the `.out` file. Kimi's verdict is between the
   `===== KIMI REVIEW (final message) =====` markers. The `.err` file holds the
   invocation line and the path to the full transcript log. **If the verdict is
   `SKIPPED: …`** — Kimi not installed, not logged in, or disabled via
   `KIMI_REVIEW_GATE=off` — the gate is intentionally optional: report that it was
   skipped and continue. Do not treat a skip as a failure and do not retry.

## How to handle the findings (batch — minimise calls)

Identical discipline to `codex-review`. The cost you are managing is the **number of
invocations**, not the size of each one. Never re-run for a single fix or a doc tweak.

1. **Sort findings by kind.** *Structural* (architecture, design, correctness bugs,
   security loopholes, missed edge cases) — act on these. *Minor* (naming, comments,
   cosmetics) — set aside in a deferred list; do NOT act yet.
2. **Verify before trusting.** Each finding is a hypothesis. Read the cited file:line
   — Kimi can misread context. Push back with evidence on anything you can disprove.
3. **Fix every confirmed structural finding in one batch**, and sweep for the same
   pattern elsewhere. Keep design/spec docs in sync in the same change.
4. **Run one additional self-review pass** over your fixes.
5. **Only then re-run this gate once.** Repeat 1–5 until the **stop rule** holds.
6. **Deferred-docs/minor pass — once, at the very end.** Do NOT re-run just to confirm.

## When to stop (convergence)

Stop and hand back to the operator when ANY holds:

- a round returns **no new P1 (blocker) findings** — only P2/minor or implementation-detail;
- you have done roughly **2–3 fix→re-run rounds** and findings are getting progressively
  finer, or narrowing to one already-addressed subsystem (you are reviewing your own
  last fix's wording);
- it is a **design-only doc** and the remainder is implementation-detail that TDD will
  enforce in code anyway.

Report honestly — `CLEAN` (nothing structural) vs `OUTSTANDING — loop stopped by
judgment` (with what's left) — and let the **operator** decide whether to spend more
metered rounds.

## Report back

End with a concise summary:

- **Kimi verdict:** (its final message, quoted)
- **Confirmed & fixed:** (each finding + the fix)
- **Disagreed:** (each finding you rejected + the evidence)
- **Gate status:** CLEAN / OUTSTANDING (and what remains)

Do not merge, push, or declare the PR ready on the strength of a clean pass alone —
hand it back to the operator for their own approval, per the project workflow.

## Relationship to codex-review

- **Same role** (independent external gate, last before approval) and **same output
  contract** (a marker block + per-finding triage), so the two are interchangeable.
- **AFK order:** CTO → **Kimi first**. Default `/afk` falls back to Codex if Kimi
  skips; `/afk codex` falls back to Claude only and never Codex. Run **one**
  external gate per round, not both — they are metered alternatives, not additive.
- **Interactive:** the operator picks one; if the chosen gate is out of credits, fall
  back to the other.

## Setup (per machine, once)

Kimi is optional and self-skipping. To make the gate live:
`npm i -g @moonshot-ai/kimi-code` then **`kimi login`** (device-code flow — OAuth or
API key from the Kimi platform). Needs Node + `git` on PATH. Disable permanently with
`KIMI_REVIEW_GATE=off`. The helper drives `kimi -p` headless with a read-only prompt.
