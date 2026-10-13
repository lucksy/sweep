---
name: explain
description: Explain one kind of storage Claude Code leaves behind: where it comes from, what Claude Code cleans on its own, what sweep would remove, and every item found. Use when the user asks what a sweep category is (worktrees, plugin-versions, tmp-sessions, transcripts, file-history, ...) or whether it is safe to delete, or runs /sweep:explain.
argument-hint: "<category>"
allowed-tools: Bash(node ${CLAUDE_PLUGIN_ROOT}/engine/sweep.mjs *)
---

The category is `$ARGUMENTS`. If it is empty or unknown, run `node ${CLAUDE_PLUGIN_ROOT}/engine/sweep.mjs help` and ask which category the user means.

Run:

```
node ${CLAUDE_PLUGIN_ROOT}/engine/sweep.mjs explain $ARGUMENTS
```

Relay it plainly:

- **Where it comes from**: what in Claude Code creates it.
- **What Claude Code cleans itself**: its own cleanup (`cleanupPeriodDays`) and when it does not apply.
- **What sweep removes**: and what it always keeps.
- **Found**: the items, the reclaimable total, and for each kept item the reason in plain words.

Finish with whether it is safe to clean and the command: `/sweep:clean $ARGUMENTS`. Do not delete anything from this skill.
