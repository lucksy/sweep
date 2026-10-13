// scan(): every category, measured and explained, as the schema-1 contract
// every other part of sweep reads (SPEC-engine §Contract).

import fs from 'node:fs';
import path from 'node:path';

import { CATEGORIES } from './categories/index.mjs';
import { fmt, isDir, itemId, ls, readJson } from './fsx.mjs';
import { ageBuckets, bigTmpFiles, computeWarnings, disk, footprint, rollupProjects, settingsState, worktreeCounts } from './footprint.mjs';

export const SCHEMA = 1;
const VERSION = readJson(new URL('../.claude-plugin/plugin.json', import.meta.url))?.version ?? '0.0.0';

// One item as the contract carries it; what the cleaner needs rides along unseen by JSON.
function contractItem(category, raw) {
  const item = {
    id: itemId(category, raw.path),
    path: raw.path,
    label: raw.label ?? path.basename(raw.path),
    bytes: raw.bytes,
    ageDays: raw.ageDays == null ? null : Math.floor(raw.ageDays),
    project: raw.project ?? null,
    cleanable: raw.cleanable,
    reason: raw.cleanable ? null : raw.reason ?? 'kept',
    note: raw.note ?? '',
    detail: raw.detail ?? {},
  };
  Object.defineProperty(item, 'internal', { value: raw.internal ?? {}, enumerable: false });
  return item;
}

async function scanCategory(ctx, cat) {
  let items = [];
  let error = null;
  try {
    items = (await cat.scan(ctx)).map((raw) => contractItem(cat.id, raw));
  } catch (e) {
    error = e.message;
  }
  items.sort((a, b) => b.bytes - a.bytes);
  const cleanable = items.filter((i) => i.cleanable);
  const result = {
    id: cat.id, title: cat.title, group: cat.group, risk: cat.risk, text: cat.text(ctx),
    foundBytes: items.reduce((t, i) => t + i.bytes, 0),
    reclaimableBytes: cleanable.reduce((t, i) => t + i.bytes, 0),
    found: items.length, cleanable: cleanable.length, error, items,
  };
  Object.defineProperty(result, 'clean', { value: cat.clean, enumerable: false });
  return result;
}

function info(ctx) {
  const settings = readJson(path.join(ctx.claudeDir, 'settings.json')) ?? {};
  const projects = Object.keys(ctx.claudeJson().projects ?? {});
  const missing = projects.filter((p) => !fs.existsSync(p));
  const size = (p) => { try { return fs.statSync(p).size; } catch { return 0; } };
  return [
    { key: 'history.jsonl', value: fmt(size(path.join(ctx.claudeDir, 'history.jsonl'))), text: 'Your prompt history (up-arrow). Never swept. `claude purge <path>` drops one project\'s lines.' },
    { key: '~/.claude.json', value: fmt(size(path.join(ctx.home, '.claude.json'))), text: `${projects.length} project entries, ${missing.length} for folders that no longer exist. Holds auth and MCP config; do not delete. \`claude purge <path>\` removes one entry.` },
    { key: 'cleanupPeriodDays', value: String(settings.cleanupPeriodDays ?? '30 (default)'), text: 'Age at which Claude sweeps transcripts, file-history, temp scratchpads and idle agent worktrees. Lower it in ~/.claude/settings.json to keep less.' },
    { key: 'kept on purpose', value: '', text: 'settings, credentials, CLAUDE.md, agent-memory/, jobs/, daemon/, skills/, projects/*/memory/. sweep never deletes these.' },
  ];
}

export const categoryIds = () => CATEGORIES.map((c) => c.id);

// `lean` skips the footprint, rollups and warnings (a clean needs only the categories).
// `onProgress` hears {event: 'category', id, index, total} as each category finishes.
export async function scan(ctx, { ids = null, options = {}, lean = false, onProgress = () => {} } = {}) {
  const started = Date.now();
  // Every tree measured once, in parallel, while the categories run; worktree
  // folders are found from the project list so their pass starts at once.
  const worktreeRoots = [...new Set(ctx.projectPaths().map((d) => path.join(d, '.claude', 'worktrees')))].filter(isDir);
  // Each worktree gets its own pass, so big ones are measured side by side.
  const worktreeDirs = worktreeRoots.flatMap((r) => ls(r).map((n) => path.join(r, n))).filter(isDir);
  const trees = ctx.prefetch([[ctx.claudeDir, 5], [ctx.tmpRoot, 2], [path.dirname(ctx.cliVersions), 2], ...worktreeDirs.map((d) => [d, 1])]);
  const bigFiles = bigTmpFiles(ctx);
  const chosen = CATEGORIES.filter((c) => !ids || ids.includes(c.id));
  let finished = 0;
  const categories = await Promise.all(chosen.map((cat) => scanCategory(ctx, cat).then((r) => {
    onProgress({ event: 'category', id: cat.id, index: ++finished, total: chosen.length });
    return r;
  })));
  await trees;
  if (lean) return { schema: SCHEMA, categories };
  const sum = (list, pick) => list.reduce((t, x) => t + pick(x), 0);
  const diskNow = disk(ctx.home);
  return {
    schema: SCHEMA,
    tool: { name: 'sweep', version: VERSION },
    scannedAt: new Date(started).toISOString(),
    durationMs: Date.now() - started,
    options: { days: options.days ?? null, force: !!ctx.force },
    host: { platform: process.platform, claudeDir: ctx.claudeDir, tmpRoot: ctx.tmpRoot, cliVersion: ctx.cliVersion() },
    totals: {
      reclaimableBytes: sum(categories, (c) => c.reclaimableBytes),
      safeBytes: sum(categories.filter((c) => c.risk === 'safe'), (c) => c.reclaimableBytes),
      keptBytes: sum(categories, (c) => c.foundBytes - c.reclaimableBytes),
    },
    disk: diskNow,
    footprint: await footprint(ctx),
    categories,
    projects: rollupProjects(categories),
    ageBuckets: ageBuckets(categories),
    warnings: computeWarnings({ disk: diskNow, bigFiles: await bigFiles, settingsState: settingsState(ctx.claudeDir), worktreeCounts: await worktreeCounts(ctx) }),
    info: info(ctx),
  };
}
