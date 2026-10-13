---
name: clearx
description: Entry point for clearx, which finds storage Claude Code leaves behind. With no argument or "list" it lists every category; "explain <id>" tells where one comes from, what Claude Code cleans itself and every item found; "clean ..." cleans after confirmation.
argument-hint: "[list | explain <id> | clean <id...|safe|all>]"
allowed-tools: Bash(node ${CLAUDE_PLUGIN_ROOT}/scripts/clearx.mjs *)
---

Arguments: `$ARGUMENTS`

- Empty, `list`, `-list` or `--list`: do what `/clearx:list` does. Run `node ${CLAUDE_PLUGIN_ROOT}/scripts/clearx.mjs list --details` and report the table, where the space is, and what is kept and why.
- `explain <id>`: run `node ${CLAUDE_PLUGIN_ROOT}/scripts/clearx.mjs explain <id>` and relay it: where it comes from, what Claude Code cleans on its own, what clearx removes, and the items found.
- `clean ...`: follow `/clearx:clean`. Dry run first, ask the user to confirm, then rerun with `--yes`. Never delete files by hand.
- `help`: run `node ${CLAUDE_PLUGIN_ROOT}/scripts/clearx.mjs help`.
