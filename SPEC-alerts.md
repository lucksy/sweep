---
status: draft
created: 2026-10-13
module: alerts
---

# Spec: alerts

## Objective

Tell you about storage problems before the disk fills, without you running anything, and without nagging. There are four signals:
- a quiet background scan
- a status line entry
- a band above the prompt when things pass a threshold
- toasts for events (a clean finished, runaway output found)

sweep stores no data: every signal comes from a scan made in this session, and every "hide" lasts until the session ends. State lives in `$.state` (session memory) only, never in `$.store` or files.

## 1. Background scan

- **Trigger:** once per session on `session.start`, when `backgroundScan` is on. It waits 60 s (`$.clock`) so startup isn't slowed.
- **Run:** `$.process.spawn` of `sweep scan --json`, in a loop detached from the hook (see the `process.spawn` example in the types). The child is killed if the module unloads. Timeout: 5 min.
- **Shared result:** updates `$.state.sweep.scan` and `scannedAt` (shared with the pane, so `/sweep` opens with these numbers), then re-evaluates the band, status line and toasts.
- **Never cleans.** The background scan is read-only.
- **Skips** when a pane scan is already running in this session (it joins that one instead).

## 2. Status line entry

- Uses `$.ui.status(text)`, refreshed after every scan or clean in this session.
- **Text:** `sweep 3.5G` (reclaimable). When a warning is active: `sweep 3.5G ⚠`. Before the first scan of the session there is no entry.
- Hidden (`undefined`) when `statusLine` is off, or when reclaimable is < 100 MB and no warning is active.

## 3. Band above the prompt

- **Hook:** `ui.render` on `{ component: 'AbovePrompt' }`. It returns `next(e)` (draws nothing) unless the band is due. It always returns `next(e)` when `e.props.hasSurvey` is set.

**Due when any of these hold:**

| condition | text |
|---|---|
| reclaimable ≥ `bandThresholdGB` (default 5 GB) | `sweep: 6.2G reclaimable · 2.7G in idle agent worktrees  [Open] [Hide]` |
| warning `low-disk` | `sweep: disk 6% free · Claude Code can free 3.5G  [Open] [Hide]` |
| warning `runaway-output` | `sweep: a task output file is 6.0G  [Open] [Hide]` |
| warning `sweep-paused` | `sweep: Claude Code's own cleanup is paused (settings error) · see /status  [Hide]` |
| warning `many-worktrees` | `sweep: 14 agent worktrees in aihqlk  [Open] [Hide]` |

- **One line only.** The most severe condition wins.
- `[Open]` opens the pane (SPEC-pane).
- `[Hide]` hides that condition for the rest of the session (`$.state`). A hidden band comes back if a new, more severe condition appears.

## 4. Toasts (`$.ui.toast`)

| event | toast | how it is detected |
|---|---|---|
| clean finished in the pane | `sweep freed 2.7G` (`· 1 failed` when any failed) | the pane's clean result |
| clean finished through a skill | the same | a `tool.call` hook on `Bash` whose command runs `engine/sweep.mjs clean` with `--yes --json`: after `next(e)`, parse the clean JSON from the result |
| new `runaway-output` warning | `sweep: a task output file reached 6.0G — /sweep` | once per path per session |

A clean run from your own terminal (outside Claude Code) isn't seen. That is accepted, because nothing is stored to find it later.

## Acceptance Criteria

- [ ] With `backgroundScan` on, exactly one scan runs per session, 60 s after start; with it off, none.
- [ ] The background scan never calls `clean`; a test asserts the argv of every spawn.
- [ ] Status text for: no scan yet (none), normal, warning (`⚠`), below 100 MB (hidden), setting off (hidden).
- [ ] The band shows for each condition in the table, picks the most severe, hides for the session, returns for a more severe condition, and stays away while `hasSurvey` is set.
- [ ] A skill clean (`Bash` running the engine with `clean --yes --json`) produces exactly one toast with the freed size.
- [ ] Nothing is written with `$.store` or `$.fs.write` (a test spies on both).
