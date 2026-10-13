import path from 'node:path';

import { ageDays, ls } from '../fsx.mjs';

export default {
  id: 'old-cli',
  title: 'Old Claude Code binaries',
  group: 'cli',
  risk: 'safe',
  text: (ctx) => ({
    creates: `The native installer keeps each version in ${ctx.cliVersions}/ (about 200 MB each). Old installers can also sit in ~/.claude/downloads/.`,
    claude: 'The updater prunes some old versions itself; downloads/ is never cleaned.',
    sweep: 'Keeps the running version and the newest older one (for rollback), deletes the rest, and clears ~/.claude/downloads entries older than a day.',
  }),
  scan: async (ctx) => {
    const current = ctx.cliVersion();
    const versions = ls(ctx.cliVersions).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
    const keep = new Set([current, versions.filter((v) => v !== current).at(-1)]);
    const items = [];
    if (current) {
      for (const v of versions.filter((x) => !keep.has(x))) {
        const p = path.join(ctx.cliVersions, v);
        items.push({ path: p, label: v, project: null, bytes: await ctx.size(p), ageDays: ageDays(p), cleanable: true, reason: null, note: `running ${current}` });
      }
    }
    const dl = path.join(ctx.claudeDir, 'downloads');
    for (const n of ls(dl)) {
      const p = path.join(dl, n);
      if (ageDays(p) >= 1) items.push({ path: p, label: n, project: null, bytes: await ctx.size(p), ageDays: ageDays(p), cleanable: true, reason: null, note: 'old installer download' });
    }
    return items;
  },
  clean: (item, ctx) => ctx.rm(item.path),
};
