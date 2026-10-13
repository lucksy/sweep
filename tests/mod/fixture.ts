// A schema-1 scan and clean the fake engine answers with in mod tests.

import type { CleanResult, ScanCategory, ScanItem, ScanResult } from '../../types'

const G = 1024 ** 3, M = 1024 ** 2

export const item = (id: string, path: string, bytes: number, cleanable = true, reason: string | null = null, extra: Partial<ScanItem> = {}): ScanItem =>
  ({ id, path, label: path.split('/').pop()!, bytes, ageDays: 23, project: null, cleanable, reason: cleanable ? null : reason, note: cleanable ? 'clean, nothing unsaved' : `kept: ${reason}`, detail: {}, ...extra })

const category = (id: string, risk: ScanCategory['risk'], items: ScanItem[], title = id): ScanCategory => {
  const cleanable = items.filter((i) => i.cleanable)
  return {
    id, title, group: id, risk, text: { creates: `Where ${id} comes from.`, claude: `What Claude cleans of ${id}.`, sweep: `What sweep removes of ${id}.` },
    foundBytes: items.reduce((t, i) => t + i.bytes, 0), reclaimableBytes: cleanable.reduce((t, i) => t + i.bytes, 0),
    found: items.length, cleanable: cleanable.length, error: null, items,
  }
}

export const CATEGORIES: ScanCategory[] = [
  category('worktrees', 'caution', [
    item('i_wt1', '/Users/x/Projects/Tree-Testing /.claude/worktrees/agent-a7224a15e5bfcd682', 1.4 * G, true, null, { project: '/Users/x/Projects/Tree-Testing ' }),
    item('i_wt2', '/Users/x/Projects/Tree-Testing /.claude/worktrees/agent-a5c603ec4d9b462bf', 1.3 * G, true, null, { project: '/Users/x/Projects/Tree-Testing ' }),
    item('i_wt3', '/Users/x/Projects/agent-skills-mods/.claude/worktrees/agent-a55e', 2.3 * M, false, 'owned-by-live-session', { project: '/Users/x/Projects/agent-skills-mods', ageDays: 1 }),
  ], 'Agent and workflow worktrees'),
  category('tmp-sessions', 'safe', [item('i_tmp1', '/private/tmp/claude-501/-p/s1', 360 * M, true, null, { ageDays: 2 })], 'Temp session folders'),
  category('plugin-versions', 'caution', [item('i_pv1', '/Users/x/.claude/plugins/cache/m/p/1.0', 199 * M)], 'Superseded plugin versions'),
  category('old-cli', 'safe', [item('i_cli1', '/Users/x/.local/share/claude/versions/2.1.294', 233 * M)], 'Old Claude Code binaries'),
  category('transcripts', 'caution', [], 'Old session transcripts'),
  category('marketplace-deps', 'review', [item('i_md1', '/Users/x/.claude/plugins/marketplaces/t/node_modules', 1.1 * G, false, 'review')], 'node_modules inside marketplace clones'),
]

export const SCAN: ScanResult = {
  schema: 1, tool: { name: 'sweep', version: '0.2.0' }, scannedAt: '2026-10-13T12:00:00.000Z', durationMs: 11000,
  options: { days: null, force: false }, host: { platform: 'darwin', claudeDir: '/Users/x/.claude', tmpRoot: '/private/tmp/claude-501', cliVersion: '2.1.296' },
  disk: { path: '/', totalBytes: 1000 * G, freeBytes: 590 * G },
  footprint: { totalBytes: 7.4 * G, parts: [
    { key: 'worktrees', label: 'Agent worktrees', bytes: 2.75 * G }, { key: 'tmp', label: 'Temp sessions', bytes: 0.42 * G },
    { key: 'claude.projects', label: 'Transcripts', bytes: 1.37 * G }, { key: 'claude.plugins', label: 'Plugins', bytes: 2.08 * G },
    { key: 'cli', label: 'CLI versions', bytes: 0.69 * G },
  ] },
  totals: { reclaimableBytes: CATEGORIES.reduce((t, c) => t + c.reclaimableBytes, 0), safeBytes: 593 * M, keptBytes: 1.1 * G },
  categories: CATEGORIES,
  projects: [
    { path: '/Users/x/Projects/Tree-Testing ', exists: true, bytes: 2.7 * G, reclaimableBytes: 2.7 * G, byCategory: { worktrees: 2.7 * G } },
    { path: '/Users/x/Projects/gone', exists: false, bytes: 6 * M, reclaimableBytes: 6 * M, byCategory: { 'orphan-projects': 6 * M } },
  ],
  ageBuckets: [
    { label: '< 1 d', bytes: 0, byRisk: { safe: 0, caution: 0, review: 0 } }, { label: '1–7 d', bytes: 360 * M, byRisk: { safe: 360 * M, caution: 0, review: 0 } },
    { label: '7–30 d', bytes: 2.9 * G, byRisk: { safe: 233 * M, caution: 2.7 * G, review: 0 } }, { label: '30–90 d', bytes: 0, byRisk: { safe: 0, caution: 0, review: 0 } },
    { label: '> 90 d', bytes: 0, byRisk: { safe: 0, caution: 0, review: 0 } },
  ],
  warnings: [],
  info: [],
}

export const withWarning = (code: 'runaway-output' | 'low-disk', text: string): ScanResult => ({ ...SCAN, warnings: [{ code, text }] })

export const CLEAN: CleanResult = {
  schema: 1, dryRun: true, startedAt: '2026-10-13T12:05:00.000Z', durationMs: 2000,
  requested: { categories: ['worktrees'], only: null, force: false }, freedBytes: 2.7 * G,
  removed: [{ id: 'i_wt1', category: 'worktrees', path: '/a', bytes: 1.4 * G }, { id: 'i_wt2', category: 'worktrees', path: '/b', bytes: 1.3 * G }],
  kept: [{ id: 'i_wt3', category: 'worktrees', path: '/c', reason: 'owned-by-live-session' }], skipped: [], failed: [],
}
