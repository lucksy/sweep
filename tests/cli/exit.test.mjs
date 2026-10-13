import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { makeSandbox } from '../fixtures/sandbox.mjs';
import { supported } from '../../engine/platform.mjs';

const ENGINE = fileURLToPath(new URL('../../engine/sweep.mjs', import.meta.url));
const run = (sbx, ...args) => spawnSync('node', [ENGINE, ...args], { env: sbx.env, encoding: 'utf8' });

test('exit codes: 0 success, 1 a failed delete, 2 usage', () => {
  const sbx = makeSandbox();
  try {
    assert.equal(run(sbx, 'scan').status, 0);
    assert.equal(run(sbx, 'clean', 'safe').status, 0, 'dry run');
    for (const args of [['nope'], ['clean'], ['clean', 'bogus'], ['explain', 'bogus']]) {
      const r = run(sbx, ...args);
      assert.equal(r.status, 2, args.join(' '));
      assert.match(r.stderr, /worktrees/, 'lists the category ids');
    }
    fs.chmodSync(sbx.home, 0o555);  // the stray backup in HOME can't be removed
    const r = run(sbx, 'clean', 'config-backups', '--yes', '--json');
    fs.chmodSync(sbx.home, 0o755);
    assert.equal(r.status, 1);
    assert.equal(JSON.parse(r.stdout).failed.length, 1);
    assert.ok(fs.existsSync(path.join(sbx.home, '.claude.json.backup.123')));
  } finally {
    fs.chmodSync(sbx.home, 0o755);
    sbx.cleanup();
  }
});

test('exit 3 on platforms sweep does not support', () => {
  assert.equal(supported('darwin'), true);
  assert.equal(supported('linux'), true);
  assert.equal(supported('win32'), false);
});

test('--json prints the engine result and nothing else; aliases scan', () => {
  const sbx = makeSandbox();
  try {
    const out = run(sbx, 'scan', '--json').stdout;
    assert.equal(JSON.parse(out).schema, 1);
    for (const alias of [['list'], ['ls'], ['-list'], ['--list'], []]) assert.match(run(sbx, ...alias).stdout, /sweep: storage Claude Code leaves behind/, alias.join(' ') || '(none)');
  } finally {
    sbx.cleanup();
  }
});
