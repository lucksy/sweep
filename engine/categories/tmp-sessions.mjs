import fs from 'node:fs';
import path from 'node:path';

import { ageDays, isDir, ls } from '../fsx.mjs';

export default {
  id: 'tmp-sessions',
  title: 'Temp session folders (scratchpads, task output, images)',
  group: 'temp',
  risk: 'safe',
  text: (ctx) => ({
    creates: `Every session gets ${ctx.tmpRoot}/<project>/<session-id>/ holding the scratchpad, background task .output files and pasted images. Agents often npm install inside scratchpads. GitHub issues report runaway .output files of 100-500 GB.`,
    claude: 'Deleted when the matching transcript ages out (cleanupPeriodDays), or when the OS clears /tmp on reboot. `claude purge` does not touch it.',
    sweep: `Deletes session folders of sessions that are not running and are older than ${ctx.days(1)} day(s). Also deletes stray claude-*-cwd files in ${ctx.tmpBase}.`,
  }),
  scan: async (ctx) => {
    const { ids, sessions } = ctx.live();
    const runningVersions = new Set(sessions.map((x) => x.version).filter(Boolean));
    const items = [];
    for (const proj of ls(ctx.tmpRoot)) {
      const pdir = path.join(ctx.tmpRoot, proj);
      if (!isDir(pdir)) continue;
      // Project folders are named after the encoded cwd and start with "-"; the rest are CLI caches.
      const isSession = proj.startsWith('-');
      const kind = isSession ? 'session' : proj === 'bundled-skills' ? 'bundled skills of CLI' : `${proj} cache`;
      for (const sid of ls(pdir)) {
        const p = path.join(pdir, sid);
        const age = ageDays(p);
        if (!isDir(p) || age < ctx.days(1)) continue;
        const reason = ids.has(sid) ? 'live-session' : proj === 'bundled-skills' && runningVersions.has(sid) ? 'running-version' : null;
        items.push({
          path: p, label: sid, project: isSession ? ctx.knownProjects().get(proj) ?? null : null,
          bytes: await ctx.size(p), ageDays: age, cleanable: reason === null, reason,
          note: `${kind}${proj === 'bundled-skills' ? ` ${sid}` : ''} · ${Math.floor(age)}d old`,
        });
      }
    }
    for (const f of ls(ctx.tmpBase)) {
      const p = path.join(ctx.tmpBase, f);
      if (/^claude-[0-9a-f]+-cwd$/.test(f) && ageDays(p) >= 1) {
        items.push({ path: p, label: f, project: null, bytes: await ctx.size(p), ageDays: ageDays(p), cleanable: true, reason: null, note: 'stray cwd marker file' });
      }
    }
    return items;
  },
  clean: (item, ctx) => {
    ctx.rm(item.path);
    const parent = path.dirname(item.path);
    if (parent !== ctx.tmpRoot && parent.startsWith(ctx.tmpRoot) && !ls(parent).length) fs.rmdirSync(parent);
  },
};
