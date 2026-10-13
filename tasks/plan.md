---
status: draft
created: 2026-10-13
---

# Implementation Plan: sweep

## Overview

Turn the clearx prototype into **sweep**, a Claude Code plugin with one Node engine, a `sweep` CLI, pure chart renderers, three skills, and a mod that adds a `/sweep` pane, a status line entry, a band above the prompt and toasts. The specs are `SPEC.md` (capability map) and `SPEC-<module>.md`. sweep stores no data: every chart is a presentation of a scan made now (user decision 2026-10-13; module `history` and T9 removed). Built in `~/Projects/clear`. Tasks follow the build order (engine → cli, charts → skills, pane, alerts) and front-load the riskiest unknown, the early-access mod API (T2).

## Architecture Decisions

- **One engine, one contract.** Only `engine/` reads sizes or deletes files. Everything else consumes `scan --json` / `clean --json` (schema 1). Why: identical numbers everywhere, one set of guard rails, and the mod has no Node anyway.
- **Mod runs the engine as a child process** (`$.process.spawn`, NDJSON progress on stderr). Why: the mod environment has no Node or fs access beyond `$`, and streaming progress keeps the pane live during the ~15 s scan.
- **Charts are pure data → data** (`{ columns, rows, cells | png, legend, alt }`). Why: testable with `node --test` without Claude Code; the pane only places them. Cell packing and the PNG encoder are copied from agent-skills-mods (the author's own MIT code), not imported.
- **No storage of any kind.** No cache, history, lock or log file, and no `$.store`. Within a session the last scan lives in `$.state` (memory). Why: user decision. Consequences: no charts over time; hides last for a session; skill cleans are toasted by reading the engine's JSON from the Bash tool result.
- **Keep clearx working until T23.** Why: a usable tool exists the whole time, and the sandbox tests prove the move changes no behavior.
- **Tests never touch the real HOME.** The sandbox fixture (from the clearx test script) is the first thing built (T1).

## Dependency Graph

```
T1 scaffold+sandbox ──► T2 mod spike (answers Q1–Q3)
        │
        ├─► T3 guard ─► T4 contract ─┬─► T5 footprint/warnings ─► T6 speed
        │                             └─► T7 clean v2 (only, progress)
        │                                        │
        │        ┌───────────────────────────────┐
        │        ▼                               ▼
        │   T8 cli text                     T13 skills
        │
        └─► T10 charts base ─► T11 bar/treemap ─► T12 hist/png

T14 pane overview (T2,T4,T7) ─► T15 pane charts (T11) ─► T16 clean flow (T7)
        ├─► T17 drill-down (T12) ├─► T18 projects view (T11) ├─► T19 /sweep args
T20 status+background scan (T2,T4) ─► T21 band ─► T22 toasts
T23 docs, clearx retirement, final verification (all)
```

## Task List

Details, acceptance criteria and verification for each task are in `tasks/todo.md`.

### Phase 0: Foundation and risk
- [ ] T1: Scaffold sweep from clearx and add the sandbox test harness
- [ ] T2: Mod spike: `/sweep` shows the engine's total in a pane (answers Q1–Q3)

### Checkpoint A: Foundation
- [ ] `node --test tests/` green; `claude plugin validate --strict .` passes; `/sweep` opens a pane with a real number; Q1–Q3 answered in this file

### Phase 1: Engine
- [ ] T3: Guard rails as their own module, with tests that try to break them
- [ ] T4: JSON contract schema 1: categories in files, reason codes, stable item ids
- [ ] T5: Footprint, disk, per-project rollup, age buckets, warnings
- [ ] T6: Scan speed: async sizes, memoized, ≤ 15 s
- [ ] T7: Clean v2: `--only`, re-scan before delete, JSON result, progress, no files written

### Checkpoint B: Engine
- [ ] Sandbox suite proves every kept reason; real-machine scan ≤ 15 s (3 runs, recorded); contract test green; human review

### Phase 2: CLI, charts, skills (parallel)
- [ ] T8: CLI text report, exit codes, aliases
- ~~T9: History~~ (removed: sweep stores no data)
- [ ] T10: Charts base: palette, Raster packing, sparkline, bar list
- [ ] T11: Charts: footprint stacked bar and treemap with hit boxes
- [ ] T12: Charts: age histogram, PNG pixels
- [ ] T13: Skills: `/sweep:scan`, `/sweep:clean`, `/sweep:explain`

### Checkpoint C: Everything except the UI
- [ ] `sweep scan`, `sweep clean safe` work in a terminal; `/sweep:clean safe` asks before deleting; chart snapshots reviewed by the human

### Phase 3: Pane
- [ ] T14: Pane Overview: cached and live scan, header, category table, layouts, text fallback
- [ ] T15: Pane charts: footprint bar, treemap, bars; cells or pixels
- [ ] T16: Pane clean flow: select, dry run, confirm, progress, done
- [ ] T17: Category drill-down: texts, items, per-item selection, age histogram
- [ ] T18: Projects view
- [ ] T19: `/sweep` arguments: scan, clean, explain, text

### Checkpoint D: Pane
- [ ] Manual checklist (SPEC-pane): Ghostty and Terminal.app, 110 / 144 / 200 columns, mouse and keys; idle Tree-Testing worktrees cleaned from the pane with the user's go-ahead

### Phase 4: Alerts
- [ ] T20: Status line entry and background scan, once per session
- [ ] T21: Band above the prompt: conditions, hide for the session
- [ ] T22: Toasts: clean finished (pane and skill), runaway output

### Phase 5: Finish
- [ ] T23: README, clearx retirement, full verification

### Checkpoint: Complete
- [ ] Every SPEC.md success criterion met with evidence; human review

## Parallelization

- After Checkpoint B: T8, T10–T12 and T13 are independent (separate files, shared contract frozen at T4).
- After Checkpoint C: T17, T18 and T19 can run in parallel once T14–T16 land. T20–T22 can run beside Phase 3 (different hook files), but both edit `hooks/register.tsx`. Keep wiring in `register.tsx` minimal and imports-only, so merges stay trivial.
- Must be sequential: T3 → T4 → T7 (guard and contract are what everything else trusts).

## Risks and Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| The mod API is early access and changes between CLI releases | High | T2 spike first; re-read `claude-code.d.ts` at each task; keep mod code thin over `engine-client.ts` |
| `userConfig` has no number type (Q1) | Low | String options (`"5"`, `"10"`, `"20"` GB) |
| `$.state` can't hold a full scan (Q3) | Med | Keep a summary in state; run `explain <id> --json` on drill-down |
| Pixel detection unavailable to the mod (Q2) | Low | `chartStyle` defaults to cells when unknown; the user sets `pixels` |
| Scan stays > 15 s on large machines | Med | T6 async sizing; the pane opens at once with live progress and reuses the session's last scan, so speed is not blocking |
| A deletion bug destroys user data | High | Guard module and break tests first (T3); re-scan before delete (T7); sandbox-only tests; real deletes only with the user's go-ahead at Checkpoint D |
| Cleaning plugin versions breaks a running session | Med | `.in_use` and age ≥ 1 d checks kept; the confirm step tells you to restart sessions |
| Two cleans at once with no lock file | Low | Re-scan before delete, idempotent deletes, git's own locks; a sandbox test runs two cleans together |

## Open Questions

- Q1 (T2, T21): Does `userConfig` accept `type: "number"`?
- Q2 (T2, T15): How does the mod read the terminal type (pixels)?
- Q3 (T2, T14): Is `$.state` big enough for a full scan with items?
- Q4 (T23): Uninstall clearx automatically, or leave it to you? Proposed: leave it, with README steps.
- Q5 (T1): Who renames `~/Projects/clear` → `~/Projects/sweep`?
  → A: No rename: develop in this folder · @user 2026-10-13
