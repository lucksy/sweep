import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { makeSandbox } from '../fixtures/sandbox.mjs';
import { createContext } from '../../engine/context.mjs';
import { sizeOf } from '../../engine/fsx.mjs';

let sbx;
before(() => { sbx = makeSandbox(); });
after(() => sbx.cleanup());

test('sizes from the one-pass prefetch equal du -sk of each folder', async () => {
  const ctx = createContext({ env: sbx.env });
  await ctx.prefetch([[sbx.claude, 4], [sbx.tmpRoot, 2], [path.join(sbx.repo, '.claude', 'worktrees'), 2]]);
  const paths = [
    sbx.claude, path.join(sbx.claude, 'projects'), path.join(sbx.claude, 'plugins', 'cache', 'm', 'p', '1.0'),
    path.join(sbx.claude, 'file-history'), sbx.tmpRoot, path.join(sbx.repo, '.claude', 'worktrees'),
    sbx.wt('agent-clean'), path.join(sbx.wt('agent-clean'), 'node_modules'),
    path.join(sbx.wt('agent-clean'), 'node_modules', 'pkg'),            // deeper than the prefetch: falls back to du
    path.join(sbx.claude, 'settings.json'),                               // a file: its own size
    path.join(sbx.claude, 'does-not-exist'),
  ];
  for (const p of paths) assert.equal(await ctx.size(p), sizeOf(p), p);
  assert.ok(ctx.prefetched() > 10, 'the prefetch measured many folders in one pass');
});
