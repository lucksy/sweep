---
plan: sweep
created: 2026-10-13
---

# Tasks: sweep

Paths are relative to the project root, `~/Projects/clear` (no rename). sweep stores no data: no task may add a cache, history, lock or log file, or use `$.store`. Unless a task says otherwise, every task is verified with:
- `node --test "tests/**/*.test.mjs"`
- `claude plugin validate --strict .`
- for tasks that touch `hooks/` or `charts/`: `npx -p typescript tsc -p .` and `claude plugin test .`

## Task 1: Scaffold sweep from clearx and add the sandbox test harness
**Status:** done · started 2026-10-13 · done 2026-10-13

**Description:** In this folder, create the sweep plugin from clearx without changing behavior:
- move `clearx/scripts/clearx.mjs` to `engine/sweep.mjs`
- write the manifest and marketplace with the name `sweep`
- add `bin/sweep`
- add `skills/` copied with new names (content updated in T13)

Then turn the clearx sandbox script into `tests/fixtures/sandbox.mjs`, with the first integration test reproducing the clearx sandbox run. Leave `clearx/` in place until T23.

**Acceptance criteria:**
- [x] `bin/sweep scan` prints the same categories and numbers as `clearx list` on this machine
- [x] `tests/fixtures/sandbox.mjs` builds the fixture (dirty, unique-commit, clean and orphan worktrees; merged and unique branches; memory; protected files), and `tests/engine/sandbox.test.mjs` asserts what clean keeps and removes
- [x] `claude plugin validate --strict .` passes for `sweep`

**Verification:**
- [x] `node --test "tests/**/*.test.mjs"`
- [x] `bin/sweep scan` vs `clearx/bin/clearx list` (diff of category rows)

**Dependencies:** None

**Files likely touched:** `.claude-plugin/plugin.json`, `.claude-plugin/marketplace.json`, `engine/sweep.mjs`, `bin/sweep`, `tests/fixtures/sandbox.mjs`, `tests/engine/sandbox.test.mjs`

**Estimated scope:** M

**Notes:** Built in `~/Projects/clear` (no rename). `sweep scan` and `clearx list` category rows are identical on this machine (2026-10-13). `node --test tests/` needs a glob on Node 22, so docs now say `node --test "tests/**/*.test.mjs"`.

## Task 2: Mod spike: `/sweep` shows the engine's total in a pane
**Status:** in progress · started 2026-10-13

**Description:** The thinnest vertical slice through the riskiest part:
- a mod that registers `/sweep`
- runs `engine/sweep.mjs scan --json` through `$.process.run` (the clearx JSON for now)
- opens a pane showing `X reclaimable · scanned at …`

While doing it, answer Q1–Q3 from `claude-code.d.ts` and a quick experiment, and record the answers in `tasks/plan.md`.

**Acceptance criteria:**
- [x] `/sweep` in `claude --plugin-dir .` opens a pane with the real reclaimable total
- [x] Q1, Q2, Q3 answered in `tasks/plan.md`, with the API names to use
- [x] One `hooks/*.test.ts` covers the command and the pane render

**Verification:**
- [x] `claude plugin test .` and `npx -p typescript tsc -p .`
- [ ] Manual: `/sweep` in this terminal (deferred to Checkpoint D: needs an interactive session with `claude --plugin-dir ~/Projects/clear`)

**Dependencies:** T1

**Files likely touched:** `hooks/hooks.json`, `hooks/register.tsx`, `hooks/engine-client.ts`, `types/index.d.ts`, `hooks/pane.test.ts`

**Estimated scope:** M

**Notes:** Tests live in `tests/mod/` (spike, shared `world.ts`). The engine still prints the clearx JSON shape until T4.

## Checkpoint A: Foundation
- [ ] All tests pass and validate is clean
- [ ] `/sweep` shows a real number in a pane
- [ ] Q1–Q3 answered; human review before Phase 1

## Task 3: Guard rails as their own module, with tests that try to break them
**Status:** done · started 2026-10-13 · done 2026-10-13

**Description:** Extract `rm()` into `engine/guard.mjs`, with the allowlist and protected paths of SPEC-engine §Behavior 5. Add a table-driven test that tries every protected path, paths outside the allowlist, `..` traversal, symlinks pointing out of the allowlist, and `~/.claude.json` itself.

**Acceptance criteria:**
- [x] Every protected path and every outside path is refused, with a clear error
- [x] A symlink inside `~/.claude` pointing at `~/Documents` is removed as a link, and its target is untouched
- [x] Allowed paths are removed

