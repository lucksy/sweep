---
name: clean
description: Clean storage Claude Code leaves behind, one category at a time or all safe ones, after a dry run and the user's confirmation. Use when the user runs /clearx:clean or asks to free disk space taken by Claude Code worktrees, node_modules, temp folders, plugin cache or old transcripts.
argument-hint: "<id...|safe|all> [--days N] [--force]"
allowed-tools: Bash(node ${CLAUDE_PLUGIN_ROOT}/scripts/clearx.mjs *)
---

Arguments: `$ARGUMENTS`

If no category was given, run `node ${CLAUDE_PLUGIN_ROOT}/scripts/clearx.mjs list` and ask which categories to clean, suggesting `safe`.

1. Dry run first, never skip it:

   ```
   node ${CLAUDE_PLUGIN_ROOT}/scripts/clearx.mjs clean $ARGUMENTS
   ```

2. Show the user what would be removed and how much space it frees. Call out anything in a **caution** category in plain words:
   - `worktrees`: the agent's checkout is deleted. Only clean worktrees with nothing unsaved are removed. With `--force`, worktrees whose commits exist only on their branch are removed too, and the branch is kept.
   - `transcripts`, `orphan-projects`: those sessions can no longer be resumed. Memory is kept.
   - `file-history`: rewind is lost for those sessions.
   - `plugin-versions`: sessions still running an old plugin version should be restarted.

3. Ask the user to confirm with AskUserQuestion. Do not continue without a clear yes.

4. On yes, run the same command with `--yes` added, and report what was freed and anything that failed or was kept.

Never pass `--force` unless the user asked for it by name. Never delete files by hand; only through this script.
