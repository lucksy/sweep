import path from 'node:path';

import { ageDays, isDir, ls } from '../fsx.mjs';

export default {
  id: 'file-history',
  title: 'Old checkpoint snapshots (file-history)',
  group: 'history',
  risk: 'caution',
  text: (ctx) => ({
    creates: 'Before every edit Claude stores a copy of the file in ~/.claude/file-history/<session>/ so /rewind can restore it.',
    claude: 'Deleted after cleanupPeriodDays. Capped at 100 checkpoints per session.',
    sweep: `Deletes snapshots of sessions that are not running and are older than ${ctx.days(30)} day(s). You lose rewind for those sessions.`,
  }),
  scan: async (ctx) => {
    const root = path.join(ctx.claudeDir, 'file-history');
    const { ids } = ctx.live();
    const items = [];
    for (const sid of ls(root)) {
      const p = path.join(root, sid);
      const age = ageDays(p);
      if (!isDir(p) || age < ctx.days(30)) continue;
      const reason = ids.has(sid) ? 'live-session' : null;
      items.push({ path: p, label: sid, project: null, bytes: await ctx.size(p), ageDays: age, cleanable: reason === null, reason, note: `${Math.floor(age)}d old` });
    }
    return items;
  },
  clean: (item, ctx) => ctx.rm(item.path),
};
