import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const read = (name) => fs.readFileSync(fileURLToPath(new URL(`../../skills/${name}/SKILL.md`, import.meta.url)), 'utf8');

test('skills reach the engine only, and never name a delete command', () => {
  for (const name of ['scan', 'clean', 'explain']) {
    const text = read(name);
    assert.match(text, /^allowed-tools: Bash\(node \$\{CLAUDE_PLUGIN_ROOT\}\/engine\/sweep\.mjs \*\)$/m, name);
    assert.match(text, new RegExp(`^name: ${name}$`, 'm'), name);
    for (const bad of [/\brm\s+-/, /\brm\s+\//, /git worktree remove/, /git branch -D/, /rmdir/, /unlink/]) assert.doesNotMatch(text, bad, `${name}: ${bad}`);
  }
});

test('the clean skill always dry-runs, asks, and only then deletes', () => {
  const text = read('clean');
  const dry = text.indexOf('Dry run first'), ask = text.indexOf('AskUserQuestion'), yes = text.indexOf('--yes --json');
  assert.ok(dry > 0 && dry < ask && ask < yes);
  assert.match(text, /--force` only when the user said "force"/);
});
