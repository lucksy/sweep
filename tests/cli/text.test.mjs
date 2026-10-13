import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { footprintBar, renderClean, renderExplain, renderScan, truncateMiddle } from '../../engine/text.mjs';
import { CLEAN, SCAN } from './fixture-result.mjs';

// Compares with tests/cli/snapshots/<name>.txt, writing it when missing (review new snapshots by eye).
function snapshot(name, text) {
  const file = fileURLToPath(new URL(`./snapshots/${name}.txt`, import.meta.url));
  if (!fs.existsSync(file) || process.env.UPDATE_SNAPSHOTS) fs.writeFileSync(file, text);
  assert.equal(text, fs.readFileSync(file, 'utf8'), `${name} differs from its snapshot`);
}

test('scan report', () => snapshot('scan', renderScan(SCAN, { width: 100 })));
test('scan report with details', () => snapshot('scan-details', renderScan(SCAN, { width: 100, details: true })));
test('explain', () => snapshot('explain', renderExplain(SCAN.categories[0], { width: 100 })));
test('clean, done', () => snapshot('clean', renderClean(CLEAN, ['worktrees'], { width: 100 })));
test('clean, dry run', () => snapshot('clean-dry', renderClean({ ...CLEAN, dryRun: true }, ['worktrees', 'tmp-sessions'], { width: 100 })));

test('no line is wider than the width, and warnings come before the table', () => {
  for (const width of [80, 100, 140]) {
    const text = renderScan(SCAN, { width, details: true });
    for (const line of text.split('\n')) assert.ok([...line].length <= width, `${width}: ${line}`);
  }
  const lines = renderScan(SCAN, { width: 100 }).split('\n');
  assert.ok(lines.findIndex((l) => l.startsWith('⚠')) < lines.findIndex((l) => l.includes('  ID ')));
});

test('paths lose their middle, not their ends', () => {
  const t = truncateMiddle('/Users/x/Projects/very-long-name/.claude/worktrees/agent-abc', 30);
  assert.equal(t.length, 30);
  assert.ok(t.startsWith('/Users/x/') && t.endsWith('agent-abc') && t.includes('…'));
  assert.equal(truncateMiddle('short', 30), 'short');
});

test('the footprint bar fills the width exactly', () => {
  const [bar] = footprintBar(SCAN.footprint.parts, 98);
  assert.equal([...bar].length, 98);
});

test('color appears only when asked', () => {
  assert.ok(!renderScan(SCAN).includes('\x1b['));
  assert.ok(renderScan(SCAN, { color: true }).includes('\x1b['));
});
