// Builds the engine's argv and reads what it prints. Pure: the hooks module
// makes the $ calls (the engine refuses $ passed across imports).

import type { CleanResult, Progress, ScanResult } from '../types'

export const FIVE_MINUTES = 5 * 60_000

const engine = (root: string) => `${root}/engine/sweep.mjs`

/** The scan the pane and alerts run: JSON on stdout, NDJSON progress on stderr. */
export const scanArgv = (root: string) => ['node', engine(root), 'scan', '--json', '--progress']
/** The same scan as plain text, for a terminal too narrow for the pane. */
export const textArgv = (root: string, args: string[] = ['scan']) => ['node', engine(root), ...args]
export const cleanArgv = (root: string, categories: string[], { yes = false, only = null as string[] | null } = {}) =>
  ['node', engine(root), 'clean', ...categories, ...(only?.length ? ['--only', only.join(',')] : []), ...(yes ? ['--yes'] : []), '--json', '--progress']

export function parseScan(run: { exitCode: number; stdout: string; stderr: string }): ScanResult {
  if (run.exitCode !== 0) throw new Error(run.stderr.trim() || `sweep engine exited ${run.exitCode}`)
  const result = JSON.parse(run.stdout) as ScanResult
  if (result.schema !== 1) throw new Error('the sweep engine and pane disagree on the contract; reinstall sweep')
  return result
}

export function parseClean(stdout: string): CleanResult {
  const result = JSON.parse(stdout) as CleanResult
  if (result.schema !== 1) throw new Error('the sweep engine and pane disagree on the contract; reinstall sweep')
  return result
}

/** Complete NDJSON lines from a buffer, and what is left of a line still arriving. */
export function takeLines(buffer: string): { events: Record<string, unknown>[]; rest: string } {
  const parts = buffer.split('\n')
  const rest = parts.pop() ?? ''
  const events = parts.filter((l) => l.trim()).flatMap((l) => {
    try { return [JSON.parse(l) as Record<string, unknown>] } catch { return [] }
  })
  return { events, rest }
}

export const progressOf = (event: Record<string, unknown>): Progress | null =>
  event.event === 'category' ? { index: Number(event.index), total: Number(event.total), id: String(event.id) } : null

export { formatBytes } from '../charts/format'
export const reclaimable = (scan: ScanResult) => scan.totals.reclaimableBytes
