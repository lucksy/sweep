import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createContext } from '../../engine/context.mjs';

test('SWEEP_* point the engine alone at another tree, ahead of HOME and Claude settings', () => {
  const ctx = createContext({ env: { HOME: '/real', CLAUDE_CONFIG_DIR: '/real/.claude', CLAUDE_CODE_TMPDIR: '/real-tmp', SWEEP_HOME: '/sbx/home', SWEEP_CLAUDE_DIR: '/sbx/home/.claude', SWEEP_TMPDIR: '/sbx/tmp' } });
  assert.equal(ctx.home, '/sbx/home');
  assert.equal(ctx.claudeDir, '/sbx/home/.claude');
  assert.equal(ctx.tmpBase, '/sbx/tmp');
  const plain = createContext({ env: { HOME: '/real' } });
  assert.equal(plain.claudeDir, '/real/.claude');
});
