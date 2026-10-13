# clearx

A Claude Code plugin that lists and cleans the storage Claude Code leaves behind. It runs a dry run unless you pass `--yes`, and never removes uncommitted work, auto-memory, credentials or settings.

## Why

Claude Code writes a lot to disk that you never see. Most of it is cleaned by the `cleanupPeriodDays` sweep (default 30 days), but several things are not:

- **Agent and workflow worktrees.** Subagents with `isolation: "worktree"`, Workflow agents and `claude --worktree` each create a full checkout in `<repo>/.claude/worktrees/<name>`, and agents usually `npm install` there. A worktree with any changes, a `claude -p --worktree` run, or a foreground `--worktree` session is never swept. Reported on GitHub: 27 worktrees / 80 GB (#63087), 764 worktrees / 36 GB (#58914), stale after crashes (#26725, open).
- **Plugin cache.** Every update unpacks a new version in `~/.claude/plugins/cache`; old versions are never removed (#36245, #81217: 4.77 GB).
- **Temp folders.** `/private/tmp/claude-<uid>/<project>/<session>/` holds scratchpads and background task output. Runaway task output reached 100-500 GB in several reports (#26911, #31241, #41540).
- **Old CLI versions**, **stray `~/.claude.json` copies**, and **transcripts of projects you deleted**.

Sources: the [`.claude` directory reference](https://code.claude.com/docs/en/claude-directory), [worktrees](https://code.claude.com/docs/en/worktrees), and the GitHub issues above.

## Install

```sh
# try it for one session
claude --plugin-dir /path/to/clearx

# or install it from this folder as a local marketplace
claude plugin marketplace add /path/to/clearx
claude plugin install clearx@clearx
```

To use it from your own terminal too: `ln -s /path/to/clearx/bin/clearx ~/.local/bin/clearx`. It needs Node 18+ and git.

## Use

| In Claude Code | In a terminal | |
|---|---|---|
| `/clearx:list` | `clearx list --details` | every category with size, risk, items and why each is kept |
| `/clearx:clearx explain worktrees` | `clearx explain worktrees` | where it comes from, what Claude cleans itself, every item |
| `/clearx:clean safe` | `clearx clean safe` | dry run of all safe categories; add `--yes` to delete |
| `/clearx:clean worktrees` | `clearx clean worktrees --yes` | one category |

In Claude Code, `/clearx:clean` always shows the dry run and asks before deleting. `clearx -list` also works.

Options: `--days N` overrides the age threshold of age-based categories; `--force` also cleans **review** items and clean worktrees whose commits exist only on their branch (the branch is kept, so the commits are not lost); `--json` for machine output.

## Categories

| ID | Risk | What clearx removes | Claude cleans it itself? |
|---|---|---|---|
| `worktrees` | caution | worktrees in `.claude/worktrees` with no uncommitted changes, no commits missing from other branches, not locked, not in use, and not created during a session still running in that repo; their `worktree-*` branch; orphan folders | only unchanged ones, and only for subagents and background sessions |
| `worktree-deps` | safe | `node_modules` inside worktrees kept because they hold work | no |
| `worktree-branches` | safe | `worktree-*` branches (incl. `worktree-wf_*` from workflows) not checked out and fully contained in another branch or remote; stale git worktree records | only with the worktree |
| `tmp-sessions` | safe | temp session folders of sessions not running, older than 1 day; CLI temp caches; stray `claude-*-cwd` files | when the transcript ages out, or on reboot |
| `plugin-versions` | caution | cache versions not referenced by `installed_plugins.json`, not marked in use, older than a day; `temp_*` fetch folders | never |
| `transcripts` | caution | `projects/*/<session>.jsonl` and its folder, older than 30 days (lose resume) | yes, after `cleanupPeriodDays` |
| `orphan-projects` | caution | transcripts of projects whose folder is gone, found from the `cwd` recorded in the transcript; `memory/` is kept | only as they age out |
| `file-history` | caution | checkpoint snapshots older than 30 days (lose rewind) | yes |
| `session-leftovers` | safe | `shell-snapshots`, `paste-cache`, `image-cache`, `debug`, `session-env`, legacy `todos`/`statsig`/`logs`, older than 7 days | yes |
| `old-cli` | safe | `~/.local/share/claude/versions/*` except the running one and the newest older one; `~/.claude/downloads` | partly |
| `config-backups` | safe | `~/.claude.json.backup.<ts>`, `.tmp.*`, `.corrupted.*` in your home folder | no |
| `plugin-orphan-data` | review | `plugins/data/*` matching no installed plugin (`--force` only) | on uninstall |
| `marketplace-deps` | review | `node_modules` in marketplace clones (`--force` only) | no |

Never deleted: `~/.claude.json`, `settings*.json`, `.credentials.json`, `CLAUDE.md`, `history.jsonl`, `agent-memory/`, `jobs/`, `daemon/`, `skills/`, `projects/*/memory/`, anything belonging to a running session. Deletion is also refused for any path outside the Claude locations above.

## Prevent it

- Lower `cleanupPeriodDays` in `~/.claude/settings.json` (e.g. `14`) so the built-in sweep runs harder.
- See the `worktree.*` settings (`worktree.sparsePaths`, `worktree.symlinkDirectories`) in the [settings reference](https://code.claude.com/docs/en/settings-reference) to avoid a full `node_modules` per agent worktree.
- Add `.claude/worktrees/` to each repo's `.gitignore`.
- `claude purge <path>` removes one project's state including its `~/.claude.json` entry.
