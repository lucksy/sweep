# sweep

See and clean the disk space Claude Code leaves behind: agent and workflow worktrees and their `node_modules`, temp task output, old plugin versions, old transcripts and checkpoints, old CLI binaries and stray config copies.

Every clean starts as a dry run and waits for you to confirm. sweep never touches uncommitted work, commits that exist only on their own branch, memory, credentials or settings. It stores nothing: every number comes from a fresh scan.

## Install

```sh
claude plugin marketplace add lucksy/sweep
claude plugin install sweep@sweep
```

It needs Node 18+ and git, on macOS or Linux.

To get the `sweep` command in your own terminal, link `bin/sweep` from the plugin folder into a folder on your PATH (for example `ln -s <plugin folder>/bin/sweep ~/.local/bin/sweep`).

## Use

### Commands

| Command | What it does |
|---|---|
| `/sweep` | Opens the pane: a footprint bar, a treemap of what can go, and the categories with tick boxes |
| `/sweep scan` | Opens the pane with a fresh scan |
| `/sweep clean <id…\|safe>` | Opens the pane on the confirm step for those categories |
| `/sweep explain <id>` | Opens the pane on one category |
| `/sweep text` | Shows a text report instead of the pane (used automatically below 110 columns) |
| `/sweep:scan` | Claude runs the scan and explains the results |
| `/sweep:explain <id>` | Claude explains one category and lists its items |
| `/sweep:clean` | Claude cleans with you: dry run first, then deletes only after you confirm |

### Pane keys

| Key | Action |
|---|---|
| `r` | Rescan |
| `s` | Select the safe categories |
| `c` | Clean the selection (dry run first) |
| `y` / `n` | Confirm / cancel |
| `t` | Move to the Trash instead of deleting (confirm step only) |
| `1` / `2` | Switch between Overview and Projects |
| `›` / `b` | Open a category / go back |
| `x` | Clear the project filter |

Each item has **reveal** (show it in Finder) and **copy** (copy its path). Worktrees and branches with their own commits also have **ask Claude**, which has Claude review the work read-only and say whether the worktree is safe to remove.

### Terminal

```sh
sweep scan [--details] [--json]
sweep explain <id> [--json]
sweep clean <id…|safe|all> [--yes] [--trash] [--only <itemId,…>] [--days N] [--roots a,b] [--force] [--json]
```

Without `--yes`, `clean` is a dry run.

### Background alerts

- After a background scan, the status line shows how much space can go, for example `sweep 3.5G`.
- A line above the prompt appears when 5 GB or more can go, when less than 10% of the disk is free, or when one task output file is over 5 GB.
- After a clean, a toast says how much space was freed.

## Categories

| ID | Risk | What it removes |
|---|---|---|
| `worktrees` | caution | Claude worktrees with no unsaved work, and their branches |
| `worktree-deps` | safe | `node_modules` inside worktrees that sweep keeps |
| `worktree-branches` | safe | `worktree-*` branches whose commits are already on another branch |
| `tmp-sessions` | safe | Temp session folders older than one day |
| `plugin-versions` | caution | Plugin cache versions that no installed plugin uses |
| `transcripts` | caution | Transcripts older than 30 days (you can no longer resume those sessions) |
| `orphan-projects` | caution | Transcripts of projects whose folder no longer exists |
| `file-history` | caution | Checkpoints older than 30 days (you can no longer rewind to them) |
| `session-leftovers` | safe | Shell snapshots, paste cache and debug logs older than 7 days |
| `old-cli` | safe | Old CLI versions; the running version and the newest older one are kept |
| `config-backups` | safe | `~/.claude.json` backup, temp and corrupted copies |
| `plugin-orphan-data` | review | Plugin data folders that match no installed plugin (`--force` only) |
| `marketplace-deps` | review | `node_modules` in marketplace clones (`--force` only) |

## Settings (`/config`)

| Setting | Default | What it controls |
|---|---|---|
| `chartStyle` | `auto` | `pixels` draws images, `cells` uses text characters, `auto` uses images in kitty and Ghostty |
| `backgroundScan` | on | One read-only scan a minute after each session starts |
| `statusLine` | on | The `sweep 3.5G` entry in the status line |
| `bandThresholdGB` | `5` | How much reclaimable space, in GB, brings up the line above the prompt |
| `scanRoots` | (empty) | Folders searched for worktrees of repos Claude no longer lists; `off` turns the search off |

## License

MIT
