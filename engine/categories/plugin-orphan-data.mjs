import path from 'node:path';

import { ageDays, ls, readJson } from '../fsx.mjs';

export default {
  id: 'plugin-orphan-data',
  title: 'Data folders of plugins that are not installed',
  group: 'plugins',
  risk: 'review',
  text: () => ({
    creates: 'Plugins store persistent data (often their own node_modules) in ~/.claude/plugins/data/<plugin>-<marketplace>/. Plugins loaded with --plugin-dir or inline also get one.',
    claude: 'Deleted on `claude plugin uninstall` unless --keep-data. Never deleted for --plugin-dir or inline plugins.',
    sweep: 'Lists data folders that match no installed plugin. Deletes them only with --force, because a plugin you load with --plugin-dir may still use one.',
  }),
  scan: async (ctx) => {
    const installed = Object.keys(readJson(path.join(ctx.claudeDir, 'plugins', 'installed_plugins.json'))?.plugins ?? {});
    const expected = new Set(installed.map((k) => k.replace('@', '-')));
    const root = path.join(ctx.claudeDir, 'plugins', 'data');
    const items = [];
    for (const n of ls(root).filter((x) => !expected.has(x))) {
      const p = path.join(root, n);
      const reason = ctx.force ? null : 'review';
      items.push({ path: p, label: n, project: null, bytes: await ctx.size(p), ageDays: ageDays(p), cleanable: reason === null, reason, note: 'no installed plugin matches' });
    }
    return items;
  },
  clean: (item, ctx) => ctx.rm(item.path),
};
