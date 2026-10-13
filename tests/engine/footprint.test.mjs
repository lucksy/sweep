import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { makeSandbox } from '../fixtures/sandbox.mjs';
import { ageBuckets, computeWarnings, rollupProjects } from '../../engine/footprint.mjs';

const ENGINE = fileURLToPath(new URL('../../engine/sweep.mjs', import.meta.url));
const GB = 1024 ** 3;
let sbx;
const scan = () => JSON.parse(execFileSync('node', [ENGINE, 'scan', '--json'], { env: sbx.env, encoding: 'utf8' }));

before(() => { sbx = makeSandbox(); });
after(() => sbx.cleanup());

test('footprint parts add up to the total, and disk space is reported', () => {
  const r = scan();
  assert.ok(r.footprint.parts.length >= 7);
  assert.equal(r.footprint.parts.reduce((t, p) => t + p.bytes, 0), r.footprint.totalBytes);
  for (const p of r.footprint.parts) assert.deepEqual(Object.keys(p).sort(), ['bytes', 'key', 'label']);
  const keys = r.footprint.parts.map((p) => p.key);
  for (const k of ['claude.projects', 'claude.plugins', 'claude.fileHistory', 'claude.other', 'claudeJson', 'tmp', 'worktrees', 'cli']) assert.ok(keys.includes(k), k);
  assert.ok(r.footprint.parts.find((p) => p.key === 'worktrees').bytes > 600_000, 'the sandbox worktrees carry node_modules');
  assert.ok(r.disk.totalBytes > 0 && r.disk.freeBytes > 0 && r.disk.freeBytes <= r.disk.totalBytes);
  assert.equal(typeof r.disk.path, 'string');
});

test('projects roll up per category, with gone projects marked', () => {
  const r = scan();
  const repo = r.projects.find((p) => p.path === sbx.repo);
  assert.ok(repo.exists);
  assert.ok(repo.byCategory.worktrees > 0);
  assert.equal(repo.reclaimableBytes, Object.values(repo.byCategory).reduce((t, b) => t + b, 0));
  const gone = r.projects.find((p) => p.path === '/nonexistent/gone');
  assert.equal(gone.exists, false);
  assert.deepEqual(r.projects.map((p) => p.reclaimableBytes), [...r.projects.map((p) => p.reclaimableBytes)].sort((a, b) => b - a));
});

test('age buckets split reclaimable bytes by age and risk', () => {
  const buckets = ageBuckets([
    { risk: 'safe', items: [{ cleanable: true, bytes: 10, ageDays: 0 }, { cleanable: true, bytes: 5, ageDays: 200 }, { cleanable: false, bytes: 99, ageDays: 3 }] },
    { risk: 'caution', items: [{ cleanable: true, bytes: 7, ageDays: 45 }, { cleanable: true, bytes: 3, ageDays: null }] },
  ]);
  assert.deepEqual(buckets.map((b) => b.label), ['< 1 d', '1–7 d', '7–30 d', '30–90 d', '> 90 d']);
  assert.deepEqual(buckets.map((b) => b.bytes), [10, 0, 0, 7, 5]);
  assert.deepEqual(buckets[3].byRisk, { safe: 0, caution: 7, review: 0 });
});

test('rollupProjects ignores items without a project', () => {
  const rows = rollupProjects([{ id: 'x', items: [{ project: null, cleanable: true, bytes: 5 }, { project: '/p', cleanable: true, bytes: 3 }, { project: '/p', cleanable: false, bytes: 2 }] }]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].bytes, 5);
  assert.equal(rows[0].reclaimableBytes, 3);
});

test('each warning has a case that raises it and one that does not', () => {
  const base = { disk: { totalBytes: 100 * GB, freeBytes: 50 * GB }, bigFiles: [], settingsState: 'ok', worktreeCounts: [] };
  const codes = (w) => computeWarnings({ ...base, ...w }).map((x) => x.code);
  assert.deepEqual(codes({}), []);
  assert.deepEqual(codes({ disk: { totalBytes: 100 * GB, freeBytes: 9 * GB } }), ['low-disk']);
  assert.deepEqual(codes({ disk: { totalBytes: 100 * GB, freeBytes: 10 * GB } }), []);
  assert.deepEqual(codes({ bigFiles: [{ path: '/t/a.output', bytes: 6 * GB }] }), ['runaway-output']);
  assert.deepEqual(codes({ settingsState: 'unreadable' }), ['sweep-paused']);
  assert.deepEqual(codes({ settingsState: 'invalid' }), ['sweep-paused']);
  assert.deepEqual(codes({ worktreeCounts: [{ repo: '/r', count: 10 }] }), ['many-worktrees']);
  assert.deepEqual(codes({ worktreeCounts: [{ repo: '/r', count: 9 }] }), []);
  for (const w of computeWarnings({ ...base, bigFiles: [{ path: '/t/a.output', bytes: 6 * GB }] })) assert.equal(typeof w.text, 'string');
});

test('a 5 GB task output in the temp root and broken settings raise warnings in a scan', () => {
  const big = path.join(sbx.tmpRoot, '-proj', 'tasks-session', 'tasks', 'b1.output');
  fs.mkdirSync(path.dirname(big), { recursive: true });
  const fd = fs.openSync(big, 'w');
  fs.ftruncateSync(fd, 5 * GB + 1);  // sparse: no real disk used
  fs.closeSync(fd);
  fs.writeFileSync(path.join(sbx.claude, 'settings.json'), '{ not json');
  try {
    const r = scan();
    const codes = r.warnings.map((w) => w.code);
    assert.ok(codes.includes('runaway-output'));
    assert.ok(codes.includes('sweep-paused'));
    assert.equal(r.warnings.find((w) => w.code === 'runaway-output').path, big);
  } finally {
    fs.rmSync(path.dirname(path.dirname(big)), { recursive: true, force: true });
    fs.writeFileSync(path.join(sbx.claude, 'settings.json'), '{}');
  }
});
