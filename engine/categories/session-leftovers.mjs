import path from 'node:path';

import { ageDays, ls } from '../fsx.mjs';

const DIRS = ['shell-snapshots', 'paste-cache', 'image-cache', 'debug', 'session-env', 'todos', 'statsig', 'logs'];

export default {
  id: 'session-leftovers',
  title: 'Session caches: shell snapshots, paste cache, debug logs, legacy dirs',
  group: 'caches',
  risk: 'safe',
  text: (ctx) => ({
    creates: 'shell-snapshots/ (your shell env per session), paste-cache/, image-cache/ (older versions), debug/ (with --debug), session-env/, and legacy todos/, statsig/, logs/.',
    claude: 'Swept after cleanupPeriodDays; shell snapshots are removed on clean exit, so crashes leave them behind. The docs list all of these as safe to delete.',
    sweep: `Deletes entries older than ${ctx.days(7)} day(s) that do not belong to a running session.`,
  }),
  scan: async (ctx) => {
    const { ids } = ctx.live();
    const items = [];
    for (const name of DIRS) {
      const dir = path.join(ctx.claudeDir, name);
      const entries = ls(dir).map((n) => path.join(dir, n)).filter((p) => ageDays(p) >= ctx.days(7) && ![...ids].some((id) => p.includes(id)));
      if (!entries.length) continue;
      let bytes = 0;
      for (const p of entries) bytes += await ctx.size(p);
      items.push({
        path: dir, label: name, project: null, bytes, ageDays: null, cleanable: true, reason: null,
        note: `${entries.length} entr${entries.length === 1 ? 'y' : 'ies'}`, detail: { entries: entries.length },
        internal: { entries },
      });
    }
    return items;
  },
  clean: (item, ctx) => item.internal.entries.forEach((p) => ctx.rm(p)),
};
