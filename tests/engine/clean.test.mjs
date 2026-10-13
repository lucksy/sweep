import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFile, execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { makeSandbox } from '../fixtures/sandbox.mjs';

const ENGINE = fileURLToPath(new URL('../../engine/sweep.mjs', import.meta.url));
const sweep = (sbx, ...args) => execFileSync('node', [ENGINE, ...args], { env: sbx.env, encoding: 'utf8' });
const json = (sbx, ...args) => JSON.parse(sweep(sbx, ...args, '--json'));
const itemAt = (scan, category, p) => scan.categories.find((c) => c.id === category).items.find((i) => i.path === p);

function listing(root) {
  const out = [];
  const walk = (d) => { for (const n of fs.readdirSync(d)) { const p = path.join(d, n); out.push(p); if (fs.lstatSync(p).isDirectory()) walk(p); } };
  walk(root);
  return out.sort();
}

function withSandbox(fn) {
  return async () => {
    const sbx = makeSandbox();
    try { await fn(sbx); } finally { sbx.cleanup(); }
  };
}

test('--only deletes exactly the named items', withSandbox((sbx) => {
  const scan = json(sbx, 'scan');
  const wt = itemAt(scan, 'worktrees', sbx.wt('agent-clean'));
  const backup = itemAt(scan, 'config-backups', path.join(sbx.home, '.claude.json.backup.123'));
  const result = json(sbx, 'clean', 'all', '--only', `${wt.id},${backup.id}`, '--yes');
  assert.equal(result.dryRun, false);
  assert.deepEqual(result.removed.map((r) => r.id).sort(), [wt.id, backup.id].sort());
  assert.equal(result.freedBytes, wt.bytes + backup.bytes);
  assert.ok(!fs.existsSync(sbx.wt('agent-clean')));
  assert.ok(fs.existsSync(sbx.wt('agent-orphan')), 'not named, not touched');
  assert.ok(fs.existsSync(path.join(sbx.claude, 'file-history')), 'not named, not touched');
}));

test('an item that changed since the scan is skipped, not deleted; unknown ids are reported', withSandbox((sbx) => {
  const scan = json(sbx, 'scan');
  const wt = itemAt(scan, 'worktrees', sbx.wt('agent-clean'));
  fs.writeFileSync(path.join(sbx.wt('agent-clean'), 'new-work.txt'), 'unsaved');
  const result = json(sbx, 'clean', 'worktrees', '--only', `${wt.id},i_0000000000`, '--yes');
  assert.deepEqual(result.removed, []);
  assert.deepEqual(result.skipped.map((s) => [s.id, s.reason]).sort(), [[wt.id, 'no-longer-cleanable'], ['i_0000000000', 'unknown-id']].sort());
  assert.ok(fs.existsSync(path.join(sbx.wt('agent-clean'), 'new-work.txt')));
}));

test('a dry run reports what would go and deletes nothing', withSandbox((sbx) => {
  const before = listing(sbx.root);
  const result = json(sbx, 'clean', 'safe');
  assert.equal(result.dryRun, true);
  assert.ok(result.removed.length > 0);
  assert.equal(result.freedBytes, result.removed.reduce((t, r) => t + r.bytes, 0));
  assert.ok(result.kept.every((k) => typeof k.reason === 'string'));
  assert.deepEqual(listing(sbx.root), before);
}));

test('--progress writes NDJSON to stderr and leaves stdout pure JSON', withSandbox((sbx) => {
  for (const args of [['scan'], ['clean', 'safe']]) {
    const run = spawnSync('node', [ENGINE, ...args, '--json', '--progress'], { env: sbx.env, encoding: 'utf8' });
    assert.equal(run.status, 0);
    JSON.parse(run.stdout);
    const events = run.stderr.trim().split('\n').map((l) => JSON.parse(l));
    assert.equal(events.at(-1).event, 'done');
    assert.ok(events.some((e) => e.event === 'category' && Number.isInteger(e.index) && e.total >= 1), args[0]);
  }
  const run = spawnSync('node', [ENGINE, 'clean', 'config-backups', '--yes', '--json', '--progress'], { env: sbx.env, encoding: 'utf8' });
  assert.ok(run.stderr.split('\n').filter(Boolean).map((l) => JSON.parse(l)).some((e) => e.event === 'removed' && e.bytes >= 0));
}));

test('scan writes nothing, and clean only deletes', withSandbox((sbx) => {
  const before = listing(sbx.root);
  sweep(sbx, 'scan', '--json');
  assert.deepEqual(listing(sbx.root), before, 'scan created or removed nothing');
  sweep(sbx, 'clean', 'all', '--yes');
  const after = listing(sbx.root);
  const created = after.filter((p) => !before.includes(p));
  assert.deepEqual(created, [], 'clean created nothing');
}));

test('two cleans at once both finish and leave the same result as one', withSandbox(async (sbx) => {
  const go = () => new Promise((resolve) => execFile('node', [ENGINE, 'clean', 'all', '--yes', '--json'], { env: sbx.env, encoding: 'utf8' }, (err, stdout) => resolve({ code: err?.code ?? 0, out: JSON.parse(stdout) })));
  const [a, b] = await Promise.all([go(), go()]);
  for (const r of [a, b]) assert.ok(r.code === 0 || r.code === 1, `exit ${r.code}`);
  assert.ok(!fs.existsSync(sbx.wt('agent-clean')) && !fs.existsSync(sbx.wt('agent-orphan')));
  assert.ok(fs.existsSync(sbx.wt('agent-dirty')) && fs.existsSync(sbx.wt('agent-commit')));
  assert.ok(fs.existsSync(path.join(sbx.claude, 'settings.json')) && fs.existsSync(path.join(sbx.home, '.claude.json')));
  assert.ok(fs.existsSync(path.join(sbx.claude, 'projects', '-gone', 'memory', 'MEMORY.md')));
  const again = json(sbx, 'scan');
  assert.equal(again.categories.reduce((n, c) => n + c.cleanable, 0), 0);
}));
