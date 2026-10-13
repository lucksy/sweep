// Builds a throwaway HOME, ~/.claude, temp root and git repo that hold one of
// every kind of storage sweep finds, so tests never touch the real machine.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const OLD = new Date('2026-01-01T00:00:00Z');
const SESSION = '11111111-2222-3333-4444-555555555555';
const GONE_SESSION = '99999999-2222-3333-4444-555555555555';

const git = (cwd, ...args) => execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', '-c', 'core.hooksPath=/dev/null', ...args], { cwd, stdio: 'pipe' });

function write(file, text = 'x') {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text);
}

// Back-date a file or a whole tree so age-based categories pick it up.
function age(p) {
  const s = fs.lstatSync(p);
  if (s.isDirectory()) for (const n of fs.readdirSync(p)) age(path.join(p, n));
  fs.lutimesSync(p, OLD, OLD);
}

export function makeSandbox() {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'sweep-sbx-')));
  const home = path.join(root, 'home');
  const claude = path.join(home, '.claude');
  const tmpBase = path.join(root, 'tmp');
  const tmpRoot = path.join(tmpBase, `claude-${process.getuid()}`);
  const repo = path.join(home, 'repo');
  const wt = (name) => path.join(repo, '.claude', 'worktrees', name);

  // A repo with clean, dirty and unique-commit agent worktrees, each with node_modules.
  fs.mkdirSync(repo, { recursive: true });
  git(repo, 'init', '-q', '-b', 'main');
  write(path.join(repo, '.gitignore'), 'node_modules\n');
  write(path.join(repo, 'a.txt'), 'a');
  git(repo, 'add', '.');
  git(repo, 'commit', '-qm', 'init');
  for (const name of ['agent-clean', 'agent-dirty', 'agent-commit']) {
    git(repo, 'worktree', 'add', '-q', '-b', `worktree-${name}`, wt(name));
    write(path.join(wt(name), 'node_modules', 'pkg', 'blob'), 'x'.repeat(300_000));
  }
  write(path.join(wt('agent-dirty'), 'a.txt'), 'changed');
  write(path.join(wt('agent-commit'), 'b.txt'), 'b');
  git(wt('agent-commit'), 'add', 'b.txt');
  git(wt('agent-commit'), 'commit', '-qm', 'unique');
  git(repo, 'branch', 'worktree-wf_merged');
  git(repo, 'checkout', '-q', '-b', 'side');
  write(path.join(repo, 'c.txt'), 'c');
  git(repo, 'add', 'c.txt');
  git(repo, 'commit', '-qm', 'side');
  git(repo, 'branch', 'worktree-wf_unique');
  git(repo, 'checkout', '-q', 'main');
  git(repo, 'branch', '-q', '-D', 'side');
  write(path.join(wt('agent-orphan'), 'x', 'f'));

  write(path.join(home, '.claude.json'), JSON.stringify({ projects: { [repo]: {} } }));

  // Claude's own folders: one leftover of each kind, plus protected files.
  write(path.join(tmpRoot, '-proj', SESSION, 'scratchpad', 'node_modules', 'f'), 'hi');
  write(path.join(claude, 'plugins', 'installed_plugins.json'), JSON.stringify({ version: 2, plugins: { 'p@m': [{ installPath: path.join(claude, 'plugins', 'cache', 'm', 'p', '2.0') }] } }));
  write(path.join(claude, 'plugins', 'cache', 'm', 'p', '1.0', 'f'));
  write(path.join(claude, 'plugins', 'cache', 'm', 'p', '2.0', 'f'));
  write(path.join(claude, 'plugins', 'cache', 'temp_git_1', 'f'));
  write(path.join(claude, 'projects', '-x', `${SESSION}.jsonl`), JSON.stringify({ cwd: repo }));
  write(path.join(claude, 'projects', '-x', SESSION, 'subagents', 'a.jsonl'));
  write(path.join(claude, 'projects', '-x', 'memory', 'MEMORY.md'), 'm');
  write(path.join(claude, 'projects', '-gone', `${GONE_SESSION}.jsonl`), JSON.stringify({ cwd: '/nonexistent/gone' }));
  write(path.join(claude, 'projects', '-gone', 'memory', 'MEMORY.md'), 'm');
  write(path.join(claude, 'file-history', SESSION, 'f'));
  write(path.join(claude, 'shell-snapshots', 'snap.sh'));
  write(path.join(claude, 'settings.json'), '{}');
  fs.mkdirSync(path.join(claude, 'sessions'), { recursive: true });
  write(path.join(home, '.claude.json.backup.123'));
  write(path.join(home, '.claude.json.backup'));

  for (const p of [tmpRoot, path.join(claude, 'plugins', 'cache'), path.join(claude, 'projects', '-x'), path.join(claude, 'projects', '-gone'),
    path.join(claude, 'file-history'), path.join(claude, 'shell-snapshots'), path.join(home, '.claude.json.backup.123')]) age(p);

  return {
    root, home, claude, tmpRoot, repo, wt,
    env: { ...process.env, HOME: home, CLAUDE_CONFIG_DIR: claude, CLAUDE_CODE_TMPDIR: tmpBase, NO_COLOR: '1' },
    cleanup: () => {
      fs.rmSync(root, { recursive: true, force: true });
    },
  };
}
