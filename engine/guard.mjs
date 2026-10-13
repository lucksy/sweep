// The one door every deletion goes through. A path may be removed only if it
// sits inside a known Claude Code location, both as written and with its
// parent folders' symlinks resolved, and is not one of the files people keep.

import fs from 'node:fs';
import path from 'node:path';

const PROTECTED = [
  'settings.json', 'settings.local.json', '.credentials.json', 'CLAUDE.md', 'history.jsonl',
  'agent-memory', 'jobs', 'daemon', 'skills', 'commands', 'agents',
  'plugins/installed_plugins.json', 'plugins/known_marketplaces.json',
];

const real = (p) => { try { return fs.realpathSync(p); } catch { return null; } };
const inside = (p, root) => p.startsWith(root + path.sep);

// The path with every parent folder's symlinks resolved; the last part stays
// as written so a symlink itself is removed as a link.
function resolvedParent(abs) {
  let dir = path.dirname(abs);
  const rest = [path.basename(abs)];
  while (!real(dir)) {
    rest.unshift(path.basename(dir));
    dir = path.dirname(dir);
  }
  return path.join(real(dir), ...rest);
}

export function createGuard({ home, claudeDir, tmpBase, tmpRoot, cliVersions }) {
  const roots = [claudeDir, tmpRoot, cliVersions];
  const protectedPaths = PROTECTED.map((p) => path.join(claudeDir, p));

  function allowed(abs, { home, claudeDir, tmpBase }, rootList) {
    if (rootList.some((r) => inside(abs, r))) return true;
    if (path.dirname(abs) === tmpBase && /^claude-[0-9a-f]+-cwd$/.test(path.basename(abs))) return true;
    if (abs.includes(`${path.sep}.claude${path.sep}worktrees${path.sep}`)) return true;
    return path.dirname(abs) === home && /^\.claude\.json\..+/.test(path.basename(abs));
  }

  function check(abs) {
    const asWritten = { home, claudeDir, tmpBase };
    const resolved = { home: real(home) ?? home, claudeDir: real(claudeDir) ?? claudeDir, tmpBase: real(tmpBase) ?? tmpBase };
    const resolvedRoots = roots.map((r) => real(r) ?? r);
    const target = resolvedParent(abs);
    if (!allowed(abs, asWritten, roots) || !allowed(target, resolved, resolvedRoots)) {
      throw new Error(`refusing to delete outside known Claude locations: ${abs}`);
    }
    const resolvedProtected = PROTECTED.map((p) => path.join(resolved.claudeDir, p));
    for (const [p, list] of [[abs, protectedPaths], [target, resolvedProtected]]) {
      if (list.some((q) => p === q || inside(p, q))) throw new Error(`refusing to delete protected path: ${abs}`);
      if (/[/\\]projects[/\\][^/\\]+[/\\]memory([/\\]|$)/.test(p)) throw new Error(`refusing to delete auto-memory: ${abs}`);
    }
  }

  return {
    check,
    rm(p) {
      const abs = path.resolve(p);
      check(abs);
      fs.rmSync(abs, { recursive: true, force: true });
    },
  };
}
