import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { makeSandbox } from '../fixtures/sandbox.mjs';

const ENGINE = fileURLToPath(new URL('../../engine/sweep.mjs', import.meta.url));

function withSandbox(fn) {
  return () => {
    const sbx = makeSandbox();
    const trash = path.join(sbx.root, 'Trash');
    fs.mkdirSync(trash);
    try { fn(sbx, trash, { ...sbx.env, SWEEP_TRASH_DIR: trash }); } finally { fs.chmodSync(trash, 0o755); sbx.cleanup(); }
  };
}

test('--trash moves what a delete would remove into the Trash, keeping the same survivors', withSandbox((sbx, trash, env) => {
  const result = JSON.parse(execFileSync('node', [ENGINE, 'clean', 'all', '--trash', '--yes', '--json'], { env, encoding: 'utf8' }));
  assert.equal(result.mode, 'trash');
  assert.equal(result.failed.length, 0);
  assert.ok(!fs.existsSync(sbx.wt('agent-clean')), 'gone from its place');
  assert.ok(fs.readdirSync(trash).includes('agent-clean'), 'in the Trash');
  assert.ok(fs.readdirSync(trash).includes('.claude.json.backup.123'));
  assert.ok(fs.existsSync(sbx.wt('agent-dirty')) && fs.existsSync(sbx.wt('agent-commit')), 'work is kept, as in a delete');
  assert.ok(fs.existsSync(path.join(sbx.claude, 'projects', '-gone', 'memory', 'MEMORY.md')));
  const worktrees = execFileSync('git', ['-C', sbx.repo, 'worktree', 'list'], { encoding: 'utf8' });
  assert.ok(!worktrees.includes('agent-clean'), 'git no longer records the trashed worktree');
  const branches = execFileSync('git', ['-C', sbx.repo, 'branch'], { encoding: 'utf8' });
  assert.ok(!branches.includes('worktree-agent-clean') && branches.includes('worktree-agent-commit'));
}));

test('two items with one name both reach the Trash', withSandbox((sbx, trash, env) => {
  fs.writeFileSync(path.join(trash, '.claude.json.backup.123'), 'already here');
  execFileSync('node', [ENGINE, 'clean', 'config-backups', '--trash', '--yes'], { env });
  assert.equal(fs.readdirSync(trash).filter((n) => n.startsWith('.claude.json.backup.123')).length, 2);
}));

test('an item the Trash refuses is reported as failed and left in place, never deleted', withSandbox((sbx, trash, env) => {
  fs.chmodSync(trash, 0o555);
  const run = spawnSync('node', [ENGINE, 'clean', 'config-backups', '--trash', '--yes', '--json'], { env, encoding: 'utf8' });
  assert.equal(run.status, 1);
  assert.equal(JSON.parse(run.stdout).failed.length, 1);
  assert.ok(fs.existsSync(path.join(sbx.home, '.claude.json.backup.123')));
}));

test('a plain clean reports mode delete', withSandbox((sbx, trash, env) => {
  const result = JSON.parse(execFileSync('node', [ENGINE, 'clean', 'config-backups', '--yes', '--json'], { env, encoding: 'utf8' }));
  assert.equal(result.mode, 'delete');
  assert.deepEqual(fs.readdirSync(trash), []);
}));
