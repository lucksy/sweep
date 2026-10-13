---
status: draft
created: 2026-10-13
---

# Spec: sweep

## Objective

**sweep** is a Claude Code plugin that shows, explains and cleans the disk space Claude Code uses and leaves behind. You see it through slash commands and a live mod pane with charts.

Claude Code writes a lot to disk that you never see. Its own sweep (`cleanupPeriodDays`, default 30 days) skips the biggest offenders:

- agent and workflow worktrees, each with its own `node_modules`
- superseded plugin versions
- runaway temp task output
- old CLI binaries
- transcripts of deleted projects

GitHub issues report 36 to 80 GB of orphaned worktrees (#58914, #63087) and 100 to 500 GB of temp task output (#26911, #31241). On the author's machine, a scan on 2026-10-13 found 3.5 GB reclaimable, 2.7 GB of it in two idle agent worktrees.

**Users:** developers who run Claude Code daily, especially with subagents, workflows and plugins, on a laptop disk.

**Success looks like:**
- You type `/sweep` and within a second see where Claude Code's storage is, what is safe to remove and why.
- You free it in two presses, and nothing you would miss is ever deleted.
- You find out about a problem (runaway output, a growing pile of worktrees) before your disk fills, not after.

**sweep stores no data.** Every number and chart is a presentation of a scan made now. Nothing is written between scans: no cache, history, log or lock file, and no cross-session store. While a session runs, the last scan is kept in session memory (`$.state`) and is gone when the session ends. (User decision, 2026-10-13.)

sweep replaces the working prototype **clearx** (`clearx/` in this folder). clearx's scanner, guard rails and 13 categories were tested in a sandbox and on this machine; they carry over as the engine.

## Capability map

The user approved this map on 2026-10-13, and removed `history` the same day (sweep stores no data). Module ids are stable; each module has its own spec.

| Module id | Responsibility | Depends on | Spec |
|---|---|---|---|
| engine | Scan and clean the 13 categories, guard rails, footprint, JSON contract | — | [SPEC-engine.md](SPEC-engine.md) |
| cli | `sweep` shell command: text and JSON output, flags, exit codes | engine | [SPEC-cli.md](SPEC-cli.md) |
| ~~history~~ | **Removed:** sweep stores no data | — | [SPEC-history.md](SPEC-history.md) |
| charts | Pure renderers: footprint bar, treemap, bar list, age histogram; Raster cells and PNG pixels | — | [SPEC-charts.md](SPEC-charts.md) |
| skills | `/sweep:scan`, `/sweep:clean`, `/sweep:explain`, for Claude to drive the CLI | cli | [SPEC-skills.md](SPEC-skills.md) |
| pane | The mod pane opened by `/sweep`: overview, category drill-down, projects, clean flow | engine, charts | [SPEC-pane.md](SPEC-pane.md) |
| alerts | Background scan on session start, status line entry, band above the prompt, toasts | engine | [SPEC-alerts.md](SPEC-alerts.md) |

```
engine ──► cli ──► skills
   │
   ├────────────────► pane ◄── charts
   └────────────────► alerts
```

**Build order:** engine → cli, charts (parallel) → skills, pane, alerts (parallel).

**The one boundary that matters.** Only the engine reads or deletes files. The mod modules (pane, alerts) have no Node: they run `node engine/sweep.mjs … --json` through `$.process.run` / `$.process.spawn` and draw what comes back. The skills run the same command through Claude's Bash tool. One engine and one JSON contract (SPEC-engine §Contract) means every surface shows the same numbers and goes through the same guard rails.

## Surfaces at a glance

| You do | You get | Module |
|---|---|---|
| `/sweep` | The sweep pane: a footprint bar, a treemap of what is reclaimable, a category table with toggles, and Clean | pane |
| `/sweep scan`, `/sweep clean safe`, `/sweep explain worktrees` | The same as text in the transcript (the mod command's output), for narrow terminals and other surfaces | pane |
| `/sweep:scan`, `/sweep:clean`, `/sweep:explain` | Claude runs the CLI, explains the result and asks before deleting | skills |
| `sweep scan` in a terminal | The text report; `--json` for scripts | cli |
| Nothing | Status line `sweep 3.5G` after the session's background scan; a band above the prompt when reclaimable space passes 5 GB or the disk is nearly full; `Freed 2.7G` toast after a clean | alerts |

Plugin commands are always namespaced (`/sweep:<skill>`). The mod registers a bare `/sweep` with `$.command.register`, which is why `/sweep` opens the pane.

## Tech Stack

| Part | Language and runtime | Dependencies |
|---|---|---|
| engine, cli | Node.js ESM (`.mjs`), Node ≥ 18 at run time; macOS and Linux | none at run time; uses `git`, `du`, `find`, `df` from the system |
| charts | TypeScript, pure (no Claude Code API, no Node API) | none |
| pane, alerts | TypeScript mod (`hooks/register.tsx`), the Claude Code function-hooks API (`claude-code` types, build 2.1.296+) | none |
| skills | SKILL.md files | — |
| dev | Node ≥ 22.18 (runs `.ts` tests natively), `tsc` via `npx -p typescript` | typescript as dev tool only (no `package.json` dependency) |

Windows is out of scope for v1. The engine refuses to run there with a clear message.

## Commands

```sh
# run
node engine/sweep.mjs scan --details          # or: bin/sweep scan --details
node engine/sweep.mjs clean safe              # dry run
node engine/sweep.mjs clean worktrees --yes   # delete

# test
node --test tests/                            # engine, cli, charts (node:test)
claude plugin test .                          # mod hooks: pane, alerts (hooks/*.test.ts)

# check
claude plugin validate --strict .             # manifest, skills, hooks module, state contract
npx -p typescript tsc -p .                    # type-check the mod and charts

# try it
claude --plugin-dir ~/Projects/clear          # one session with sweep loaded, hot reloading the mod
claude plugin marketplace add ~/Projects/clear && claude plugin install sweep@sweep
```

## Project Structure

The project folder is `~/Projects/clear`, and the plugin root is this folder (user decision 2026-10-13: no rename).

```
~/Projects/clear/
  SPEC.md, SPEC-<module>.md      → this map and one spec per module
  README.md                      → install, use, categories, safety
  .claude-plugin/
    plugin.json                  → name "sweep", userConfig, types contract
    marketplace.json             → local marketplace "sweep" (source "./")
  engine/                        → module: engine (zero-dependency Node ESM)
    sweep.mjs                    → entry: argument parsing → cli (module: cli)
    scan.mjs, clean.mjs          → scan(), clean() and the JSON contract
    categories/<id>.mjs          → one file per category
    guard.mjs                    → rm() allowlist and protected paths
    git.mjs, live.mjs, fsx.mjs   → git worktree logic, live sessions, sizes and ages
    footprint.mjs
    text.mjs                     → module: cli (text rendering)
  bin/sweep                      → shell shim
  skills/{scan,clean,explain}/SKILL.md   → module: skills
  charts/                        → module: charts (pure TypeScript)
    raster.ts, png.ts, stacked.ts, treemap.ts, bars.ts, histogram.ts, palette.ts
  hooks/
    hooks.json                   → { "modules": ["./register.tsx"] }
    register.tsx                 → mod entry: wires pane + alerts
    pane/*.tsx                   → module: pane
    alerts/*.ts                  → module: alerts
    engine-client.ts             → runs the engine from the mod, parses the contract
    *.test.ts                    → claude plugin test
  types/index.d.ts               → PluginState contract ($.state values)
  tests/
    fixtures/sandbox.mjs         → builds a fake HOME, ~/.claude, tmp and git repo
    engine/*.test.mjs, cli/*.test.mjs, charts/*.test.ts
```

## Code Style

Match the prototype (`clearx/scripts/clearx.mjs`):
- small pure functions
- 2-space indent, single quotes, no semicolon-free tricks
- `camelCase` functions, `kebab-case` category ids
- comments only where the code can't say why

Each category is one object with the same shape:

```js
// engine/categories/worktree-deps.mjs
export default {
  id: 'worktree-deps',
  title: 'node_modules inside worktrees that hold work',
  risk: 'safe',
  group: 'worktrees',
  creates: 'Agents install dependencies in their worktree. ...',
  claude: 'Never cleaned on its own: it goes only when the whole worktree goes.',
  sweep: 'Deletes untracked node_modules inside worktrees kept because they hold work.',
  scan: (ctx) => ctx.worktrees().filter(isKeptForWork).flatMap(findNodeModules),
  clean: (item, ctx) => ctx.rm(item.path),
}
```

Mod code follows the plugin-authoring examples:
- every hook is `($, e, next)`
- drawn values live in `atom`s declared in `types/index.d.ts`
- elements come from `$.ui.resolve(e)`
- charts receive plain data and return plain data (`{ columns, rows, cells, legend, alt }`), so they are tested without Claude Code.

User-facing text is plain and specific: "2 worktrees, 2.7G, nothing unsaved". It avoids vague words like "Optimize storage".

## Testing Strategy

| Level | What | Where | Runner |
|---|---|---|---|
| Unit | categories, guard, footprint, text rendering, chart renderers | `tests/<module>/*.test.*` | `node --test tests/` |
| Integration (sandbox) | full `scan` and `clean --yes` against a generated fake HOME, `~/.claude`, tmp root and git repo (dirty, unique-commit, clean and orphan worktrees; merged and unique branches; memory; protected files) | `tests/engine/sandbox.test.mjs` | `node --test` |
| Mod | pane render trees per state, clean state machine, band thresholds, status text, toast on clean events, no writes via `$.store` / `$.fs.write` | `hooks/*.test.ts` | `claude plugin test .` |
| Manual | `/sweep` in Ghostty or kitty (pixels) and in Terminal.app (cells), at 110, 144 and 200 columns | — | checklist in SPEC-pane |

Rules:
- Every guard rail has a test that tries to break it.
- Tests never touch the real HOME. Every engine test sets `HOME`, `CLAUDE_CONFIG_DIR` and `CLAUDE_CODE_TMPDIR` to a sandbox.
- Coverage target: every category has a test that finds an item and one that keeps an item. `clean` has tests for removed, kept and failed.

## Boundaries

- **Always:**
  - Dry run unless `--yes` (CLI) or a second, confirming press (pane).
  - Re-scan right before deleting, and delete only items that are still cleanable.
  - Route every deletion through `guard.rm()`.
  - Put the numbers next to every color, and give every chart a text equivalent.
  - Test against the sandbox.
  - Keep `node --test`, `claude plugin test` and `claude plugin validate --strict` passing before a task is done.
- **Ask first:**
  - running `clean --yes` against the real HOME during development
  - adding a category or widening the guard allowlist
  - a breaking change to the JSON contract (`schema` major)
  - adding any run-time dependency
  - anything that sends data off the machine
- **Never:**
  - delete a worktree with uncommitted changes, even with `--force`
  - delete commits that exist on one branch only
  - touch `~/.claude.json`, `settings*.json`, `.credentials.json`, `CLAUDE.md`, `history.jsonl`, `agent-memory/`, `jobs/`, `daemon/`, `skills/` or `projects/*/memory/`
  - delete anything that belongs to a running session
  - delete files from a skill by any route other than the engine
  - write files of its own (cache, history, logs, locks) or keep state across sessions (`$.store`)
  - add telemetry

## Success Criteria (whole plugin)

1. `/sweep` opens the pane within 1 s: with this session's last scan if there is one, else with live scan progress. A full scan of the author's machine takes ≤ 15 s (clearx baseline on 2026-10-13: 28–43 s).
2. Every number agrees across the pane, `sweep scan`, `/sweep:scan` and the status line for the same scan (one contract).
3. From the pane, cleaning the two idle Tree-Testing worktrees takes: tick `worktrees`, press Clean, press Confirm. Afterwards the pane shows `Freed 2.7G` and a rescan without them, and both worktrees and their `worktree-*` branches are gone.
4. A dirty worktree, a worktree with commits on its branch only, a locked worktree and a worktree created during a live session in the same repo all survive every clean, including `--force` for the dirty one. The sandbox suite proves it.
5. With 5 GB or more reclaimable, or less than 10% disk free, the band appears above the prompt after the session's background scan, and stays hidden for the session once you hide it.
6. A temp task-output file over 5 GB triggers a toast on the session's background scan.
9. sweep writes no files of its own and nothing to `$.store`: after a scan and a clean, no new path exists under the plugin data dir, the tmp root or HOME (sandbox test).
7. `claude plugin validate --strict .`, `node --test tests/` and `claude plugin test .` pass.
8. In a terminal without pixel support, every chart draws as cells. On a surface without `Raster`, every chart has a text equivalent.

## Open Questions

- Q1: Does `userConfig` take `type: "number"` (band threshold, day counts)? If not, use strings with `options`. Check `claude-code.d.ts` in T2.
- Q2: How does the mod learn the terminal type (for pixels)? Probably `$.env`; check the types. The fallback is `chartStyle: cells`.
- Q3: Is `$.state` big enough to hold a full scan with items (hundreds of paths)? If not, keep a summary in state and re-run `explain <id> --json` when a category is drilled into.
- Q4: Should the old `clearx` plugin be uninstalled automatically once sweep is installed, or left to you? Proposed: left to you; the README says how.
