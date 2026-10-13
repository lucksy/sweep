import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { makeSandbox } from '../fixtures/sandbox.mjs';

const ENGINE = fileURLToPath(new URL('../../engine/sweep.mjs', import.meta.url));
let sbx;
const scan = () => JSON.parse(execFileSync('node', [ENGINE, 'scan', '--json'], { env: sbx.env, encoding: 'utf8' }));

before(() => { sbx = makeSandbox(); });
after(() => sbx.cleanup());

const isInt = (n) => Number.isInteger(n) && n >= 0;
const keys = (o) => Object.keys(o).sort();

test('scan --json is the schema-1 contract', () => {
  const r = scan();
  assert.deepEqual(keys(r), ['ageBuckets', 'categories', 'disk', 'durationMs', 'footprint', 'host', 'info', 'options', 'projects', 'scannedAt', 'schema', 'tool', 'totals', 'warnings']);
  assert.equal(r.schema, 1);
  assert.equal(r.tool.name, 'sweep');
  assert.match(r.tool.version, /^\d+\.\d+\.\d+$/);
  assert.ok(!Number.isNaN(Date.parse(r.scannedAt)));
  assert.ok(isInt(r.durationMs));
  assert.deepEqual(keys(r.options), ['days', 'force']);
  assert.deepEqual(keys(r.host), ['claudeDir', 'cliVersion', 'platform', 'tmpRoot']);
  assert.deepEqual(keys(r.totals), ['keptBytes', 'reclaimableBytes', 'safeBytes']);
  for (const v of Object.values(r.totals)) assert.ok(isInt(v));
  assert.equal(r.categories.length, 13);
  for (const c of r.categories) {
    assert.deepEqual(keys(c), ['cleanable', 'error', 'found', 'foundBytes', 'group', 'id', 'items', 'reclaimableBytes', 'risk', 'text', 'title']);
    assert.match(c.risk, /^(safe|caution|review)$/);
    assert.deepEqual(keys(c.text), ['claude', 'creates', 'sweep']);
    assert.equal(c.error, null, c.id);
    assert.equal(c.found, c.items.length);
    assert.equal(c.cleanable, c.items.filter((i) => i.cleanable).length);
    assert.equal(c.reclaimableBytes, c.items.filter((i) => i.cleanable).reduce((t, i) => t + i.bytes, 0));
    for (const i of c.items) {
      assert.deepEqual(keys(i), ['ageDays', 'bytes', 'cleanable', 'detail', 'id', 'label', 'note', 'path', 'project', 'reason'], c.id);
      assert.match(i.id, /^i_[0-9a-f]{10}$/);
      assert.ok(isInt(i.bytes));
      assert.equal(typeof i.cleanable, 'boolean');
      assert.equal(i.reason === null, i.cleanable, `${c.id}: reason is set exactly when kept`);
    }
  }
  for (const i of r.info) assert.deepEqual(keys(i), ['key', 'text', 'value']);
});

test('item ids are the same across two scans of unchanged files', () => {
  const ids = (r) => r.categories.flatMap((c) => c.items.map((i) => i.id)).sort();
  assert.deepEqual(ids(scan()), ids(scan()));
});
