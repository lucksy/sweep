---
status: draft
created: 2026-10-13
module: pane
---

# Spec: pane

## Objective

`/sweep` opens a live pane in Claude Code. It presents a scan made now (sweep stores no data) and shows where Claude Code's storage is (charts), what is safe to remove and why, and lets you clean it with two presses, without leaving your session or asking Claude. It is a mod: the function hooks in `hooks/register.tsx`, drawn with `ui.render` on `{ component: 'Pane', requestId: 'sweep' }`.

## Entry points

| You do | Result |
|---|---|
| `/sweep` | Opens or focuses the pane on **Overview**. The command output is one line: `Sweep pane opened · 3.5G reclaimable (scanned 2 min ago)`, or `Sweep pane opened · scanning…` |
| `/sweep scan` | Opens the pane and starts a fresh scan |
| `/sweep clean <ids>` | Opens the pane with those categories ticked, on the confirm step (dry run shown) |
| `/sweep explain <id>` | Opens the pane on that category's drill-down |
| `/sweep text [scan\|explain <id>]` | No pane: the CLI text as the command output, for narrow terminals and other surfaces |
| The band's **Open** button (alerts) | Same as `/sweep` |

The mod registers `/sweep` in `session.start` with `$.command.register({ name: 'sweep', description: 'Open the sweep pane: what Claude Code stores and what you can free', argumentHint: '[scan | clean <ids> | explain <id> | text]' })` and answers it with a `command.run` hook.

If `$.ui.open` resolves `isPlaced: false` (terminal under 110 columns, or a surface without panes), the command answers with the text report instead and says: `Pane needs ≥ 110 columns; showing text.`

## Data flow

```
open ──► state.scan (this session's last scan, if any) ──draw──► pane
   │        ▲
   └─► engine-client.scan()  ── $.process.spawn(['node', <root>/engine/sweep.mjs, 'scan', '--json', '--progress'])
            │ stderr NDJSON ──► state.progress (redraw each category)
            │ stdout JSON   ──► state.scan, state.scannedAt
```

- **On open:** draw this session's last scan straight away if there is one (from the pane or the background scan); otherwise draw the progress view. Start a fresh scan if there is none, if it is older than 10 minutes, or right away for `/sweep scan`.
- **No storage:** nothing is written to files or `$.store`. `$.state` is session memory and is gone when the session ends.
- **One run at a time:** while a scan runs, a second request joins it and doesn't start another.
- **Contract check:** `engine-client.ts` parses and checks `schema === 1`. On a mismatch it shows: `sweep engine is newer/older than the pane; reinstall sweep.`

**State (`types/index.d.ts`, `interface PluginState { sweep: { … } }`):**

| key | type | what |
|---|---|---|
| `scan` | `ScanResult \| null` | this session's last contract result (or a summary, if Q3 rules out full) |
| `scannedAt` | `string \| null` | ISO time |
| `progress` | `{ index, total, id } \| null` | live scan or clean progress |
| `view` | `'overview' \| 'category' \| 'projects'` | current tab |
| `focusId` | `string \| null` | category id in drill-down |
| `selected` | `string[]` | ticked category ids |
| `selectedItems` | `Record<string, string[]>` | per-category item ids when you untick some items |
| `flow` | `'idle' \| 'dryrun' \| 'confirm' \| 'cleaning' \| 'done' \| 'error'` | clean state machine |
| `dry` | `CleanResult \| null` | dry-run result shown on confirm |
| `result` | `CleanResult \| null` | last clean result |
| `freedThisSession` | `number` | bytes freed by cleans in this session |

## Layout

The pane redraws from `e.viewport` (columns, rows). There are two layouts:
- **wide**: ≥ 144 columns, charts beside the table
- **narrow**: 110–143 columns, stacked

Header and footer are always shown.

### Overview (wide)

```
╭ Sweep ───────────────────────────────────────────────────────────────────────────────────────────────╮
│ Claude Code uses 9.1G · 3.5G reclaimable · disk 57G free (12%)        scanned 2 min ago  [r] Rescan │
│ ⚠ runaway task output: …/tasks/b1.output 6.0G                                                       │
│                                                                                                      │
│ Footprint                                                                                            │
│ ██████████████▋▓▓▓▓▓▓▓▓▓▓▓▓░░░░░░░░░░▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒██                                          │
│ worktrees 2.8G · tmp 1.6G · projects 1.4G · plugins 2.1G · cli 0.7G      ▀ = reclaimable             │
│                                                                                                      │
│ Reclaimable                                 │ Category              Risk     Size    Items         │
│ ┌──────────────────────┬────────┬──────┐    │ [x] worktrees         caution  2.7G    2/8   ›       │
│ │ worktrees            │ tmp    │plugin│    │ [x] tmp-sessions      safe     365M   98/98  ›       │
│ │ 2.7G                 │ 365M   │ 199M │    │ [ ] plugin-versions   caution  199M   47/56  ›       │
│ │                      ├────┬───┴──────┤    │ [x] old-cli           safe     238M    2/2   ›       │
│ │                      │cli │ +4 more  │    │ [x] config-backups    safe     794K    9/9   ›       │
│ └──────────────────────┴────┴──────────┘    │  …  8 more (0B)                                     │
│                                             │ review: plugin-orphan-data, marketplace-deps (--force│
│                                             │ in chat)                                            │
│                                                                                                      │
│ Selected: 4 categories · 3.3G      [s] Select safe   [d] Dry run   [c] Clean 3.3G…                  │
│ [1] Overview  [2] Projects     freed this session 0B          ↵ on a row: details · [q] close          │
╰──────────────────────────────────────────────────────────────────────────────────────────────────────╯
```

