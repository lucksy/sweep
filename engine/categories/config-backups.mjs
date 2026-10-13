import path from 'node:path';

import { ageDays, ls } from '../fsx.mjs';

export default {
  id: 'config-backups',
  title: 'Stray ~/.claude.json backups and temp copies',
  group: 'config',
  risk: 'safe',
  text: () => ({
    creates: 'Writes to ~/.claude.json go through .tmp.* files and timestamped .backup.* copies; interrupted writes and corruption recovery leave them in your home folder.',
    claude: 'Newer versions keep 5 backups in ~/.claude/backups/ and sweep those; the older copies in your home folder are never removed.',
    sweep: 'Deletes ~/.claude.json.backup.<timestamp>, .tmp.* (over a day old) and .corrupted.* files. Keeps ~/.claude.json and the plain ~/.claude.json.backup.',
  }),
  scan: async (ctx) => {
    const items = [];
    for (const n of ls(ctx.home).filter((x) => /^\.claude\.json\.(backup\.\d+|tmp\..+|corrupted\..+)$/.test(x))) {
      const p = path.join(ctx.home, n);
      const age = ageDays(p);
      if (n.includes('.tmp.') && age < 1) continue;
      items.push({ path: p, label: n, project: null, bytes: await ctx.size(p), ageDays: age, cleanable: true, reason: null, note: `${Math.floor(age)}d old` });
    }
    return items;
  },
  clean: (item, ctx) => ctx.rm(item.path),
};