**Verification:**
- [x] `node --test "tests/engine/*.test.mjs"guard.test.mjs`

**Dependencies:** T1

**Files likely touched:** `engine/guard.mjs`, `engine/sweep.mjs`, `tests/engine/guard.test.mjs`

**Estimated scope:** S

**Notes:** The guard also resolves parent-folder symlinks, so a folder inside ~/.claude that links to ~/Documents can't be used to delete outside (a gap in the clearx prototype).

## Task 4: JSON contract schema 1: categories in files, reason codes, stable item ids
**Status:** done · started 2026-10-13 · done 2026-10-13

**Description:** Split the engine per SPEC.md Project Structure:
- `scan.mjs`, `git.mjs`, `live.mjs`, `fsx.mjs`
- one file per category in `engine/categories/`

Make `scan --json` emit the schema-1 contract (SPEC-engine §Contract). Add `reason` codes to every kept item, plus stable `id`, `label`, `project` and `detail`. This is a mostly mechanical move; behavior is unchanged except for the new fields.

**Acceptance criteria:**
- [x] A contract test checks every key and type of `scan --json` against the fixture
- [x] Every kept row of the SPEC-engine category table returns its reason code in the sandbox
- [x] Item ids are identical across two scans of an unchanged fixture

**Verification:**
- [x] `node --test "tests/engine/*.test.mjs"`

**Dependencies:** T3

**Files likely touched:** `engine/scan.mjs`, `engine/git.mjs`, `engine/live.mjs`, `engine/fsx.mjs`, `engine/categories/*.mjs` (13 small files, moved verbatim), `tests/engine/contract.test.mjs`

**Estimated scope:** L (mechanical; if it runs long, split into T4 "infra modules" and a new task "category files")

