---
name: clean
description: Free disk space Claude Code leaves behind, one category at a time or all safe ones, always as a dry run first and only after the user confirms. Use when the user runs /sweep:clean or asks to clean up, free space, or delete old worktrees, node_modules, temp folders, the plugin cache or old transcripts.
argument-hint: "<category...|safe|all> [--days N] [--force]"
allowed-tools: Bash(node ${CLAUDE_PLUGIN_ROOT}/engine/sweep.mjs *)
---

Arguments: `$ARGUMENTS`

If no category was given, run `node ${CLAUDE_PLUGIN_ROOT}/engine/sweep.mjs scan`, show the table, and ask which categories to clean, suggesting `safe`.

1. **Dry run first, always.** Never skip it.

   ```
   node ${CLAUDE_PLUGIN_ROOT}/engine/sweep.mjs clean $ARGUMENTS
   ```

2. **Show what would go**: the items per category and the total it would free. For each **caution** category in it, say in plain words what the user loses:
   - `worktrees`: the agents' checkouts are deleted. Only worktrees with nothing unsaved are removed; with `--force`, worktrees whose commits exist only on their branch go too, and that branch is kept, so no commit is lost.
   - `transcripts`, `orphan-projects`: those sessions can no longer be resumed. Memory is kept.
   - `file-history`: rewind is lost for those sessions.
   - `plugin-versions`: sessions still running an old plugin version should be restarted afterwards.

3. **Ask the user to confirm** with AskUserQuestion, with three options: **Delete**, **Move to Trash** (recoverable; the space comes back when the Trash is emptied), and **Cancel**. Continue only on a clear choice of Delete or Move to Trash.

4. **On Delete**, run the same command with `--yes --json` added. **On Move to Trash**, add `--yes --trash --json`. Report what was freed or moved, what was kept and why, and anything that failed, from the JSON (`mode`, `freedBytes`, `removed`, `kept`, `skipped`, `failed`). After a move to the Trash, say the space returns once the Trash is emptied.

Rules:
- Pass `--force` only when the user said "force" themselves.
- Delete only through this engine command. Never delete files any other way.
- sweep stores nothing; the status line and the `/sweep` pane show the new numbers after their next scan.