### Category drill-down (press `›` on a row, or `/sweep explain <id>`)

```
‹ Back   worktrees · Agent and workflow worktrees · caution            2.7G of 2.8G reclaimable
Where it comes from   Subagents with isolation "worktree", Workflow agents and --worktree …   (Markdown)
What Claude cleans    Removed when the agent finishes with no changes; the 30-day sweep …
What sweep removes    Clean, unlocked worktrees with nothing unsaved; their branch …

Items                                                        Age of this space
[x] 1.4G  Tree-Testing  agent-a7224a…  clean, nothing unsaved  23d   ▆  ▁  ▁  ▁  ▁
[x] 1.3G  Tree-Testing  agent-a5c603…  clean, nothing unsaved  23d   <1d 1-7 7-30 30-90 >90
[ ] 2.3M  agent-skills-mods  agent-a55e…  kept: made during a session still running here (--force)
 …
Kept 6 · reasons: created during a running session (6)
[c] Clean 2 items 2.7G…
```

- Items with `cleanable: false` show their reason and can't be ticked.
- Unticking items sets `selectedItems[id]`, which becomes `--only` on clean.

### Projects

A bar list (SPEC-charts §3) of the top 15 projects by reclaimable bytes, with a stacked split by category. `exists: false` projects are marked `(gone)`. Pressing a row filters Overview to that project (`--only` = its items).

## Clean flow (state machine)

```
idle ──[c] or Clean──► dryrun ──engine clean --json (no --yes)──► confirm
confirm ──[y] Confirm──► cleaning ──engine clean --yes --json --progress──► done
confirm ──[esc] Cancel──► idle
cleaning ──exit 1──► done (with failures listed)
done ──auto──► rescan ──► idle
```

**The confirm step shows:**
- the item count and bytes per category
- for each caution category, one plain line about what you lose:
  - `transcripts: those sessions can't be resumed`
  - `worktrees: agent checkouts are deleted; their commits are already on other branches`
- the button `[y] Delete 3.3G` (a different hotkey from Clean, so one keystroke can't do both)

**Other rules:**
- Review categories can't be selected in the pane. They show: "needs --force; ask in chat: /sweep:clean <id> --force".
- During cleaning, a progress line counts down the items (`removed 12/101 · 1.9G freed`).
- The pane takes no input except **Hide**; closing the pane doesn't stop the engine.
- **Done:** `Freed 3.3G · 101 removed · 6 kept · 0 failed`, plus the failed paths when there are any. Alerts shows the toast (SPEC-alerts).

## Keyboard

Every action is a `Button` with a `hotkey`, so it works by mouse (fullscreen terminal) or key:

| key | action |
|---|---|
| `1` `2` | Overview, Projects |
| `r` | Rescan |
| `s` | Select all safe |
| `space` / press `[ ]` | toggle a row |
| `↵` / `›` | drill down |
| `esc` / `‹` | back or cancel |
| `d` | Dry run |
| `c` | Clean… |
| `y` | Confirm delete (only on the confirm step) |
| `q` | close the pane |

## Charts and surfaces

- `chartStyle` userConfig: `auto` (pixels where `drawsPixels(env)`, cells elsewhere), `pixels`, `cells`.
- Pixels are drawn with `Image` (`alt` = the chart's alt); cells with `Raster`.
- On surfaces without `Raster`/`Image` (desktop, VS Code, mobile), charts are replaced by their legend and alt as `Text`, and the bar list draws in plain text blocks. A desktop `Svg` rendering is out of scope for v1.

## userConfig (`.claude-plugin/plugin.json`)

| key | type | default | what |
|---|---|---|---|
| `chartStyle` | string: `auto`/`pixels`/`cells` | `auto` | chart rendering |
| `backgroundScan` | boolean | `true` | alerts: scan on session start |
| `statusLine` | boolean | `true` | alerts: status line entry |
| `bandThresholdGB` | number (Q1) | `5` | alerts: band when reclaimable ≥ this |
| `transcriptDays` | number | `30` | engine age for transcripts and file-history |
| `tmpDays` | number | `1` | engine age for temp sessions |
| `leftoverDays` | number | `7` | engine age for session leftovers |

## Acceptance Criteria

- [ ] `/sweep` draws within 1 s: Overview from this session's scan, or the progress view, which updates per category.
- [ ] The wide and narrow layouts render at 200, 144 and 110 columns without clipping the header or footer (render tests with fixed viewports).
- [ ] Below 110 columns, `/sweep` answers with text and the "needs ≥ 110 columns" line.
- [ ] Clean flow: every transition in the diagram has a mod test, including partial failure (exit 1) and cancel.
- [ ] The Confirm hotkey differs from the Clean hotkey, and no single key deletes.
- [ ] Review categories and kept items can't be ticked.
- [ ] After a clean, the pane rescans, and the footer shows `freed this session`.
- [ ] The pane never calls `$.store` or `$.fs.write` (a test spies on both).
- [ ] Manual checklist: Ghostty (pixels), Terminal.app (cells), 110 / 144 / 200 columns, mouse and keyboard.