**Notes:** Items kept for a running session (temp folders, transcripts, checkpoints, the running CLI's bundled skills) are now listed with their reason instead of skipped; on this machine tmp-sessions shows 93/101 where clearx showed 93/93. Category scans are async so T6 can size in parallel. git worktree removal is checked by the guard first (ctx.check).

## Task 5: Footprint, disk, per-project rollup, age buckets, warnings
**Status:** done · started 2026-10-13 · done 2026-10-13

**Description:** Add the contract fields `footprint`, `disk`, `projects`, `ageBuckets` and `warnings`: `runaway-output`, `low-disk`, `sweep-paused` and `many-worktrees` (SPEC-engine §Footprint, §Contract).

**Acceptance criteria:**
- [x] Footprint parts sum to `totalBytes` in the fixture
- [x] Each warning has a fixture case that produces it and one that doesn't
- [x] Projects roll up per category, and `exists: false` is set for a deleted path

**Verification:**
- [x] `node --test "tests/engine/*.test.mjs"footprint.test.mjs`

**Dependencies:** T4

**Files likely touched:** `engine/footprint.mjs`, `engine/scan.mjs`, `tests/engine/footprint.test.mjs`, `tests/fixtures/sandbox.mjs`

**Estimated scope:** M

**Notes:** Real machine: footprint 7.42G (worktrees 2.75G, plugins 2.08G, transcripts 1.37G), disk 1.1T free, no warnings. The extra measuring pushed a full scan to 93 s; T6 brings it down.

## Task 6: Scan speed: async sizes, memoized, ≤ 15 s
**Status:** done · started 2026-10-13 · done 2026-10-13

**Description:**
- Replace the synchronous `du` calls with an async pool (concurrency 8), memoized per path.
- Run git calls per repo in parallel.
- Record `durationMs`.

Measure on this machine: baseline 28–43 s, target ≤ 15 s.

**Acceptance criteria:**
- [x] Same contract output on the fixture as before (byte-identical apart from `durationMs` and `scannedAt`)
- [x] Three real-machine runs at ≤ 15 s each, with the timings recorded in this task

**Verification:**
- [x] `node --test "tests/engine/*.test.mjs"`
- [x] `time bin/sweep scan --json > /dev/null` ×3

**Dependencies:** T5

**Files likely touched:** `engine/fsx.mjs`, `engine/git.mjs`, `engine/scan.mjs`

**Estimated scope:** S

**Notes:** Real-machine full scan (2026-10-13): 11.77 s, 10.97 s, 11.35 s (baseline 28–43 s for clearx; 56–93 s after T5). What did it: one du pass per tree (each worktree on its own) started before anything else; sizes wait only for the pass that covers them; git calls async, eight at a time, one rev-parse per project; categories in parallel; runaway-output search limited to 5 levels and run alongside. Fixture output is identical to T5.

## Task 7: Clean v2: `--only`, re-scan before delete, JSON result, progress, no files written
**Status:** done · started 2026-10-13 · done 2026-10-13

**Description:**
- `clean()` per SPEC-engine §Behavior 2–4: item selection with `--only`, re-scan before deleting, `skipped` with `no-longer-cleanable` / `unknown-id`, and the clean contract JSON. No lock file.
- NDJSON `--progress` on stderr for both scan and clean.
- The "stores nothing" test (§Behavior 7).

**Acceptance criteria:**
- [x] `--only` deletes exactly the named items; an item made dirty after the scan lands in `skipped`
- [x] Two `clean --yes` started together on one fixture both finish, removing each item once
- [x] Scan and clean create no new files (sandbox listing before and after)
- [x] `--progress` writes only NDJSON to stderr, and stdout stays pure JSON

**Verification:**
- [x] `node --test "tests/engine/*.test.mjs"clean.test.mjs`

**Dependencies:** T4

**Files likely touched:** `engine/clean.mjs`, `engine/scan.mjs`, `tests/engine/clean.test.mjs`

**Estimated scope:** M

**Notes:** Two cleans at once: both finish; an item the other already removed is reported as skipped 'already-gone' (or failed for git), so 'removed exactly once' holds for the end state, which matches a single clean. Real-machine dry run of 'clean safe': would free 599M (153 items), nothing deleted.

## Checkpoint B: Engine
- [ ] Sandbox suite proves every kept reason, the guard, `--only`, concurrent cleans, no files written and `--force` limits
- [ ] Real-machine scan ≤ 15 s (T6 timings)
- [ ] Human review of the contract before the UI is built on it

## Task 8: CLI text report, exit codes, aliases
**Status:** done · started 2026-10-13 · done 2026-10-13

**Description:** `engine/text.mjs` and argument handling per SPEC-cli:
- the header (footprint, reclaimable, disk free)
- the footprint line
- warnings first
- kept items grouped by reason
- middle-truncated paths, width from the terminal
- every alias and exit code

**Acceptance criteria:**
- [x] Snapshot tests of `scan`, `scan --details`, `explain`, `clean` (dry run) and `clean --yes` with `NO_COLOR=1` at 100 columns
- [x] Every exit code (0–3) produced by a test
- [x] `--json` output equals the engine result, with nothing else on stdout

**Verification:**
- [x] `node --test "tests/cli/*.test.mjs"`

**Dependencies:** T5, T7

**Files likely touched:** `engine/text.mjs`, `engine/sweep.mjs`, `tests/cli/text.test.mjs`, `tests/cli/exit.test.mjs`

**Estimated scope:** M

**Notes:** Rendering lives in engine/text.mjs as pure functions with snapshot tests (tests/cli/snapshots); exit code 3 is 'unsupported platform' (engine/platform.mjs), tested as a unit since this machine is macOS. Snapshots were reviewed by eye.

## Task 9: History (removed)
**Status:** blocked

Removed 2026-10-13: sweep stores no data (SPEC-history.md). Kept as a number only, so task ids stay stable; nothing to build.

## Task 10: Charts base: palette, Raster packing, sparkline, bar list
**Status:** done · started 2026-10-13 · done 2026-10-13

**Description:**
- `charts/palette.ts`
- `charts/raster.ts` (cell grid → base64 u32 triplets; copy the approach from agent-skills-mods `chart.ts`)
- `charts/sparkline.ts`
- `charts/bars.ts` (SPEC-charts §3 and §6), each returning `legend` and `alt`

**Acceptance criteria:**
- [x] Decoded `cells` length is `columns*rows*3`, and every code point is printable and one column wide
- [x] Bars share one scale; kept tails are drawn grey; `alt` names the top three values with units
- [x] Palette colors pass ≥ 3:1 contrast on dark and light backgrounds

**Verification:**
- [x] `claude plugin test .` and `npx -p typescript tsc -p .`

**Dependencies:** T1

**Files likely touched:** `charts/palette.ts`, `charts/raster.ts`, `charts/sparkline.ts`, `charts/bars.ts`, `tests/charts/base.test.ts`

**Estimated scope:** M

**Notes:** No sparkline (removed with history). Palette changed from SPEC-charts' suggestion: amber #fab219 fails 3:1 on white, so caution is #c47f00 and every chart color is chosen to pass on both backgrounds (tested). Text a chart draws is sanitized to one-column characters so a project name can never get a Raster refused.

## Task 11: Charts: footprint stacked bar and treemap with hit boxes
**Status:** done · started 2026-10-13 · done 2026-10-13

**Description:** `charts/stacked.ts` (SPEC-charts §1, eighth-block precision, reclaimable underline row) and `charts/treemap.ts` (§2, squarified, labels, `+N more`, `hit` boxes).

**Acceptance criteria:**
- [x] Stacked segments sum to the width ± 1 eighth-cell, and parts ≥ 1% are always visible
- [x] Treemap tile areas are proportional within 1 cell, and every id has a tile or is in `+N more`
- [x] Snapshot tests of decoded cells for fixed inputs

**Verification:**
- [x] `claude plugin test .`

**Dependencies:** T10

**Files likely touched:** `charts/stacked.ts`, `charts/treemap.ts`, `tests/charts/stacked.test.ts`, `tests/charts/treemap.test.ts`

**Estimated scope:** M

**Notes:** Treemap tiles are colored backgrounds (neighbours of one color alternate a shade darker) rather than box-drawing borders; text on a tile is black or white, whichever contrasts more. The legend is passed in by the caller (it knows what the colors mean).

## Task 12: Charts: age histogram, PNG pixels
**Status:** done · started 2026-10-13 · done 2026-10-13

**Description:**
- `charts/histogram.ts`: age buckets stacked by risk.
- `charts/png.ts`: copy `encodePng` and `zlib` from agent-skills-mods `pixels.ts`. Pixel variants of the treemap and stacked bar.

**Acceptance criteria:**
- [x] `histogram` handles empty buckets and one non-empty bucket
- [x] PNG output passes the signature and IHDR check, and is ≤ 2 MiB at 120×30 cells
- [x] Each pixel chart has the same `legend` and `alt` as its cell twin

**Verification:**
- [x] `claude plugin test .`

**Dependencies:** T11

**Files likely touched:** `charts/histogram.ts`, `charts/png.ts`, `tests/charts/histogram.test.ts`, `tests/charts/png.test.ts`

**Estimated scope:** M

**Notes:** No trend chart (removed with history). The pixel treemap carries no words in the picture, so its legend names every tile with its size in the tile's color (the cell twin's legend is passed in by the caller); alt and hit boxes are the twin's. charts/png.ts is copied from agent-skills-mods (MIT, the author's own).

