// Claude's git worktrees: which repos hold them, and whether each one holds work.

import path from 'node:path';

import { ageDays, fmt, isDir, ls, sh, stat } from './fsx.mjs';

export function parseWorktrees(repo) {
  const out = sh('git', ['-C', repo, 'worktree', 'list', '--porcelain']);
  if (!out) return [];
  return out.split('\n\n').map((block) => {
    const wt = {};
    for (const line of block.split('\n')) {
      const [k, ...rest] = line.split(' ');
      wt[k] = rest.join(' ') || true;
    }
    return { path: wt.worktree, branch: typeof wt.branch === 'string' ? wt.branch.replace('refs/heads/', '') : null, locked: !!wt.locked, prunable: !!wt.prunable };
  });
}

// Repos that hold Claude worktrees, deduplicated by git common dir.
export const repos = (ctx) => ctx.once('repos', () => {
  const byCommon = new Map();
  const commonOf = (p) => (isDir(p) ? sh('git', ['-C', p, 'rev-parse', '--path-format=absolute', '--git-common-dir']) : null);
  for (const p of ctx.projectPaths()) {
    const common = commonOf(p);
    if (!common || byCommon.has(common)) continue;
    const wts = parseWorktrees(p);
    if (!wts.length) continue;
    byCommon.set(common, { main: wts[0].path, worktrees: wts, projectDirs: [] });
  }
  for (const p of ctx.projectPaths()) {
    const common = commonOf(p);
    if (common && byCommon.has(common)) byCommon.get(common).projectDirs.push(p);
  }
  return [...byCommon.values()];
});

// Commits reachable from `ref` and from no ordinary branch or remote.
export function uniqueCommits(cwd, ref) {
  const n = sh('git', ['-C', cwd, 'rev-list', '--count', ref, '--not', '--exclude=worktree-*', '--branches', '--remotes']);
  return n === null ? null : Number(n);
}

export const isClaudeWorktree = (p) => p.includes(`${path.sep}.claude${path.sep}worktrees${path.sep}`);

// Every Claude worktree with what it holds and why it is kept, if it is.
export const worktreeScan = (ctx) => ctx.once('worktrees', async () => {
  const items = [];
  const { cwds, sessions } = ctx.live();
  for (const repo of repos(ctx)) {
    const registered = new Set();
    const inRepo = (cwd) => [repo.main, ...repo.projectDirs].some((d) => cwd === d || cwd.startsWith(d + path.sep));
    const repoSessions = sessions.filter((x) => inRepo(x.cwd));
    for (const wt of repo.worktrees) {
      if (!wt.path || !isClaudeWorktree(wt.path)) continue;
      registered.add(wt.path);
      if (wt.prunable || !isDir(wt.path)) continue;
      const status = sh('git', ['-C', wt.path, 'status', '--porcelain']);
      const dirty = status === null ? null : status.split('\n').filter(Boolean).length;
      const unique = uniqueCommits(wt.path, 'HEAD');
      const inUse = [...cwds].some((cwd) => cwd === wt.path || cwd.startsWith(wt.path + path.sep));
      const born = stat(wt.path)?.birthtimeMs || stat(wt.path)?.mtimeMs || 0;
      const owned = repoSessions.some((x) => x.startedAt && x.startedAt <= born);
      const nodeModulesBytes = await ctx.size(path.join(wt.path, 'node_modules'));
      const age = ageDays(wt.path);

      const reason = wt.locked ? 'locked'
        : inUse ? 'live-session'
        : dirty === null || unique === null ? 'git-error'
        : dirty > 0 ? 'dirty'
        : unique > 0 && !ctx.force ? 'unique-commits'
        : owned && !ctx.force ? 'owned-by-live-session'
        : null;

      const parts = [wt.branch ?? 'detached'];
      if (wt.locked) parts.push('locked: an agent may be running');
      if (inUse) parts.push('a live session is working here');
      else if (owned) parts.push('made during a session still running in this repo: kept unless --force');
      if (dirty) parts.push(`${dirty} uncommitted change(s)`);
      if (unique) parts.push(`${unique} commit(s) on no other branch`);
      if (dirty === null || unique === null) parts.push('git could not read it');
      else if (!dirty && !unique) parts.push('clean, nothing unsaved');
      if (nodeModulesBytes) parts.push(`node_modules ${fmt(nodeModulesBytes)}`);
      parts.push(`${Math.floor(age)}d old`);

      items.push({
        path: wt.path, label: path.basename(wt.path), project: repo.main,
        bytes: await ctx.size(wt.path), ageDays: age,
        cleanable: reason === null, reason, note: parts.join(' · '),
        detail: { branch: wt.branch, dirty, unique, nodeModulesBytes },
        internal: { repo: repo.main, branch: wt.branch, unique, keptForWork: reason === 'dirty' || reason === 'unique-commits' || reason === 'owned-by-live-session' },
      });
    }
    // Directories under .claude/worktrees that git no longer knows about.
    for (const dir of repo.projectDirs) {
      const root = path.join(dir, '.claude', 'worktrees');
      for (const name of ls(root)) {
        const p = path.join(root, name);
        if (registered.has(p) || !isDir(p)) continue;
        items.push({
          path: p, label: name, project: repo.main, bytes: await ctx.size(p), ageDays: ageDays(p),
          cleanable: true, reason: null, note: 'orphan directory: git has no worktree record for it',
          detail: { orphan: true }, internal: { orphan: true },
        });
      }
    }
  }
  return items;
});
