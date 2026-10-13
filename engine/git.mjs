// Claude's git worktrees: which repos hold them, and whether each one holds work.
// Git runs asynchronously, eight calls at a time.

import path from 'node:path';

import { ageDays, fmt, isDir, limit, ls, shAsync, stat } from './fsx.mjs';

const pool = limit(8);
const git = (args) => pool(() => shAsync('git', args));

export function parseWorktrees(out) {
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

// Repos Claude has been opened in, deduplicated by git common dir, with their worktrees.
export const repos = (ctx) => ctx.once('repos', async () => {
  const paths = ctx.projectPaths().filter(isDir);
  const commons = await Promise.all(paths.map((p) => git(['-C', p, 'rev-parse', '--path-format=absolute', '--git-common-dir'])));
  const byCommon = new Map();
  paths.forEach((p, i) => {
    if (!commons[i]) return;
    if (!byCommon.has(commons[i])) byCommon.set(commons[i], { first: p, projectDirs: [] });
    byCommon.get(commons[i]).projectDirs.push(p);
  });
  const found = await Promise.all([...byCommon.values()].map(async (r) => {
    const worktrees = parseWorktrees(await git(['-C', r.first, 'worktree', 'list', '--porcelain']));
    return worktrees.length ? { main: worktrees[0].path, worktrees, projectDirs: r.projectDirs } : null;
  }));
  return found.filter(Boolean);
});

// Commits reachable from `ref` and from no ordinary branch or remote.
export async function uniqueCommits(cwd, ref) {
  const n = await git(['-C', cwd, 'rev-list', '--count', ref, '--not', '--exclude=worktree-*', '--branches', '--remotes']);
  return n === null ? null : Number(n);
}

export const isClaudeWorktree = (p) => p.includes(`${path.sep}.claude${path.sep}worktrees${path.sep}`);

async function describe(ctx, repo, wt, repoSessions) {
  const { cwds } = ctx.live();
  const [status, unique, nodeModulesBytes, bytes] = await Promise.all([
    git(['-C', wt.path, 'status', '--porcelain']),
    uniqueCommits(wt.path, 'HEAD'),
    ctx.size(path.join(wt.path, 'node_modules')),
    ctx.size(wt.path),
  ]);
  const dirty = status === null ? null : status.split('\n').filter(Boolean).length;
  const inUse = [...cwds].some((cwd) => cwd === wt.path || cwd.startsWith(wt.path + path.sep));
  const born = stat(wt.path)?.birthtimeMs || stat(wt.path)?.mtimeMs || 0;
  const owned = repoSessions.some((x) => x.startedAt && x.startedAt <= born);
  const age = ageDays(wt.path);

  const reason = wt.locked ? 'locked'
    : inUse ? 'live-session'
    : dirty === null || unique === null ? 'git-error'
    : dirty > 0 ? 'dirty'
    : unique > 0 && !ctx.force ? 'unique-commits'
    : owned && !ctx.force ? 'owned-by-live-session'
    : null;

  const discovered = ctx.isForgotten([repo.main, ...repo.projectDirs]);
  const parts = discovered ? ["not in Claude's project list", wt.branch ?? 'detached'] : [wt.branch ?? 'detached'];
  if (wt.locked) parts.push('locked: an agent may be running');
  if (inUse) parts.push('a live session is working here');
  else if (owned) parts.push('made during a session still running in this repo: kept unless --force');
  if (dirty) parts.push(`${dirty} uncommitted change(s)`);
  if (unique) parts.push(`${unique} commit(s) on no other branch`);
  if (dirty === null || unique === null) parts.push('git could not read it');
  else if (!dirty && !unique) parts.push('clean, nothing unsaved');
  if (nodeModulesBytes) parts.push(`node_modules ${fmt(nodeModulesBytes)}`);
  parts.push(`${Math.floor(age)}d old`);

  return {
    path: wt.path, label: path.basename(wt.path), project: repo.main, bytes, ageDays: age,
    cleanable: reason === null, reason, note: parts.join(' · '),
    detail: { branch: wt.branch, dirty, unique, nodeModulesBytes, ...(discovered ? { discovered: true } : {}) },
    internal: { repo: repo.main, branch: wt.branch, unique, keptForWork: reason === 'dirty' || reason === 'unique-commits' || reason === 'owned-by-live-session' },
  };
}

// Every Claude worktree with what it holds and why it is kept, if it is.
export const worktreeScan = (ctx) => ctx.once('worktrees', async () => {
  const { sessions } = ctx.live();
  const perRepo = await Promise.all((await repos(ctx)).map(async (repo) => {
    const inRepo = (cwd) => [repo.main, ...repo.projectDirs].some((d) => cwd === d || cwd.startsWith(d + path.sep));
    const repoSessions = sessions.filter((x) => inRepo(x.cwd));
    const claudeWts = repo.worktrees.filter((wt) => wt.path && isClaudeWorktree(wt.path));
    const registered = new Set(claudeWts.map((wt) => wt.path));
    const items = await Promise.all(claudeWts.filter((wt) => !wt.prunable && isDir(wt.path)).map((wt) => describe(ctx, repo, wt, repoSessions)));
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
    return items;
  }));
  return perRepo.flat();
});
