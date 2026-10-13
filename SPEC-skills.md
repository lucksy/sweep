---
status: approved
created: 2026-10-13
approved: 2026-10-13
module: skills
---

# Spec: skills

## Objective

Let Claude drive sweep in conversation. You can ask "what's filling my disk?" or "clean up old worktrees" and get a correct, explained answer, with the same safety as the pane. These are the clearx skills, renamed and pointed at the new CLI.

## Skills

| Slash command | Triggers on | Does |
|---|---|---|
| `/sweep:scan` | "what is Claude Code storing", "why is my disk full", "how much space do worktrees use" | runs `sweep scan --details`, shows the table, explains where the space is and why items are kept, suggests a next step |
| `/sweep:explain <id>` | "what is plugin-versions", "is it safe to delete file-history" | runs `sweep explain <id>`, relays the creates / claude / sweep texts and the items |
| `/sweep:clean <id...\|safe\|all> [--days N] [--force]` | "clean up", "free space", "delete old worktrees" | runs a dry run, shows it, asks with AskUserQuestion, then runs `--yes --json` and reports freed, kept and failed |

Frontmatter carried over from clearx:
- `allowed-tools: Bash(node ${CLAUDE_PLUGIN_ROOT}/engine/sweep.mjs *)`
- `argument-hint`
- a description that names the trigger phrases

## Rules written into the skills

1. A clean is always a dry run, then an AskUserQuestion, then `--yes`, never in a single step.
2. Pass `--force` only when you said "force" yourself.
3. Never delete through `rm` or any other route than the engine.
4. When the pane is the better tool (you want to browse), say: "Type `/sweep` to open the sweep pane."
5. Caution categories are explained in plain words before you confirm: what you lose (resume, rewind, a worktree checkout).
6. After a clean, mention that the status line and the pane update on their next scan (sweep stores nothing).

## Acceptance Criteria

- [ ] `claude plugin validate --strict .` passes, and `claude -p --plugin-dir . "list sweep skills"` lists all three.
- [ ] In a sandboxed session (`HOME` etc. pointed at the fixture), `/sweep:clean safe` shows the dry run and asks before deleting; declining deletes nothing (verified by a second scan).
- [ ] No skill text tells Claude to use `rm`, `git worktree remove` or any delete command directly.
