// Where Claude Code keeps things on this machine, and what is running now.
// Computed lazily, once per scan.

import os from 'node:os';
import path from 'node:path';

import { alive, encodeProject, ls, readJson, sh, sizeOf } from './fsx.mjs';
import { createGuard } from './guard.mjs';

export function createContext({ env = process.env, days = null, force = false } = {}) {
  const home = env.HOME || os.homedir();
  const claudeDir = env.CLAUDE_CONFIG_DIR || path.join(home, '.claude');
  const tmpBase = env.CLAUDE_CODE_TMPDIR || (process.platform === 'darwin' ? '/private/tmp' : '/tmp');
  const tmpRoot = path.join(tmpBase, `claude-${process.getuid ? process.getuid() : 0}`);
  const cliVersions = path.join(home, '.local', 'share', 'claude', 'versions');
  const guard = createGuard({ home, claudeDir, tmpBase, tmpRoot, cliVersions });

  const memo = new Map();
  const once = (key, fn) => { if (!memo.has(key)) memo.set(key, fn()); return memo.get(key); };
  const sizes = new Map();

  const ctx = {
    home, claudeDir, tmpBase, tmpRoot, cliVersions, force,
    once,
    rm: (p) => guard.rm(p),
    // For deletions git makes (`git worktree remove`): the same rules, checked first.
    check: (p) => guard.check(path.resolve(p)),
    days: (dflt) => (Number.isFinite(days) ? days : dflt),
    // Measured once per path per scan.
    size: async (p) => {
      if (!sizes.has(p)) sizes.set(p, sizeOf(p));
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

    // Every directory Claude Code has been opened in.
    projectPaths: () => once('projects', () => {
      const set = new Set(Object.keys(ctx.claudeJson().projects ?? {}));
      for (const cwd of ctx.live().cwds) set.add(cwd);
      return [...set];
    }),

    // Encoded folder name (as in ~/.claude/projects and the temp root) → original path.
    knownProjects: () => once('known', () => new Map(ctx.projectPaths().map((p) => [encodeProject(p), p]))),

    cliVersion: () => once('cliVersion', () => sh('claude', ['--version'])?.split(' ')[0] ?? null),
  };
  return ctx;
}
