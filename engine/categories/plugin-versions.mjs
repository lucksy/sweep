import path from 'node:path';

import { ageDays, isDir, ls, readJson } from '../fsx.mjs';

export default {
  id: 'plugin-versions',
  title: 'Superseded plugin versions in the plugin cache',
  group: 'plugins',
  risk: 'caution',
  text: () => ({
    creates: 'Every plugin install or update unpacks a full copy into ~/.claude/plugins/cache/<marketplace>/<plugin>/<version>, including any bundled node_modules. Failed fetches leave temp_git_* / temp_github_* folders.',
    claude: 'Never removed: old versions pile up on every update (GitHub issues #36245, #81217).',
    sweep: 'Deletes versions that installed_plugins.json no longer points at, whose .in_use marker is empty, and that are over a day old, plus stale temp_* fetch folders. Sessions still running an old version keep working until restart; quit them first to be safe.',
  }),
  scan: async (ctx) => {
    const cache = path.join(ctx.claudeDir, 'plugins', 'cache');
    const installed = readJson(path.join(ctx.claudeDir, 'plugins', 'installed_plugins.json'))?.plugins ?? {};
    const keep = new Set(Object.values(installed).flat().map((e) => e.installPath).filter(Boolean));
    const items = [];
    for (const m of ls(cache)) {
      const mdir = path.join(cache, m);
      if (m.startsWith('temp_')) {
        if (ageDays(mdir) >= 1) items.push({ path: mdir, label: m, project: null, bytes: await ctx.size(mdir), ageDays: ageDays(mdir), cleanable: true, reason: null, note: 'leftover fetch folder' });
        continue;
      }
      for (const p of ls(mdir)) for (const v of ls(path.join(mdir, p))) {
        const full = path.join(mdir, p, v);
        if (!isDir(full) || keep.has(full)) continue;
        const age = ageDays(full);
        const reason = ls(path.join(full, '.in_use')).length > 0 ? 'in-use' : age < 1 ? 'recent' : null;
        items.push({
          path: full, label: `${p}@${m} ${v}`, project: null, bytes: await ctx.size(full), ageDays: age,
          cleanable: reason === null, reason,
          note: reason === 'in-use' ? 'marked in use: kept' : reason === 'recent' ? 'changed today: kept' : `${p}@${m} ${v} (not installed)`,
          detail: { plugin: p, marketplace: m, version: v },
        });
      }
    }
    return items;
  },
  clean: (item, ctx) => ctx.rm(item.path),
};
