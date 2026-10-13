---
name: scan
description: Show what Claude Code stores on this machine and what can be freed: agent and workflow worktrees with their node_modules, temp scratchpads and task output, superseded plugin versions, old transcripts, checkpoints, old CLI binaries, stray config copies. Use when the user asks what is filling their disk, why Claude Code uses so much space, how big worktrees or the plugin cache are, or runs /sweep:scan.
argument-hint: "[--days N]"
allowed-tools: Bash(node ${CLAUDE_PLUGIN_ROOT}/engine/sweep.mjs *)
---

Run this and wait for it (about 10–30 seconds):

```
node ${CLAUDE_PLUGIN_ROOT}/engine/sweep.mjs scan --details $ARGUMENTS
```

Then tell the user, briefly:

1. The header line: what Claude Code uses on this disk, how much is reclaimable, and how much space is free. Lead with any ⚠ warning (runaway task output, low disk, Claude Code's own cleanup paused).
2. Where most of the reclaimable space is and why it is there, in two or three sentences, using the category descriptions. `node ${CLAUDE_PLUGIN_ROOT}/engine/sweep.mjs explain <id>` gives the full story of one category.
3. What is kept and why (the `kept:` lines): unsaved work, a running session, a locked worktree, a plugin version in use.
4. The next step: `/sweep:clean safe` for the safe categories, `/sweep:clean <id>` for one category, or type `/sweep` to browse it all in the sweep pane with charts.

Risk levels: **safe** is leftovers or rebuildable. **caution** loses something you might want (resuming a session, rewinding edits, an agent's checkout), or affects a running session. **review** is only cleaned with `--force`.

sweep stores nothing: every scan is fresh. Do not delete anything from this skill.
