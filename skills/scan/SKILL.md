---
name: scan
description: List every kind of storage Claude Code leaves behind on this machine (agent worktrees and their node_modules, temp scratchpads, superseded plugin versions, old transcripts, checkpoints, old CLI binaries, stray config copies), with sizes, risk and what each one is. Use when the user asks what is filling their disk, what Claude Code stores, or runs /sweep:scan.
argument-hint: "[--details] [--days N]"
allowed-tools: Bash(node ${CLAUDE_PLUGIN_ROOT}/engine/sweep.mjs *)
---

Run this and wait for it; it can take up to a minute on a large machine:

```
node ${CLAUDE_PLUGIN_ROOT}/engine/sweep.mjs list --details $ARGUMENTS
```

Then report to the user:

1. The table as printed, so they can see every category, its risk, its reclaimable size and item count.
2. In two or three sentences, where the bulk of the space is and why it is there, using each category's own description (`node ${CLAUDE_PLUGIN_ROOT}/engine/sweep.mjs explain <id>` gives the full story for one).
3. Items marked `·` that are kept, and the reason printed next to them (unsaved work, locked, a live session, not installed by a known plugin).
4. The next step: `/sweep:clean safe` for the safe categories, or `/sweep:clean <id>` for a specific one.

Risk levels: **safe** is regenerable or pure leftovers. **caution** loses something you might want (resume, rewind, a worktree branch checkout), or can affect a running session. **review** is only cleaned with `--force`.

Do not delete anything from this skill.
