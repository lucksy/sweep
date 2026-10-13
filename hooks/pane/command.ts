// What `/sweep <args>` asks for. Pure.

export const CATEGORY_IDS = [
  'worktrees', 'worktree-deps', 'worktree-branches', 'tmp-sessions', 'plugin-versions', 'transcripts', 'orphan-projects',
  'file-history', 'session-leftovers', 'old-cli', 'config-backups', 'plugin-orphan-data', 'marketplace-deps',
]
export const REVIEW_IDS = ['plugin-orphan-data', 'marketplace-deps']

export type SweepCommand =
  | { kind: 'open' }
  | { kind: 'scan' }
  | { kind: 'clean'; ids: string[] | 'safe' }
  | { kind: 'explain'; id: string }
  | { kind: 'text'; args: string[] }
  | { kind: 'error'; text: string }

export const USAGE = 'Usage: /sweep [scan | clean <category...|safe> | explain <category> | text [scan | explain <category>]]'
const unknown = (ids: string[]) => `Unknown category: ${ids.join(', ')}. Categories: ${CATEGORY_IDS.join(', ')}`

export function parseSweep(args: string): SweepCommand {
  const [sub = '', ...rest] = args.trim().split(/\s+/).filter(Boolean)
  if (!sub) return { kind: 'open' }
  if (sub === 'scan') return { kind: 'scan' }
  if (sub === 'clean') {
    if (!rest.length) return { kind: 'error', text: `Name what to clean. ${USAGE}` }
    if (rest.includes('safe')) return { kind: 'clean', ids: 'safe' }
    const bad = rest.filter((id) => !CATEGORY_IDS.includes(id))
    if (bad.length) return { kind: 'error', text: unknown(bad) }
    const review = rest.filter((id) => REVIEW_IDS.includes(id))
    if (review.length) return { kind: 'error', text: `${review.join(', ')} need --force; ask in chat: /sweep:clean ${review.join(' ')} --force` }
    return { kind: 'clean', ids: rest }
  }
  if (sub === 'explain') {
    if (!rest[0] || !CATEGORY_IDS.includes(rest[0])) return { kind: 'error', text: rest[0] ? unknown([rest[0]]) : `Name a category. ${USAGE}` }
    return { kind: 'explain', id: rest[0] }
  }
  if (sub === 'text') {
    const [what = 'scan', id] = rest
    if (what === 'explain') return id && CATEGORY_IDS.includes(id) ? { kind: 'text', args: ['explain', id] } : { kind: 'error', text: id ? unknown([id]) : `Name a category. ${USAGE}` }
    return what === 'scan' ? { kind: 'text', args: ['scan'] } : { kind: 'error', text: USAGE }
  }
  return { kind: 'error', text: USAGE }
}
