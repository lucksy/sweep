import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { makeSandbox } from '../fixtures/sandbox.mjs';

const ENGINE = fileURLToPath(new URL('../../engine/sweep.mjs', import.meta.url));
const git = (cwd, ...args) => execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', ...args], { cwd, stdio: 'pipe' });
let sbx, forgotten, decoy;

// A repo Claude no longer lists, with a clean agent worktree, under ~/Projects;
// and a decoy .claude/worktrees inside node_modules that must not be searched.
before(() => {
  sbx = makeSandbox();
  const repo = path.join(sbx.home, 'Projects', 'old-app');
  fs.mkdirSync(repo, { recursive: true });
  git(repo, 'init', '-q', '-b', 'main');
  fs.writeFileSync(path.join(repo, 'a.txt'), 'a');
  git(repo, 'add', '.');
  git(repo, 'commit', '-qm', 'init');
  forgotten = path.join(repo, '.claude', 'worktrees', 'agent-old');
  git(repo, 'worktree', 'add', '-q', '-b', 'worktree-agent-old', forgotten);
  decoy = path.join(sbx.home, 'Projects', 'x', 'node_modules', 'pkg', '.claude', 'worktrees', 'agent-decoy');
  fs.mkdirSync(decoy, { recursive: true });
});
after(() => sbx.cleanup());

const scan = (...args) => JSON.parse(execFileSync('node', [ENGINE, 'scan', '--json', ...args], { env: sbx.env, encoding: 'utf8' }));
const worktreePaths = (r) => r.categories.find((c) => c.id === 'worktrees').items.map((i) => i.path);

test('a worktree in a repo Claude no longer lists is found under ~/Projects (a default root)', () => {
  const r = scan();
  const item = r.categories.find((c) => c.id === 'worktrees').items.find((i) => i.path === forgotten);
  assert.ok(item, 'found');
  assert.equal(item.detail.discovered, true);
  assert.match(item.note, /^not in Claude's project list · /);
  assert.equal(item.cleanable, true);
  assert.ok(!worktreePaths(r).some((p) => p.includes('node_modules')), 'node_modules not searched');
});

test('--roots chooses the folders; an empty value turns the search off', () => {
  assert.ok(!worktreePaths(scan('--roots', '')).includes(forgotten));
  assert.ok(worktreePaths(scan('--roots', path.join(sbx.home, 'Projects'))).includes(forgotten));
  assert.ok(!worktreePaths(scan('--roots', path.join(sbx.home, 'elsewhere'))).includes(forgotten));
});

test('SWEEP_ROOTS works like --roots', () => {
  const r = JSON.parse(execFileSync('node', [ENGINE, 'scan', '--json'], { env: { ...sbx.env, SWEEP_ROOTS: '' }, encoding: 'utf8' }));
  assert.ok(!worktreePaths(r).includes(forgotten));
});

test('a repo Claude knows is not marked forgotten, whatever spelling the search finds it under', () => {
  const r = scan('--roots', `${sbx.home},${sbx.home.toUpperCase()}`);
  const known = r.categories.find((c) => c.id === 'worktrees').items.filter((i) => i.path.startsWith(sbx.repo));
  assert.ok(known.length > 0);
  assert.ok(known.every((i) => !i.detail.discovered), 'the sandbox repo is in ~/.claude.json');
});
