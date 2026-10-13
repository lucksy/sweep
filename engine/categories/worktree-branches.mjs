import { sh, shAsync } from '../fsx.mjs';
import { isClaudeWorktree, repos, uniqueCommits } from '../git.mjs';

export default {
  id: 'worktree-branches',
  title: 'Leftover worktree-* branches and stale worktree records',
  group: 'worktrees',
  risk: 'safe',
  text: () => ({
    creates: 'Each agent worktree gets a branch worktree-<name> (workflows: worktree-wf_<id>-<n>). Git also keeps a record in .git/worktrees for every worktree, even after its directory is gone.',
    claude: 'The branch is deleted only when Claude removes the worktree itself.',
    sweep: 'Deletes worktree-* branches that are not checked out anywhere and whose commits all exist on another branch or remote. Prunes records of Claude worktrees whose directory no longer exists. Branches with unique commits are listed but kept.',
  }),
  scan: async (ctx) => (await Promise.all((await repos(ctx)).map(async (repo) => {
    const checkedOut = new Set(repo.worktrees.map((w) => w.branch).filter(Boolean));
    const refs = await shAsync('git', ['-C', repo.main, 'for-each-ref', '--format=%(refname:short)', 'refs/heads/worktree-*']);
    const names = (refs ? refs.split('\n').filter(Boolean) : []).filter((b) => !checkedOut.has(b));
    const counts = await Promise.all(names.map((b) => uniqueCommits(repo.main, b)));
    const branches = names.map((b, n) => {
      const unique = counts[n];
      const reason = unique === null ? 'git-error' : unique > 0 ? 'unique-commits' : null;
      return {
        path: `${repo.main} → ${b}`, label: b, project: repo.main, bytes: 0, ageDays: null,
        cleanable: reason === null, reason,
        note: unique ? `${unique} commit(s) on no other branch: kept` : 'fully merged elsewhere',
        detail: { branch: b, unique }, internal: { repo: repo.main, branch: b },
      };
    });
    const stale = repo.worktrees.filter((w) => w.prunable && isClaudeWorktree(w.path)).map((w) => ({
      path: w.path, label: 'stale record', project: repo.main, bytes: 0, ageDays: null,
      cleanable: true, reason: null, note: 'stale git record: directory is gone',
      detail: { prune: true }, internal: { repo: repo.main, prune: true },
    }));
    return [...branches, ...stale];
  }))).flat(),
  clean: (item) => {
    if (item.internal.prune) sh('git', ['-C', item.internal.repo, 'worktree', 'prune']);
    else if (sh('git', ['-C', item.internal.repo, 'branch', '-D', item.internal.branch]) === null) throw new Error('git branch -D failed');
  },
};