## Task 13: Skills: `/sweep:scan`, `/sweep:clean`, `/sweep:explain`
**Status:** in progress · started 2026-10-13 · step commit

**Description:** Rewrite the three SKILL.md files per SPEC-skills:
- the new engine path
- the dry run → AskUserQuestion → `--yes` rule
- caution wording
- a pointer to the `/sweep` pane

Remove the old `skills/list` and `skills/clearx`.

**Acceptance criteria:**
- [x] `claude -p --plugin-dir .` lists exactly the three skills
- [x] In a sandboxed session, declining the confirmation deletes nothing (a second scan shows the same items)
- [x] No skill text names `rm` or a git delete command

**Verification:**
- [x] `claude plugin validate --strict .`
- [x] Manual: `/sweep:clean safe` with the sandbox env

**Dependencies:** T8

**Files likely touched:** `skills/scan/SKILL.md`, `skills/clean/SKILL.md`, `skills/explain/SKILL.md`

**Estimated scope:** S

**Notes:** The 'declining deletes nothing' check needs an interactive session to answer AskUserQuestion; it is covered structurally (tests/engine/skills.test.mjs: dry run before the question, --yes only after) and left as a manual check for Checkpoint C. The old list/clearx skills were already replaced in T1.

**Checked 2026-10-13:** `claude -p "/sweep:clean safe" --plugin-dir .` against a sandbox (SWEEP_HOME/SWEEP_CLAUDE_DIR/SWEEP_TMPDIR; the env was first proven to reach Claude's Bash). Turn 1 ran only the dry run (headless, so no question was shown) and stopped. Turn 2, resumed with "No, don't delete anything.", made no tool calls. All 167 sandbox paths were unchanged after both.

## Checkpoint C: Everything except the UI
- [ ] `sweep scan`, `sweep clean safe` (dry run) work in a terminal
- [ ] `/sweep:clean safe` asks before deleting
- [ ] Human reviews chart snapshots (cells) and one pixel PNG

## Task 14: Pane Overview: cached and live scan, header, category table, layouts, text fallback
**Status:** in progress · started 2026-10-13

**Description:** Build on the T2 spike:
- `engine-client.ts` with `$.process.spawn`, NDJSON progress and the schema check
- state atoms per SPEC-pane
- Overview with the header, warnings and the category table (risk, size, items, toggles), plus Rescan
- wide and narrow layouts
- the text fallback when the pane isn't placed (< 110 columns)

**Acceptance criteria:**
- [x] With a scan already in this session's `$.state`, the first draw needs no engine call; with none, the progress view draws at once
- [x] No call to `$.store` or `$.fs.write` (spy test)
- [x] Progress state updates per category during a scan; a second request joins the running scan
- [x] Render tests at 200, 144 and 110 columns; below 110, `/sweep` answers with text

**Verification:**
- [x] `claude plugin test .` and `npx -p typescript tsc -p .`
- [ ] Manual: `/sweep` (Checkpoint D)

**Dependencies:** T2, T7

**Files likely touched:** `hooks/engine-client.ts`, `hooks/pane/overview.tsx`, `hooks/pane/layout.ts`, `types/index.d.ts`, `hooks/pane.test.ts`

**Estimated scope:** M

**Notes:** Views are pure functions in hooks/pane/ that receive the surface's elements, the data and callbacks; register.tsx makes every $ call. The scan streams through $.process.spawn with NDJSON progress; a second request joins the one in flight; a scan in this session younger than 10 minutes is reused. The manual /sweep check moves to Checkpoint D.

## Task 15: Pane charts: footprint bar, treemap, bars; cells or pixels
**Status:** in progress · started 2026-10-13

**Description:** Place the stacked bar, treemap and category bars in Overview:
- `Raster` for cells, `Image` for pixels, chosen by `chartStyle` (and Q2's terminal detection)
- text equivalents on surfaces without `Raster`

**Acceptance criteria:**
- [x] `chartStyle: cells` draws Rasters and `pixels` draws Images with the chart's `alt`
- [x] A non-terminal surface render draws the legend and alt as `Text` (test with `e.surface = 'desktop'`)
- [x] Charts resize with the viewport, never wider than the pane

**Verification:**
- [x] `claude plugin test .`
- [ ] Manual: Ghostty (pixels) and Terminal.app (cells) (Checkpoint D)

**Dependencies:** T11, T14

**Files likely touched:** `hooks/pane/charts.tsx`, `hooks/pane/overview.tsx`, `.claude-plugin/plugin.json` (userConfig), `hooks/pane.test.ts`

**Estimated scope:** S

**Notes:** Every surface's element table names every element (the missing ones draw nothing), so the pane decides Raster/Image by e.surface === 'terminal'. Text takes no key, so keyed fallbacks are Boxes. Overview shows the footprint bar and the reclaimable treemap; the category bar list is used by the Projects view (T18). Manual Ghostty / Terminal.app check is at Checkpoint D.

## Task 16: Pane clean flow: select, dry run, confirm, progress, done
**Status:** done · started 2026-10-13 · done 2026-10-13

**Description:** The state machine of SPEC-pane §Clean flow:
- Select safe, toggles, Dry run, Clean…
- the confirm step with caution lines and a separate `y` hotkey
- the cleaning progress line
- the done summary and auto-rescan
- the locked (exit 3) and partial-failure (exit 1) states
- review categories and kept items can't be selected

**Acceptance criteria:**
- [x] A test per transition in the diagram, including cancel, locked and partial failure
- [x] No single key deletes: Clean's and Confirm's hotkeys differ, and Confirm exists only in `confirm`
- [x] The engine is called with `--via pane` and with the exact selection as `--only` when items were unticked

**Verification:**
- [x] `claude plugin test .`

**Dependencies:** T15

**Files likely touched:** `hooks/pane/clean-flow.ts`, `hooks/pane/overview.tsx`, `hooks/engine-client.ts`, `hooks/clean-flow.test.ts`

**Estimated scope:** M

**Notes:** Changes from SPEC-pane: Cancel is hotkey n (a Button hotkey is one digit or letter, so Esc can't be one); Dry run and Clean… were one step (both lead to the confirm screen), so there is one Clean… button on c; the 'locked' state is gone with the lock file. The Delete step passes --only with exactly the ids the dry run showed.

## Task 17: Category drill-down: texts, items, per-item selection, age histogram
**Status:** done · started 2026-10-13 · done 2026-10-13

**Description:** The drill-down view (SPEC-pane): the creates / claude / sweep texts as `Markdown`, the item list with reasons, per-item toggles feeding `selectedItems`, the age histogram, and Back.

**Acceptance criteria:**
- [x] Kept items show their reason and can't be ticked
- [x] Unticking an item changes the Clean total and the `--only` list
- [x] The histogram matches the category's age buckets

**Verification:**
- [x] `claude plugin test .`

**Dependencies:** T12, T16

**Files likely touched:** `hooks/pane/category.tsx`, `hooks/pane/overview.tsx`, `hooks/category.test.ts`

**Estimated scope:** M

**Notes:** Ticking items: an unticked category starts with every item [ ]; a tick picks that item only; ticking all of a category's cleanable items turns it back into a whole-category selection. A whole-category tick in the overview now also drops any item list left from the drill-down.

## Task 18: Projects view
**Status:** done · started 2026-10-13 · done 2026-10-13

**Description:** The Projects tab: a bar list of the top 15 projects by reclaimable bytes, with `(gone)` marks. Pressing a row filters Overview to that project's items. Tabs `1`–`2` switch views.

**Acceptance criteria:**
- [x] The project filter turns into `--only` with that project's items
- [x] Renders 0, 1 and 15+ projects
- [x] Tabs switch views and keep the selection

**Verification:**
- [x] `claude plugin test .`

**Dependencies:** T11, T14

**Files likely touched:** `hooks/pane/projects.tsx`, `hooks/views.test.ts`

**Estimated scope:** S

**Notes:** Picking a project selects exactly its cleanable items (review categories excluded) and returns to the overview with a 'Selected: the items of …' line and Clear (x); a whole-category tick, Select safe or a finished clean ends the filter. Tabs are Buttons on 1 and 2.

## Task 19: `/sweep` arguments: scan, clean, explain, text
**Status:** done · started 2026-10-13 · done 2026-10-13

**Description:** Route `/sweep scan | clean <ids> | explain <id> | text …` per SPEC-pane §Entry points, with the one-line command outputs.

**Acceptance criteria:**
- [x] Each argument form opens the right view and state (`clean` lands on confirm with those categories ticked)
- [x] An unknown category answers with the list of ids
- [x] `text` answers with the CLI text and opens no pane

**Verification:**
- [x] `claude plugin test .`

**Dependencies:** T16, T17

**Files likely touched:** `hooks/register.tsx`, `hooks/pane/command.ts`, `hooks/command.test.ts`

**Estimated scope:** S

**Notes:** /sweep clean <review id> answers that it needs --force in chat; /sweep clean and explain stop at the text report when the pane can't be placed.

## Checkpoint D: Pane
- [ ] Manual checklist from SPEC-pane: Ghostty and Terminal.app, 110 / 144 / 200 columns, mouse and keys
- [ ] With your go-ahead: clean the idle Tree-Testing worktrees from the pane (SPEC.md success criterion 3)
- [ ] Human review

## Task 20: Status line entry and background scan, once per session
**Status:** done · started 2026-10-13 · done 2026-10-13

**Description:**
- The background scan on `session.start`: once per session, a 60 s delay, read-only argv, a 5 min timeout, joining a running pane scan, the result in `$.state` shared with the pane.
- `$.ui.status` text per SPEC-alerts §2.
- The `backgroundScan` and `statusLine` settings.

**Acceptance criteria:**
- [x] On: exactly one spawn per session, 60 s after start. Off: none
- [x] Every spawn's argv contains `scan` and never `clean` (test asserts it)
- [x] Status text cases: none yet, normal, warning `⚠`, < 100 MB hidden, setting off hidden; no `$.store` use

**Verification:**
- [x] `claude plugin test .`

**Dependencies:** T2, T4

**Files likely touched:** `hooks/alerts/background.ts`, `hooks/alerts/status.ts`, `hooks/register.tsx`, `hooks/alerts.test.ts`

**Estimated scope:** M

**Notes:** The background scan runs through the same rescan() the pane uses, so a pane scan in flight is joined, and its result is the pane's. A hot reload of the mod is a fresh module and schedules one more background scan; nothing is persisted to prevent that (sweep stores nothing).

## Task 21: Band above the prompt: conditions, hide, return
**Status:** done · started 2026-10-13 · done 2026-10-13

**Description:** An `AbovePrompt` render per SPEC-alerts §3:
- the five conditions, most severe first
- Open and Hide (for the rest of the session, in `$.state`)
- return when a more severe condition appears
- silence during `hasSurvey`
- the `bandThresholdGB` setting (type per Q1)

**Acceptance criteria:**
- [x] One test per condition, plus a precedence test
- [x] Hide holds for the session, and the band returns only for a more severe condition
- [x] The band draws nothing while `hasSurvey` is set

**Verification:**
- [x] `claude plugin test .`

**Dependencies:** T20

**Files likely touched:** `hooks/alerts/band.tsx`, `hooks/register.tsx`, `.claude-plugin/plugin.json`, `hooks/band.test.ts`

**Estimated scope:** M

**Notes:** Severity order: runaway output, low disk, cleanup paused, reclaimable over the threshold, many worktrees (SPEC-alerts lists the threshold first in its table but asks for the most severe). Open is o, Hide is h. bandThresholdGB is a number setting (Q1).

## Task 22: Toasts: clean finished (pane and skill), runaway output
**Status:** done · started 2026-10-13 · done 2026-10-13

**Description:** Toasts per SPEC-alerts §4:
- a pane clean toasts its own result
- a skill clean is caught by a `tool.call` hook on `Bash` whose command runs the engine with `clean --yes --json`: after `next(e)`, parse the clean JSON and toast `freedBytes`
- runaway output toasts once per path per session

**Acceptance criteria:**
- [x] A Bash call running `engine/sweep.mjs clean safe --yes --json` produces exactly one toast with the freed size; other Bash calls produce none
- [x] A runaway-output path toasts once per session

**Verification:**
- [x] `claude plugin test .`

**Dependencies:** T16, T20

**Files likely touched:** `hooks/alerts/toasts.ts`, `hooks/register.tsx`, `hooks/toasts.test.ts`

**Estimated scope:** S

**Notes:** The Bash hook on tool.call only reads the result after next(e) and has a .catch that replays the settled result, so it can never deny, change or re-run a tool call. A skill clean also adds to 'freed this session'.

## Task 23: README, clearx retirement, full verification
**Status:** in progress · started 2026-10-13

**Description:**
- README: install, `/sweep`, skills, CLI, categories, safety, settings, prevention tips, uninstalling clearx (Q4).
- Delete `clearx/` once its behavior is covered by sweep's tests.
- Run every SPEC.md success criterion and record the evidence.

**Acceptance criteria:**
- [ ] Each of the 9 SPEC.md success criteria has recorded evidence (output, timing or screenshot note) (SC1 manual look and SC3 real clean wait for Checkpoint D)
- [x] `clearx/` removed, with no reference to it left except the README's uninstall note
- [x] Clean install from the local marketplace works in a fresh session

**Verification:**
- [x] `node --test "tests/**/*.test.mjs"`, `claude plugin test .`, `claude plugin validate --strict .`, `npx -p typescript tsc -p .`
- [x] `claude plugin marketplace add ~/Projects/clear && claude plugin install sweep@sweep`, then `/sweep`

**Dependencies:** T13, T19, T22

**Files likely touched:** `README.md`, `clearx/` (deleted)

**Estimated scope:** S

**Notes:** Evidence, 2026-10-13. SC1: cold full scans 11.8/11.0/11.4 s (T6), warm 3.3 s; the pane draws a session's scan without the engine and shows live progress otherwise (tests/mod/pane.test.ts) — manual look pending (Checkpoint D). SC2: one contract feeds pane, CLI, skills and status line (types/index.d.ts, contract.test.mjs). SC3: needs the real clean at Checkpoint D. SC4: sandbox.test.mjs, reasons.test.mjs, clean.test.mjs. SC5: band.test.ts. SC6: toasts.test.ts. SC7: node --test 40/40, claude plugin test 77/77, validate --strict passed, tsc clean. SC8: charts-pane.test.ts (cells, pixels, desktop text). SC9: clean.test.mjs 'scan writes nothing, and clean only deletes', pane.test.ts and alerts.test.ts spy on $.store and $.fs.write. Install from the local marketplace verified in an isolated CLAUDE_CONFIG_DIR (sweep@sweep 0.2.0, read from this folder); your real config untouched. clearx/ removed (in git history; it was never installed).

## Checkpoint: Complete
- [ ] All SPEC.md success criteria met with evidence
- [ ] Human review and approval

## Task 24: Forgotten worktrees: search scan roots (#2)
**Status:** done · started 2026-10-13 · done 2026-10-13

**Description:** SPEC-engine §Additions: find `.claude/worktrees` under the scan roots (defaults, `--roots`, `SWEEP_ROOTS`), add those repos for this scan, and mark their items. The pane passes the `scanRoots` setting.

**Acceptance criteria:**
- [x] A sandbox repo with a Claude worktree that `~/.claude.json` does not list is found under a root, with the note `not in Claude's project list`; with `--roots ''` it is not
- [x] `node_modules` and `.git` are not descended into
- [x] A full real scan stays ≤ 15 s

**Verification:**
- [x] `node --test "tests/**/*.test.mjs"`, `claude plugin test .`, and a timed real scan

**Dependencies:** T7

**Files likely touched:** `engine/context.mjs`, `engine/git.mjs`, `engine/sweep.mjs`, `tests/engine/roots.test.mjs`, `hooks/register.tsx`

**Estimated scope:** S

**Notes:** Real machine: full scan 7.9–8.2 s with the search; 0 forgotten worktrees (every repo with Claude worktrees is known). Bug found and fixed on the way: on macOS's case-insensitive disk ~/Projects and ~/projects are one folder, so roots are resolved to their real spelling and deduplicated, and a repo is 'forgotten' only when none of its folders is known to Claude.

## Task 25: Move to Trash instead of deleting (#8)
**Status:** done · started 2026-10-13 · done 2026-10-13

**Description:** SPEC-engine and SPEC-pane §Additions: `clean --trash` in the engine (macOS `trash`, Linux `gio trash`, guard first, worktree record pruned); `mode` in the clean result; Move to Trash (`t`) on the pane's confirm step; the skill asks Delete / Trash / Cancel.

**Acceptance criteria:**
- [x] In the sandbox, `clean all --trash --yes` leaves the same survivors as a delete, and every removed path is gone from its place
- [x] An item the Trash refuses lands in `failed` and stays in place
- [x] Pane: the `t` button runs `--trash`, and the done line says the space returns when the Trash is emptied

**Verification:**
- [x] `node --test "tests/**/*.test.mjs"`, `claude plugin test .`

**Dependencies:** T7, T16

**Files likely touched:** `engine/trash.mjs`, `engine/clean.mjs`, `engine/categories/worktrees.mjs`, `engine/sweep.mjs`, `hooks/pane/clean.tsx`, `hooks/register.tsx`, `skills/clean/SKILL.md`

**Estimated scope:** M

**Notes:** Checked for real: /usr/bin/trash moved a scratch probe file (sweep-trash-probe.txt, now in your Trash). macOS hides ~/.Trash from the terminal (Operation not permitted), so the ~/.Trash fallback for macOS before 15 may be refused; such items land in failed and stay in place. Tests use SWEEP_TRASH_DIR so nothing reaches your real Trash. Bug found on the way: git keeps a trashed worktree's branch checked out until 'git worktree prune', so prune runs before the branch is deleted.

## Task 26: Item actions: reveal and copy path (#12)
**Status:** done · started 2026-10-13 · done 2026-10-13

**Description:** reveal and copy buttons on every item row in the category and project views.

**Acceptance criteria:**
- [x] reveal runs `open -R <path>` (macOS) or `xdg-open <dir>` (Linux); a branch item reveals its repo
- [x] copy calls `$.ui.copy` with the path and toasts

**Verification:**
- [x] `claude plugin test .`

**Dependencies:** T17, T18

**Files likely touched:** `hooks/pane/item-actions.tsx`, `hooks/pane/category.tsx`, `hooks/pane/project.tsx`, `hooks/register.tsx`, `tests/mod/actions.test.ts`

**Estimated scope:** S

**Notes:** reveal and copy are plain, dim buttons on every item row (kept items too), in the category and project views.

## Task 27: Ask Claude about a worktree (#10)
**Status:** done · started 2026-10-13 · done 2026-10-13

**Description:** an ask button on worktree items, and on branch items with unique commits, that submits a read-only review prompt to Claude.

**Acceptance criteria:**
- [x] The prompt names the path or branch, asks for status, log and diff stat, and says not to delete anything
- [x] It is submitted with `$.prompt.submit`, and a toast confirms it
- [x] There is no ask button on non-worktree items

**Verification:**
- [x] `claude plugin test .`

**Dependencies:** T26

**Files likely touched:** `hooks/pane/item-actions.tsx`, `hooks/register.tsx`, `tests/mod/actions.test.ts`

**Estimated scope:** S

**Notes:** The ask button sits on worktree items (kept ones too, where it helps most) and on worktree-* branches holding commits found on no other branch; orphan folders have none. The prompt is read-only and ends by asking whether the worktree is safe to remove with /sweep.
