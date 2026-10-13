import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { makeSandbox } from '../fixtures/sandbox.mjs';

const ENGINE = fileURLToPath(new URL('../../engine/sweep.mjs', import.meta.url));
let sbx;

const sweep = (...args) => execFileSync('node', [ENGINE, ...args], { env: sbx.env, encoding: 'utf8' });
const scan = () => JSON.parse(sweep('scan', '--json'));
const byId = (result, id) => result.categories.find((c) => c.id === id);
const exists = (p) => fs.existsSync(p);
const branches = () => execFileSync('git', ['-C', sbx.repo, 'branch', '--format=%(refname:short)'], { encoding: 'utf8' }).split('\n').filter(Boolean);

before(() => { sbx = makeSandbox(); });
after(() => sbx.cleanup());

test('scan finds one of each leftover and marks what it keeps', () => {
  const result = scan();
  const worktrees = byId(result, 'worktrees').items;
  const item = (name) => worktrees.find((i) => i.path === sbx.wt(name));
  assert.equal(item('agent-clean').cleanable, true);
  assert.equal(item('agent-orphan').cleanable, true);
  assert.equal(item('agent-dirty').cleanable, false);
  assert.equal(item('agent-commit').cleanable, false);

  const cleanableIn = (id) => byId(result, id).items.filter((i) => i.cleanable).length;
  assert.equal(cleanableIn('worktree-deps'), 2);
  assert.equal(cleanableIn('worktree-branches'), 1);
  for (const id of ['tmp-sessions', 'transcripts', 'orphan-projects', 'file-history', 'session-leftovers', 'config-backups']) {
    assert.equal(cleanableIn(id), 1, id);
  }
  assert.equal(cleanableIn('plugin-versions'), 2);
});

test('clean without --yes deletes nothing', () => {
  sweep('clean', 'all');
  assert.ok(exists(sbx.wt('agent-clean')));
  assert.ok(exists(path.join(sbx.home, '.claude.json.backup.123')));
});

test('clean all --yes removes leftovers and keeps work, memory and protected files', () => {
  sweep('clean', 'all', '--yes');

  assert.ok(!exists(sbx.wt('agent-clean')));
  assert.ok(!exists(sbx.wt('agent-orphan')));
  assert.ok(exists(sbx.wt('agent-dirty')) && exists(sbx.wt('agent-commit')));
  assert.ok(!exists(path.join(sbx.wt('agent-dirty'), 'node_modules')));
  assert.equal(fs.readFileSync(path.join(sbx.wt('agent-dirty'), 'a.txt'), 'utf8'), 'changed');

  const left = branches();
  assert.ok(!left.includes('worktree-agent-clean') && !left.includes('worktree-wf_merged'));
  assert.ok(left.includes('worktree-agent-commit') && left.includes('worktree-wf_unique'));

  assert.ok(exists(path.join(sbx.claude, 'projects', '-x', 'memory', 'MEMORY.md')));
  assert.ok(exists(path.join(sbx.claude, 'projects', '-gone', 'memory', 'MEMORY.md')));
  assert.ok(exists(path.join(sbx.claude, 'plugins', 'cache', 'm', 'p', '2.0')));
  assert.ok(!exists(path.join(sbx.claude, 'plugins', 'cache', 'm', 'p', '1.0')));
  for (const p of [path.join(sbx.claude, 'settings.json'), path.join(sbx.home, '.claude.json'), path.join(sbx.home, '.claude.json.backup')]) {
    assert.ok(exists(p), p);
  }

  const again = scan();
  assert.equal(again.categories.reduce((n, c) => n + c.items.filter((i) => i.cleanable).length, 0), 0);
});

test('--force removes a clean worktree with unique commits but keeps its branch', () => {
  sweep('clean', 'worktrees', '--force', '--yes');
  assert.ok(!exists(sbx.wt('agent-commit')));
  assert.ok(branches().includes('worktree-agent-commit'));
  assert.ok(exists(sbx.wt('agent-dirty')), 'a dirty worktree survives --force');
});
