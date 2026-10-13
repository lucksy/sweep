// Where Claude Code keeps things on this machine, and what is running now.
// Computed lazily, once per scan.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';

import { alive, encodeProject, isDir, limit, ls, readJson, sh, shAsync, stat } from './fsx.mjs';
import { createGuard } from './guard.mjs';
import { moveToTrash } from './trash.mjs';

// `du -k` of a folder, or one pass over a tree with `-d depth`: path → bytes.
// du exits non-zero on unreadable folders but still prints what it measured.
function du(args) {
  return new Promise((resolve) => {
    execFile('du', ['-k', ...args], { maxBuffer: 256 << 20 }, (_err, stdout) => {
      const sizes = new Map();
  const pool = limit(8);
  const pending = [];
      for (const line of (stdout || '').split('\n')) {
        const tab = line.indexOf('\t');
        if (tab > 0) sizes.set(line.slice(tab + 1), parseInt(line, 10) * 1024);
      }
      resolve(sizes);
    });
  });
}

// Where people keep code: searched for Claude worktrees ~/.claude.json no longer lists.
const DEFAULT_ROOTS = ['Projects', 'projects', 'code', 'src', 'dev', 'work', 'Developer', 'repos'];

export function createContext({ env = process.env, days = null, force = false, roots = null, trash = false } = {}) {
  // SWEEP_* point the engine alone at another tree (a sandbox) without moving
  // Claude Code's own home, config or login.
  const home = env.SWEEP_HOME || env.HOME || os.homedir();
  const claudeDir = env.SWEEP_CLAUDE_DIR || env.CLAUDE_CONFIG_DIR || path.join(home, '.claude');
  const tmpBase = env.SWEEP_TMPDIR || env.CLAUDE_CODE_TMPDIR || (process.platform === 'darwin' ? '/private/tmp' : '/tmp');
  const tmpRoot = path.join(tmpBase, `claude-${process.getuid ? process.getuid() : 0}`);
  const cliVersions = path.join(home, '.local', 'share', 'claude', 'versions');
  const guard = createGuard({ home, claudeDir, tmpBase, tmpRoot, cliVersions });

  // --roots, then SWEEP_ROOTS, then the defaults that exist; '' turns the search off.
  const rootList = (roots ?? env.SWEEP_ROOTS ?? null) === null
    ? DEFAULT_ROOTS.map((n) => path.join(home, n)).filter(isDir)
    : String(roots ?? env.SWEEP_ROOTS).split(',').map((r) => r.trim()).filter(Boolean).map((r) => r.replace(/^~(?=$|\/)/, home));
  // One spelling per folder: on a case-insensitive disk ~/Projects and ~/projects are the same.
  const realRoots = [...new Set(rootList.flatMap((r) => { try { return [fs.realpathSync.native(r)]; } catch { return []; } }))];
  let discovered = new Set();

  const memo = new Map();
  const once = (key, fn) => { if (!memo.has(key)) memo.set(key, fn()); return memo.get(key); };
  const sizes = new Map();
  const pool = limit(8);
  const pending = [];

  const ctx = {
    home, claudeDir, tmpBase, tmpRoot, cliVersions, force,
    once,
    trash,
    // Delete, or with `trash` move to the Trash; the guard checks the path either way.
    rm: (p) => {
      if (!trash) return guard.rm(p);
      const abs = path.resolve(p);
      guard.check(abs);
      moveToTrash(abs, { home, dir: env.SWEEP_TRASH_DIR || null });
    },
    // For deletions git makes (`git worktree remove`): the same rules, checked first.
    check: (p) => guard.check(path.resolve(p)),
    days: (dflt) => (Number.isFinite(days) ? days : dflt),
    // Measure whole trees once, in parallel: [[root, depth], ...]. Not awaited by
    // scan(): a size inside a tree waits for that tree's pass instead.
    prefetch: (roots) => Promise.all(roots.map(([root, depth]) => {
      const done = du(['-d', String(depth), root]).then((map) => {
        for (const [p, bytes] of map) if (!sizes.has(p)) sizes.set(p, Promise.resolve(bytes));
      });
      pending.push({ root, depth, done });
      return done;
    })),
    prefetched: () => sizes.size,
    // A file's size, a prefetched folder's, or one `du -sk` (eight at a time); once per path per scan.
    size: async (p) => {
      const tree = pending.find(({ root, depth }) => p === root || (p.startsWith(root + path.sep) && path.relative(root, p).split(path.sep).length <= depth));
      if (tree) await tree.done;
      if (!sizes.has(p)) {
        const s = stat(p);
        sizes.set(p, !s ? Promise.resolve(0) : !s.isDirectory() ? Promise.resolve(s.size) : pool(() => du(['-s', p]).then((m) => m.get(p) ?? 0)));
      }
      return sizes.get(p);
    },

    // Sessions whose process is alive: their ids, folders, start times and CLI versions.
    live: () => once('live', () => {
      const ids = new Set(), cwds = new Set(), sessions = [];
      for (const f of ls(path.join(claudeDir, 'sessions'))) {
        const j = f.endsWith('.json') && readJson(path.join(claudeDir, 'sessions', f));
        if (j?.pid && alive(j.pid)) {
          if (j.sessionId) ids.add(j.sessionId);
          if (j.cwd) { cwds.add(j.cwd); sessions.push({ cwd: j.cwd, startedAt: j.startedAt ?? 0, version: j.version }); }
        }
      }
      return { ids, cwds, sessions };
    }),

    claudeJson: () => once('claudeJson', () => readJson(path.join(home, '.claude.json')) ?? {}),

    roots: realRoots,
    // Repos holding .claude/worktrees under the roots (node_modules and .git skipped). Run before projectPaths().
    discover: () => once('discover', async () => {
      const found = await Promise.all(realRoots.map((r) => shAsync('find', [r, '-maxdepth', '5', '(', '-name', 'node_modules', '-o', '-name', '.git', ')', '-prune', '-o', '-type', 'd', '-path', '*/.claude/worktrees', '-print', '-prune'])));
      discovered = new Set(found.flatMap((out) => (out ? out.split('\n').filter(Boolean) : [])).map((p) => path.dirname(path.dirname(p))));
      return discovered;
    }),
    // A repo none of whose folders Claude Code lists or runs in: found by the roots search alone.
    isForgotten: (dirs) => {
      const known = new Set([...Object.keys(ctx.claudeJson().projects ?? {}), ...ctx.live().cwds]);
      return dirs.some((d) => discovered.has(d)) && !dirs.some((d) => known.has(d));
    },

    // Every directory Claude Code has been opened in, and repos found under the roots.
    projectPaths: () => once('projects', () => {
      const set = new Set(Object.keys(ctx.claudeJson().projects ?? {}));
      for (const cwd of ctx.live().cwds) set.add(cwd);
      for (const repo of discovered) set.add(repo);
      return [...set];
    }),

    // Encoded folder name (as in ~/.claude/projects and the temp root) → original path.
    knownProjects: () => once('known', () => new Map(ctx.projectPaths().map((p) => [encodeProject(p), p]))),

    cliVersion: () => once('cliVersion', () => sh('claude', ['--version'])?.split(' ')[0] ?? null),
  };
  return ctx;
}
