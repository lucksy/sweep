---
name: explain
description: Entry point for sweep, which finds storage Claude Code leaves behind. With no argument or "list" it lists every category; "explain <id>" tells where one comes from, what Claude Code cleans itself and every item found; "clean ..." cleans after confirmation.
argument-hint: "[list | explain <id> | clean <id...|safe|all>]"
allowed-tools: Bash(node ${CLAUDE_PLUGIN_ROOT}/engine/sweep.mjs *)
---

Arguments: `$ARGUMENTS`

- Empty, `list`, `-list` or `--list`: do what `/sweep:scan` does. Run `node ${CLAUDE_PLUGIN_ROOT}/engine/sweep.mjs list --details` and report the table, where the space is, and what is kept and why.
- `explain <id>`: run `node ${CLAUDE_PLUGIN_ROOT}/engine/sweep.mjs explain <id>` and relay it: where it comes from, what Claude Code cleans on its own, what sweep removes, and the items found.
- `clean ...`: follow `/sweep:clean`. Dry run first, ask the user to confirm, then rerun with `--yes`. Never delete files by hand.
- `help`: run `node ${CLAUDE_PLUGIN_ROOT}/engine/sweep.mjs help`.
