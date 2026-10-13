// What Claude Code uses in total (not only what can go), free disk space,
// the per-project rollup, age buckets and warnings.

import fs from 'node:fs';
import path from 'node:path';

import { isDir, ls, sh, shAsync, stat } from './fsx.mjs';
import { repos } from './git.mjs';

const GB = 1024 ** 3;
export const RUNAWAY_BYTES = 5 * GB;
const MANY_WORKTREES = 10;

export async function footprint(ctx) {
  const claudeParts = { projects: 'claude.projects', plugins: 'claude.plugins', 'file-history': 'claude.fileHistory' };
  let other = 0;
  for (const n of ls(ctx.claudeDir)) if (!(n in claudeParts)) other += await ctx.size(path.join(ctx.claudeDir, n));
  let claudeJson = 0;
  for (const n of ls(ctx.home).filter((x) => x === '.claude.json' || x.startsWith('.claude.json.'))) claudeJson += await ctx.size(path.join(ctx.home, n));
  let worktrees = 0;
  for (const repo of await repos(ctx)) {
    for (const dir of repo.projectDirs) {
      const root = path.join(dir, '.claude', 'worktrees');
      // The sum of each worktree's own pass (scan() measures them one by one).
      for (const n of ls(root)) worktrees += await ctx.size(path.join(root, n));
    }
  }
  const parts = [
    { key: 'worktrees', label: 'Agent worktrees', bytes: worktrees },
    { key: 'tmp', label: 'Temp sessions', bytes: await ctx.size(ctx.tmpRoot) },
    { key: 'claude.projects', label: 'Transcripts', bytes: await ctx.size(path.join(ctx.claudeDir, 'projects')) },
    { key: 'claude.plugins', label: 'Plugins', bytes: await ctx.size(path.join(ctx.claudeDir, 'plugins')) },
    { key: 'claude.fileHistory', label: 'Checkpoints', bytes: await ctx.size(path.join(ctx.claudeDir, 'file-history')) },
    { key: 'claude.other', label: 'Other ~/.claude', bytes: other },
    { key: 'cli', label: 'CLI versions', bytes: await ctx.size(path.dirname(ctx.cliVersions)) },
    { key: 'claudeJson', label: '~/.claude.json', bytes: claudeJson },
  ];
  return { totalBytes: parts.reduce((t, p) => t + p.bytes, 0), parts };
}

// The volume that holds HOME, from `df -kP` (POSIX columns).
export function disk(home) {
  const line = sh('df', ['-kP', home])?.split('\n')[1];
  const cols = line?.trim().split(/\s+/);
  if (!cols || cols.length < 6) return { path: home, totalBytes: 0, freeBytes: 0 };
  return { path: cols.slice(5).join(' '), totalBytes: Number(cols[1]) * 1024, freeBytes: Number(cols[3]) * 1024 };
}

// Files in the temp root at or over the runaway size (sparse files count by their size).
// Task output sits at <project>/<session>/tasks/<file>; dependency folders are skipped.
export async function bigTmpFiles(ctx, min = RUNAWAY_BYTES) {
  const out = await shAsync('find', [ctx.tmpRoot, '-maxdepth', '5', '-name', 'node_modules', '-prune', '-o', '-type', 'f', '-size', `+${Math.floor(min / 1024) - 1}k`, '-print']);
  return (out ? out.split('\n') : []).map((p) => ({ path: p, bytes: stat(p)?.size ?? 0 })).filter((f) => f.bytes >= min);
}

// Whether Claude Code can read its own retention setting: ok, unreadable (bad JSON) or invalid.
export function settingsState(claudeDir) {
  const p = path.join(claudeDir, 'settings.json');
  if (!fs.existsSync(p)) return 'ok';
  let settings;
  try { settings = JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return 'unreadable'; }
  const days = settings?.cleanupPeriodDays;
  return days === undefined || (Number.isInteger(days) && days >= 1) ? 'ok' : 'invalid';
}

export async function worktreeCounts(ctx) {
  return (await repos(ctx)).map((r) => ({ repo: r.main, count: r.worktrees.filter((w) => w.path?.includes(`${path.sep}.claude${path.sep}worktrees${path.sep}`)).length }));
}

const fmtGB = (b) => `${(b / GB).toFixed(1)}G`;

export function computeWarnings({ disk, bigFiles, settingsState, worktreeCounts }) {
  const warnings = [];
  for (const f of bigFiles) warnings.push({ code: 'runaway-output', path: f.path, bytes: f.bytes, text: `a task output file is ${fmtGB(f.bytes)}: ${f.path}` });
  if (disk.totalBytes > 0 && disk.freeBytes / disk.totalBytes < 0.1) {
    warnings.push({ code: 'low-disk', path: disk.path, bytes: disk.freeBytes, text: `disk ${Math.round((disk.freeBytes / disk.totalBytes) * 100)}% free (${fmtGB(disk.freeBytes)})` });
  }
  if (settingsState !== 'ok') warnings.push({ code: 'sweep-paused', text: `Claude Code's own cleanup is paused: ~/.claude/settings.json is ${settingsState === 'unreadable' ? 'not valid JSON' : 'set to an invalid cleanupPeriodDays'}` });
  for (const w of worktreeCounts) if (w.count >= MANY_WORKTREES) warnings.push({ code: 'many-worktrees', path: w.repo, count: w.count, text: `${w.count} agent worktrees in ${path.basename(w.repo)}` });
  return warnings;
}

export function rollupProjects(categories) {
  const byPath = new Map();
  for (const c of categories) {
    for (const i of c.items) {
      if (!i.project) continue;
      const row = byPath.get(i.project) ?? { path: i.project, exists: fs.existsSync(i.project), bytes: 0, reclaimableBytes: 0, byCategory: {} };
      row.bytes += i.bytes;
      if (i.cleanable) {
        row.reclaimableBytes += i.bytes;
        row.byCategory[c.id] = (row.byCategory[c.id] ?? 0) + i.bytes;
      }
      byPath.set(i.project, row);
    }
  }
  return [...byPath.values()].sort((a, b) => b.reclaimableBytes - a.reclaimableBytes || b.bytes - a.bytes);
}

const BUCKETS = [['< 1 d', 1], ['1–7 d', 7], ['7–30 d', 30], ['30–90 d', 90], ['> 90 d', Infinity]];

export function ageBuckets(categories) {
  const buckets = BUCKETS.map(([label]) => ({ label, bytes: 0, byRisk: { safe: 0, caution: 0, review: 0 } }));
  for (const c of categories) {
    for (const i of c.items) {
      if (!i.cleanable || i.ageDays == null) continue;
      const b = buckets[BUCKETS.findIndex(([, max]) => i.ageDays < max)];
      b.bytes += i.bytes;
      b.byRisk[c.risk] += i.bytes;
    }
  }
  return buckets;
}
