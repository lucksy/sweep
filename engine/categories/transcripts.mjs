import path from 'node:path';

import { ageDays, isDir, ls, UUID } from '../fsx.mjs';
import { orphanProjects } from '../projects.mjs';

export default {
  id: 'transcripts',
  title: 'Old session transcripts',
  group: 'history',
  risk: 'caution',
  text: (ctx) => ({
    creates: 'Every session writes ~/.claude/projects/<project>/<session>.jsonl plus a <session>/ folder with subagent transcripts and large tool results.',
    claude: 'Deleted after cleanupPeriodDays (default 30). The sweep is skipped for `claude -p --bare` and pauses when settings cannot be read.',
    sweep: `Deletes transcripts of sessions that are not running and are older than ${ctx.days(30)} day(s). Use --days to go shorter. You lose /resume and rewind for those sessions. Auto-memory (memory/) is never touched.`,
  }),
  scan: async (ctx) => {
    const root = path.join(ctx.claudeDir, 'projects');
    const orphans = new Set((await orphanProjects(ctx)).map((i) => i.path));
    const { ids } = ctx.live();
    const items = [];
    for (const proj of ls(root)) {
      const pdir = path.join(root, proj);
      if (orphans.has(pdir)) continue;
      for (const f of ls(pdir)) {
        const sid = f.match(UUID)?.[0];
        if (!sid || !f.includes('.jsonl')) continue;
        const p = path.join(pdir, f);
        const age = ageDays(p);
        if (age < ctx.days(30)) continue;
        const companion = path.join(pdir, sid);
        const reason = ids.has(sid) ? 'live-session' : null;
        items.push({
          path: p, label: f, project: ctx.knownProjects().get(proj) ?? null,
          bytes: (await ctx.size(p)) + (await ctx.size(companion)), ageDays: age,
          cleanable: reason === null, reason, note: `${proj} · ${Math.floor(age)}d old`,
          internal: { companion: isDir(companion) ? companion : null },
        });
      }
    }
    return items;
  },
  clean: (item, ctx) => {
    ctx.rm(item.path);
    if (item.internal.companion) ctx.rm(item.internal.companion);
  },
};
