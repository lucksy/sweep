---
status: draft
created: 2026-10-13
module: cli
---

# Spec: cli

## Objective

The `sweep` shell command: a readable text report for people, and the JSON contract for the skills and the mod. It is a thin layer over the engine: parse arguments, call `scan` / `clean` / `explain`, render, set the exit code.

## Commands

```
sweep [scan] [--details] [--json] [--progress] [--days N] [--force]
sweep explain <id> [--json]
sweep clean <id...|safe|all> [--only <itemId,...>] [--yes] [--force] [--days N] [--json] [--progress]
sweep help | --help | -h
sweep --version
```

- `scan` is the default command. `list`, `ls`, `-list` and `--list` are aliases, kept from clearx.
- `clean` without `--yes` is a dry run. It prints what would go, says "Would free X" and exits 0.
- `safe` means every category with risk `safe`; `all` means every category.
- Nothing is stored: each command scans afresh (SPEC.md, "sweep stores no data").

## Text output

These carry over from clearx:
- the table (ID, RISK, RECLAIM, ITEMS, WHAT)
- `--details` with up to 12 items per category
- the "Not cleaned by sweep" info block and the "Next:" hint

New:
- **Header:** footprint total, reclaimable, disk free:
  `Claude Code uses 9.1G on this disk · 3.5G reclaimable · 57G free (12%)`
- **Footprint line:** one stacked bar of `█` blocks in risk colors, with part labels underneath. Plain text with ANSI color only when stdout is a TTY and `NO_COLOR` is unset.
- **Warnings** (runaway output, low disk) print first, in red.
- **Kept items** are grouped by reason: `kept 6: created during a session still running in this repo (--force)`.
- Width follows `process.stdout.columns`, at least 80. Paths are truncated in the middle (`…/worktrees/agent-a7224a…`).

## Exit codes

| code | meaning |
|---|---|
| 0 | success (scan, dry run, clean with nothing failed) |
| 1 | clean finished with at least one failure |
| 2 | usage error (unknown command or category, missing argument) |
| 3 | unsupported platform |

## bin/sweep

A POSIX `sh` shim that resolves its own symlink and runs `node <plugin>/engine/sweep.mjs "$@"`. Claude Code adds `bin/` to Bash's PATH while the plugin is enabled. For your own terminal, the README says: `ln -s ~/Projects/clear/bin/sweep ~/.local/bin/sweep`.

## Acceptance Criteria

- [ ] Each command and alias above runs in the sandbox, with snapshot tests of its text output (with `NO_COLOR=1` and a fixed width).
- [ ] `--json` output equals `JSON.stringify(engine result)`, with nothing else on stdout.
- [ ] Every exit code in the table has a test that produces it.
- [ ] `bin/sweep` works through a symlink from another folder.
- [ ] `sweep clean` (no category) exits 2 and lists the category ids.
