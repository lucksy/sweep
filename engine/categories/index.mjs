// The categories in the order sweep reports them.

import worktrees from './worktrees.mjs';
import worktreeDeps from './worktree-deps.mjs';
import worktreeBranches from './worktree-branches.mjs';
import tmpSessions from './tmp-sessions.mjs';
import pluginVersions from './plugin-versions.mjs';
import transcripts from './transcripts.mjs';
import orphanProjects from './orphan-projects.mjs';
import fileHistory from './file-history.mjs';
import sessionLeftovers from './session-leftovers.mjs';
import oldCli from './old-cli.mjs';
import configBackups from './config-backups.mjs';
import pluginOrphanData from './plugin-orphan-data.mjs';
import marketplaceDeps from './marketplace-deps.mjs';

export const CATEGORIES = [
  worktrees, worktreeDeps, worktreeBranches, tmpSessions, pluginVersions, transcripts, orphanProjects,
  fileHistory, sessionLeftovers, oldCli, configBackups, pluginOrphanData, marketplaceDeps,
];
