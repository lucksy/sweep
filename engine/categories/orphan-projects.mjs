import fs from 'node:fs';
import path from 'node:path';

import { ls } from '../fsx.mjs';
import { orphanProjects } from '../projects.mjs';

export default {
  id: 'orphan-projects',
  title: 'Transcripts of projects whose folder no longer exists',
  group: 'history',
  risk: 'caution',
  text: () => ({
    creates: 'Transcript folders in ~/.claude/projects stay after you delete or move a project, including projects opened inside temp scratchpads.',
    claude: 'Only removed transcript by transcript as they age out.',
    sweep: 'Deletes the transcripts of projects whose path is gone. Keeps any memory/ folder. Folders whose original path cannot be worked out are listed but kept unless you pass --force.',
  }),
  scan: (ctx) => orphanProjects(ctx),
  clean: (item, ctx) => {
    for (const n of ls(item.path)) if (n !== 'memory') ctx.rm(path.join(item.path, n));
    if (!ls(item.path).length) fs.rmdirSync(item.path);
  },
};
