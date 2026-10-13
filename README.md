# sweep

See and clean the disk space Claude Code uses and leaves behind: agent and workflow worktrees with their `node_modules`, temp scratchpads and task output, superseded plugin versions, old transcripts, checkpoints, old CLI binaries and stray config copies.

- `/sweep` opens a pane with charts: what Claude Code uses, what can go, and why each thing is kept.
- Cleaning is always a dry run first, then a confirmation.
- sweep never touches uncommitted work, commits that exist on one branch only, auto-memory, credentials, settings, or anything a running session uses.
- **sweep stores nothing.** Every number is a fresh scan. It writes no cache, history, lock or log file, and keeps nothing between sessions.

## Why

Claude Code cleans up after itself with `cleanupPeriodDays` (default 30 days), but several things fall outside that:

- **Agent worktrees.** Subagents with `isolation: "worktree"`, Workflow agents and `claude --worktree` each create a full checkout in `<repo>/.claude/worktrees/<name>`, and agents usually `npm install` there. A worktree with any change, a `claude -p --worktree` run, or a foreground `--worktree` session is never removed. GitHub issues report 36–80 GB of them (#58914, #63087).
- **The plugin cache.** Every update unpacks a new version, and old ones are never removed (#36245, #81217).
- **Temp task output.** `/private/tmp/claude-<uid>/…` holds scratchpads and background task output, which reached 100–500 GB in several reports (#26911, #31241).
- **Old CLI versions, stray `~/.claude.json` copies,** and transcripts of projects you deleted.

## Install

```sh
claude plugin marketplace add ~/Projects/clear
claude plugin install sweep@sweep
```

To try it for one session without installing: `claude --plugin-dir ~/Projects/clear`. It needs Node 18+ and git, on macOS or Linux.

For the shell command in your own terminal: `ln -s ~/Projects/clear/bin/sweep ~/.local/bin/sweep`.

## Use

| You do | You get |
|---|---|
| `/sweep` | The pane: a footprint bar, a treemap of what can go, the categories with tick boxes, and Clean |
| `/sweep scan` | The pane, with a fresh scan |
| `/sweep clean worktrees` · `/sweep clean safe` | The pane, on the confirm step for those categories |
| `/sweep explain plugin-versions` | The pane, on that category |
| `/sweep text` | The text report, with no pane (also used automatically below 110 columns) |
| `/sweep:scan`, `/sweep:clean`, `/sweep:explain` | Claude runs the scan, explains it, and asks before deleting |
| `sweep scan --details` · `sweep clean safe --yes` | The same from a terminal; `--trash` to move to the Trash, `--roots a,b` for where to look, `--json` for scripts |

**In the pane:**

| Key | Does |
|---|---|
| `r` | Rescan |
| `s` | Select the safe categories |
| `c` | Clean the selection: dry run first |
| `y` | Delete (confirm step only) |
| `n` | Cancel |
| `1` / `2` | Overview / Projects |
| `b` | Back from a category |
| `x` | Clear a project filter |

Press `›` on a row to see that category's items, tick single items, and see the age of its space. Every item has **reveal** (Finder) and **copy** (its path); worktrees, and branches holding their own commits, also have **ask Claude**, which asks Claude to review the agent's work read-only and say whether it's safe to remove. On the confirm step, `t` moves to the Trash instead of deleting (the space returns when you empty it).

**Without opening anything:**

- The status line shows `sweep 3.5G` after the session's background scan.
- A line above the prompt appears when 5 GB or more can go, the disk is under 10% free, or a task output file passes 5 GB.
- A toast says what a clean freed.

## Categories

| ID | Risk | What sweep removes | Kept when |
|---|---|---|---|
| `worktrees` | caution | Claude worktrees with nothing unsaved, and their `worktree-*` branch; orphan folders | uncommitted changes, commits on no other branch (`--force` removes the folder and keeps the branch), locked, a session inside, or created during a session still running in the repo |
| `worktree-deps` | safe | `node_modules` inside worktrees kept for their work | — |
| `worktree-branches` | safe | `worktree-*` branches whose commits are all on another branch; stale worktree records | unique commits |
| `tmp-sessions` | safe | temp session folders older than a day; CLI temp caches | a running session, or the running CLI version |
| `plugin-versions` | caution | cache versions `installed_plugins.json` does not use | marked in use, or changed today |
| `transcripts` | caution | transcripts older than 30 days (you lose resume) | a running session |
| `orphan-projects` | caution | transcripts of projects whose folder is gone (`memory/` kept) | original folder unknown (`--force`) |
| `file-history` | caution | checkpoints older than 30 days (you lose rewind) | a running session |
| `session-leftovers` | safe | shell snapshots, paste cache, debug logs, legacy dirs older than 7 days | a running session |
| `old-cli` | safe | CLI versions except the running one and the newest older one; old downloads | — |
| `config-backups` | safe | `~/.claude.json.backup.<ts>`, `.tmp.*`, `.corrupted.*` | — |
| `plugin-orphan-data` | review | plugin data folders matching no installed plugin | always, unless `--force` in chat |
| `marketplace-deps` | review | `node_modules` in marketplace clones | always, unless `--force` in chat |

**Never deleted:** `~/.claude.json`, `settings*.json`, `.credentials.json`, `CLAUDE.md`, `history.jsonl`, `agent-memory/`, `jobs/`, `daemon/`, `skills/`, `commands/`, `agents/`, `projects/*/memory/`. Every deletion goes through one guard that refuses any path outside Claude Code's own locations, including through symlinked folders.

## Settings (`/config`)

| Setting | Default | |
|---|---|---|
| `chartStyle` | `auto` | `auto`: pictures in kitty and Ghostty, characters elsewhere. `pixels` or `cells` force one. |
| `backgroundScan` | on | one read-only scan a minute after a session starts |
| `statusLine` | on | the `sweep 3.5G` entry |
| `bandThresholdGB` | 5 | reclaimable space that brings up the line above the prompt |
| `scanRoots` | (empty) | folders searched for worktrees in repos Claude no longer lists; empty means `~/Projects`, `~/code`, `~/src`, `~/dev`, `~/work`, `~/Developer`, `~/repos`; `off` turns it off |

## Prevent it

- Lower `cleanupPeriodDays` in `~/.claude/settings.json` (for example `14`), so Claude Code's own sweep keeps less.
- Read the `worktree.*` settings (`worktree.sparsePaths`, `worktree.symlinkDirectories`) in the [settings reference](https://code.claude.com/docs/en/settings-reference) to avoid a full `node_modules` in every agent worktree.
- Add `.claude/worktrees/` to each repo's `.gitignore`.
- `claude purge <path>` removes one project's state, including its `~/.claude.json` entry.

## Develop

```sh
node --test "tests/**/*.test.mjs"     # engine and CLI, against a generated sandbox HOME
claude plugin test .                  # charts and the mod (pane, alerts)
claude plugin validate --strict .
npx -p typescript tsc -p .            # needs .claude-plugin/types, laid by a session that loads the plugin
```

The specs are `SPEC.md` (the capability map) and `SPEC-<module>.md`. The plan is `tasks/plan.md`, and the tasks are in `tasks/todo.md`.

If you installed the earlier **clearx** prototype, remove it with `claude plugin uninstall clearx` and `claude plugin marketplace remove clearx`. sweep replaces it.
