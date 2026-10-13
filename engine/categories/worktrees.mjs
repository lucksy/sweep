import { sh } from '../fsx.mjs';
import { worktreeScan } from '../git.mjs';

export default {
  id: 'worktrees',
  title: 'Agent and workflow worktrees',
  group: 'worktrees',
  risk: 'caution',
  text: () => ({
    creates: 'Subagents with isolation: "worktree", Workflow agents, EnterWorktree and `claude --worktree` create a full checkout in <repo>/.claude/worktrees/<name> on a branch worktree-<name>. Agents often run npm install there, so each one carries its own node_modules.',
    claude: 'Removed when the agent finishes with no changes. A worktree with changes stays until the cleanupPeriodDays sweep (default 30 days), which still keeps any with changes, untracked files or unpushed commits. `claude -p --worktree` sessions and non-backgrounded --worktree sessions are never swept.',
    sweep: 'Removes worktrees that are clean, unlocked, not in use by a live session and have no commits missing from other branches, plus orphan directories. Deletes their worktree-* branch. With --force it also removes clean worktrees whose commits exist only on their branch, but keeps that branch so nothing is lost. Never removes a worktree with uncommitted changes.',
  }),
  scan: (ctx) => worktreeScan(ctx),
  clean: (item, ctx) => {
    if (item.internal.orphan) return ctx.rm(item.path);
    ctx.check(item.path);
    if (sh('git', ['-C', item.internal.repo, 'worktree', 'remove', '--force', item.path]) === null) throw new Error('git worktree remove failed');
    if (item.internal.unique === 0 && item.internal.branch?.startsWith('worktree-')) sh('git', ['-C', item.internal.repo, 'branch', '-D', item.internal.branch]);
    sh('git', ['-C', item.internal.repo, 'worktree', 'prune']);
  },
};
