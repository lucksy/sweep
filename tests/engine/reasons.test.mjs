import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { makeSandbox } from '../fixtures/sandbox.mjs';

const ENGINE = fileURLToPath(new URL('../../engine/sweep.mjs', import.meta.url));
const LIVE = '22222222-2222-3333-4444-555555555555';
const OLD = new Date('2026-01-01T00:00:00Z');
let sbx, result;

const write = (p, text = 'x') => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, text); return p; };
const age = (p) => { const s = fs.lstatSync(p); if (s.isDirectory()) for (const n of fs.readdirSync(p)) age(path.join(p, n)); fs.lutimesSync(p, OLD, OLD); };
const git = (cwd, ...args) => execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', ...args], { cwd, stdio: 'pipe' });

// One item kept for each reason the engine knows. A live session is this test process.
before(() => {
  sbx = makeSandbox();
  const { claude, tmpRoot, repo, wt, home } = sbx;
  git(repo, 'worktree', 'add', '-q', '-b', 'worktree-agent-locked', wt('agent-locked'));
  git(repo, 'worktree', 'lock', wt('agent-locked'));
  git(repo, 'worktree', 'add', '-q', '-b', 'worktree-agent-live', wt('agent-live'));
  git(repo, 'worktree', 'add', '-q', '-b', 'worktree-agent-broken', wt('agent-broken'));
  fs.writeFileSync(path.join(wt('agent-broken'), '.git'), 'gitdir: /nonexistent\n');
  write(path.join(claude, 'sessions', '1.json'), JSON.stringify({ pid: process.pid, sessionId: LIVE, cwd: wt('agent-live'), startedAt: 1, version: '9.9.9' }));

  for (const p of [
    write(path.join(tmpRoot, '-proj', LIVE, 'f')),
    write(path.join(tmpRoot, 'bundled-skills', '9.9.9', 'f')),
    write(path.join(claude, 'projects', '-x', `${LIVE}.jsonl`), '{}'),
    write(path.join(claude, 'file-history', LIVE, 'f')),
    write(path.join(claude, 'plugins', 'cache', 'm', 'p', '0.9', '.in_use', '123')),
    write(path.join(claude, 'projects', '-mystery', 'note.txt'), 'no transcript here'),
    write(path.join(claude, 'plugins', 'data', 'gone-plugin', 'f')),
    write(path.join(claude, 'plugins', 'marketplaces', 'mk', 'node_modules', 'big'), 'x'.repeat(100_000)),
  ]) age(path.dirname(p));
  write(path.join(claude, 'plugins', 'cache', 'm', 'p', '1.5', 'f'));  // changed today
  result = JSON.parse(execFileSync('node', [ENGINE, 'scan', '--json'], { env: sbx.env, encoding: 'utf8' }));
});
after(() => sbx.cleanup());

const reasonsOf = (id) => new Set(result.categories.find((c) => c.id === id).items.map((i) => i.reason).filter(Boolean));

test('every kept reason in SPEC-engine is reported', () => {
  const expected = {
    worktrees: ['dirty', 'unique-commits', 'locked', 'live-session', 'owned-by-live-session', 'git-error'],
    'worktree-branches': ['unique-commits'],
    'tmp-sessions': ['live-session', 'running-version'],
    'plugin-versions': ['in-use', 'recent'],
    transcripts: ['live-session'],
    'orphan-projects': ['unknown-origin'],
    'file-history': ['live-session'],
    'plugin-orphan-data': ['review'],
    'marketplace-deps': ['review'],
  };
  for (const [id, reasons] of Object.entries(expected)) {
    const found = reasonsOf(id);
    for (const r of reasons) assert.ok(found.has(r), `${id} reports ${r} (found: ${[...found].join(', ')})`);
  }
});
