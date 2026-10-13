import path from 'node:path';

import { ageDays, sh } from '../fsx.mjs';
import { worktreeScan } from '../git.mjs';

export default {
  id: 'worktree-deps',
  title: 'node_modules inside worktrees that hold work',
  group: 'worktrees',
  risk: 'safe',
  text: () => ({
    creates: 'Agents install dependencies in their worktree. When the worktree has unsaved work it cannot be removed, but its node_modules can be rebuilt with npm install.',
    claude: 'Never cleaned on its own: it goes only when the whole worktree goes.',
    sweep: 'Deletes untracked node_modules folders inside worktrees that are kept because they hold work. Your changes and commits are not touched.',
  }),
  scan: async (ctx) => {
    const items = [];
    for (const w of (await worktreeScan(ctx)).filter((x) => x.internal.keptForWork)) {
      const found = sh('find', [w.path, '-name', 'node_modules', '-type', 'd', '-prune']);
      for (const p of found ? found.split('\n') : []) {
        if (sh('git', ['-C', w.path, 'ls-files', '--', p])) continue;
        const bytes = await ctx.size(p);
        if (bytes <= 64 * 1024) continue;
        items.push({ path: p, label: `${path.basename(w.path)}/${path.relative(w.path, p)}`, project: w.project, bytes, ageDays: ageDays(p), cleanable: true, reason: null, note: `in ${path.basename(w.path)}` });
      }
    }
    return items;
  },
  clean: (item, ctx) => ctx.rm(item.path),
};
