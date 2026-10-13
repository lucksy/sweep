// A fixed scan, clean and explain result, so the text report can be snapshot-tested.

const G = 1024 ** 3, M = 1024 ** 2;
const item = (path, bytes, cleanable, reason, note, ageDays = 23) => ({ id: `i_${path.length.toString(16).padStart(10, '0')}`, path, label: path.split('/').pop(), bytes, ageDays, project: null, cleanable, reason: cleanable ? null : reason, note, detail: {} });

export const SCAN = {
  schema: 1, tool: { name: 'sweep', version: '0.2.0' }, scannedAt: '2026-10-13T12:00:00.000Z', durationMs: 11000,
  options: { days: null, force: false }, host: { platform: 'darwin', claudeDir: '/Users/x/.claude', tmpRoot: '/private/tmp/claude-501', cliVersion: '2.1.296' },
  disk: { path: '/', totalBytes: 1000 * G, freeBytes: 57 * G },
  footprint: { totalBytes: 9 * G, parts: [
    { key: 'worktrees', label: 'Agent worktrees', bytes: 2.8 * G }, { key: 'tmp', label: 'Temp sessions', bytes: 1.6 * G },
    { key: 'claude.projects', label: 'Transcripts', bytes: 1.4 * G }, { key: 'claude.plugins', label: 'Plugins', bytes: 2.1 * G },
    { key: 'claude.fileHistory', label: 'Checkpoints', bytes: 0.05 * G }, { key: 'claude.other', label: 'Other ~/.claude', bytes: 0.35 * G },
    { key: 'cli', label: 'CLI versions', bytes: 0.7 * G }, { key: 'claudeJson', label: '~/.claude.json', bytes: 0 },
  ] },
  totals: { reclaimableBytes: 3 * G, safeBytes: 400 * M, keptBytes: 20 * M },
  categories: [
    { id: 'worktrees', title: 'Agent and workflow worktrees', group: 'worktrees', risk: 'caution', text: { creates: 'Subagents create checkouts.', claude: 'Removed when unchanged.', sweep: 'Removes clean ones.' },
      foundBytes: 2.62 * G, reclaimableBytes: 2.6 * G, found: 3, cleanable: 2, error: null, items: [
        item('/Users/x/Projects/Tree-Testing /.claude/worktrees/agent-a7224a15e5bfcd682', 1.4 * G, true, null, 'worktree-agent-a7224a15e5bfcd682 · clean, nothing unsaved · node_modules 1.0G · 23d old'),
        item('/Users/x/Projects/Tree-Testing /.claude/worktrees/agent-a5c603ec4d9b462bf', 1.2 * G, true, null, 'worktree-agent-a5c603ec4d9b462bf · clean, nothing unsaved · 23d old'),
        item('/Users/x/Projects/agent-skills-mods/.claude/worktrees/agent-a55e24e33f5d4b3f0', 20 * M, false, 'owned-by-live-session', 'made during a session still running in this repo · 1d old', 1),
      ] },
    { id: 'tmp-sessions', title: 'Temp session folders (scratchpads, task output, images)', group: 'temp', risk: 'safe', text: { creates: 'Temp.', claude: 'On reboot.', sweep: 'Old ones.' },
      foundBytes: 400 * M, reclaimableBytes: 400 * M, found: 1, cleanable: 1, error: null, items: [item('/private/tmp/claude-501/-Users-x-Projects-aihqlk/29358831-bb1a-49ce-9902-62c332f74fee', 400 * M, true, null, 'session · 2d old', 2)] },
    { id: 'marketplace-deps', title: 'node_modules inside marketplace clones', group: 'plugins', risk: 'review', text: { creates: 'M.', claude: 'Never.', sweep: 'With --force.' },
      foundBytes: 1.1 * G, reclaimableBytes: 0, found: 1, cleanable: 0, error: null, items: [item('/Users/x/.claude/plugins/marketplaces/thedotmack/node_modules', 1.1 * G, false, 'review', 'thedotmack/node_modules')] },
  ],
  projects: [], ageBuckets: [],
  warnings: [{ code: 'runaway-output', path: '/private/tmp/claude-501/-p/s/tasks/b1.output', bytes: 6 * G, text: 'a task output file is 6.0G: /private/tmp/claude-501/-p/s/tasks/b1.output' }],
  info: [{ key: 'cleanupPeriodDays', value: '30 (default)', text: 'Age at which Claude sweeps transcripts.' }],
};

export const CLEAN = {
  schema: 1, dryRun: false, startedAt: '2026-10-13T12:05:00.000Z', durationMs: 2100,
  requested: { categories: ['worktrees'], only: null, force: false }, freedBytes: 2.6 * G,
  removed: [
    { id: 'i_1', category: 'worktrees', path: '/Users/x/Projects/Tree-Testing /.claude/worktrees/agent-a7224a15e5bfcd682', bytes: 1.4 * G },
    { id: 'i_2', category: 'worktrees', path: '/Users/x/Projects/Tree-Testing /.claude/worktrees/agent-a5c603ec4d9b462bf', bytes: 1.2 * G },
  ],
  kept: [{ id: 'i_3', category: 'worktrees', path: '/Users/x/Projects/agent-skills-mods/.claude/worktrees/agent-a55e24e33f5d4b3f0', reason: 'owned-by-live-session' }],
  skipped: [], failed: [],
};
