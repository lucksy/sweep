import path from 'node:path';

import { ageDays, ls, sh } from '../fsx.mjs';

export default {
  id: 'marketplace-deps',
  title: 'node_modules inside marketplace clones',
  group: 'plugins',
  risk: 'review',
  text: () => ({
    creates: 'Marketplaces are git clones in ~/.claude/plugins/marketplaces/. Some plugins run an install step there, which can add a large node_modules.',
    claude: 'Never cleaned.',
    sweep: 'Lists them. Deletes only with --force, because some plugins run from their marketplace folder; the plugin will reinstall what it needs, or you can reinstall it.',
  }),
  scan: async (ctx) => {
    const root = path.join(ctx.claudeDir, 'plugins', 'marketplaces');
    const items = [];
    for (const m of ls(root)) {
      const found = sh('find', [path.join(root, m), '-maxdepth', '3', '-name', 'node_modules', '-type', 'd', '-prune']);
      for (const p of found ? found.split('\n') : []) {
        const bytes = await ctx.size(p);
        if (bytes <= 64 * 1024) continue;
        const reason = ctx.force ? null : 'review';
        items.push({ path: p, label: path.relative(root, p), project: null, bytes, ageDays: ageDays(p), cleanable: reason === null, reason, note: path.relative(root, p) });
      }
    }
    return items;
  },
  clean: (item, ctx) => ctx.rm(item.path),
};
