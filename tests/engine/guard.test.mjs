import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createGuard } from '../../engine/guard.mjs';

let root, home, claude, tmpBase, tmpRoot, versions, docs, rm;

const touch = (p, text = 'x') => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, text); return p; };

beforeEach(() => {
  root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'sweep-guard-')));
  home = path.join(root, 'home');
  claude = path.join(home, '.claude');
  tmpBase = path.join(root, 'tmp');
  tmpRoot = path.join(tmpBase, 'claude-501');
  versions = path.join(home, '.local', 'share', 'claude', 'versions');
  docs = path.join(home, 'Documents');
  for (const d of [claude, tmpRoot, versions, docs]) fs.mkdirSync(d, { recursive: true });
  ({ rm } = createGuard({ home, claudeDir: claude, tmpBase, tmpRoot, cliVersions: versions }));
});
afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

test('refuses every protected path inside ~/.claude', () => {
  const protectedPaths = [
    'settings.json', 'settings.local.json', '.credentials.json', 'CLAUDE.md', 'history.jsonl',
    'agent-memory/x.md', 'jobs/a', 'daemon/a', 'skills/s/SKILL.md', 'commands/c.md', 'agents/a.md',
    'plugins/installed_plugins.json', 'plugins/known_marketplaces.json', 'projects/-p/memory/MEMORY.md', 'projects/-p/memory',
  ];
  for (const rel of protectedPaths) {
    const p = touch(path.join(claude, rel.endsWith('memory') ? `${rel}/MEMORY.md` : rel));
    const target = rel.endsWith('memory') ? path.dirname(p) : p;
    assert.throws(() => rm(target), /protected|memory/, rel);
    assert.ok(fs.existsSync(target), rel);
  }
});

test('refuses ~/.claude.json, the roots themselves, and anything outside the allowlist', () => {
  const outside = [
    touch(path.join(home, '.claude.json')),
    touch(path.join(docs, 'report.pdf')),
    touch(path.join(home, '.zshrc')),
    touch(path.join(tmpBase, 'someone-else', 'f')),
    touch(path.join(tmpBase, 'claude-notes.txt')),
  ];
  for (const p of outside) {
    assert.throws(() => rm(p), /refusing/, p);
    assert.ok(fs.existsSync(p), p);
  }
  for (const r of [claude, tmpRoot, versions, home]) assert.throws(() => rm(r), /refusing/, r);
});

test('refuses .. traversal out of an allowed root', () => {
  const p = touch(path.join(docs, 'keep.txt'));
  assert.throws(() => rm(path.join(claude, '..', 'Documents', 'keep.txt')), /refusing/);
  assert.ok(fs.existsSync(p));
});

test('refuses a path that reaches outside through a symlinked folder', () => {
  const precious = touch(path.join(docs, 'precious.txt'));
  fs.mkdirSync(path.join(claude, 'plugins', 'cache'), { recursive: true });
  fs.symlinkSync(docs, path.join(claude, 'plugins', 'cache', 'linked'));
  assert.throws(() => rm(path.join(claude, 'plugins', 'cache', 'linked', 'precious.txt')), /refusing/);
  assert.ok(fs.existsSync(precious));
});

test('a symlink inside an allowed root is removed as a link; its target is untouched', () => {
  const precious = touch(path.join(docs, 'precious.txt'));
  const link = path.join(claude, 'shell-snapshots', 'link');
  fs.mkdirSync(path.dirname(link), { recursive: true });
  fs.symlinkSync(docs, link);
  rm(link);
  assert.ok(!fs.existsSync(link));
  assert.ok(fs.existsSync(precious));
});

test('removes allowed paths', () => {
  const allowed = [
    touch(path.join(claude, 'shell-snapshots', 's.sh')),
    touch(path.join(claude, 'plugins', 'cache', 'm', 'p', '1.0', 'f')),
    touch(path.join(claude, 'projects', '-p', 'aaaa.jsonl')),
    touch(path.join(tmpRoot, '-proj', 'sid', 'scratchpad', 'f')),
    touch(path.join(tmpBase, 'claude-abc123-cwd')),
    touch(path.join(versions, '2.1.294')),
    touch(path.join(home, '.claude.json.backup.123')),
    touch(path.join(home, 'Projects', 'repo', '.claude', 'worktrees', 'agent-x', 'node_modules', 'f')),
  ];
  for (const p of allowed) {
    rm(p);
    assert.ok(!fs.existsSync(p), p);
  }
  const dir = path.join(claude, 'plugins', 'cache', 'm', 'p', '1.0');
  rm(dir);
  assert.ok(!fs.existsSync(dir));
});
