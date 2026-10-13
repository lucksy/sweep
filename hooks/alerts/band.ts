// The band above the prompt (SPEC-alerts §3): one line for the most severe
// condition, unless hidden for this session. Pure.

import { formatBytes } from '../../charts/format'
import type { ScanResult } from '../../types'

export type BandCode = 'runaway-output' | 'low-disk' | 'sweep-paused' | 'reclaimable' | 'many-worktrees'
export type Band = { code: BandCode; text: string; canOpen: boolean }

// Most severe first.
const ORDER: BandCode[] = ['runaway-output', 'low-disk', 'sweep-paused', 'reclaimable', 'many-worktrees']
const GB = 1024 ** 3

export function bandConditions(scan: ScanResult, thresholdGB: number): Band[] {
  const out: Band[] = []
  const reclaim = formatBytes(scan.totals.reclaimableBytes)
  for (const w of scan.warnings) {
    if (w.code === 'runaway-output') out.push({ code: w.code, text: `sweep: a task output file is ${formatBytes(w.bytes ?? 0)}`, canOpen: true })
    if (w.code === 'low-disk') out.push({ code: w.code, text: `sweep: disk ${Math.round(((w.bytes ?? 0) / Math.max(1, scan.disk.totalBytes)) * 100)}% free · Claude Code can free ${reclaim}`, canOpen: true })
    if (w.code === 'sweep-paused') out.push({ code: w.code, text: "sweep: Claude Code's own cleanup is paused (settings error) · see /status", canOpen: false })
    if (w.code === 'many-worktrees') out.push({ code: w.code, text: `sweep: ${w.count ?? 0} agent worktrees in ${(w.path ?? '').split('/').pop()}`, canOpen: true })
  }
  if (scan.totals.reclaimableBytes >= thresholdGB * GB) {
    const top = [...scan.categories].sort((a, b) => b.reclaimableBytes - a.reclaimableBytes)[0]
    out.push({ code: 'reclaimable', text: `sweep: ${reclaim} reclaimable${top ? ` · ${formatBytes(top.reclaimableBytes)} in ${top.id}` : ''}`, canOpen: true })
  }
  return out.sort((a, b) => ORDER.indexOf(a.code) - ORDER.indexOf(b.code))
}

/** The band to draw: the most severe condition, unless that one is hidden this session. */
export function bandFor(scan: ScanResult | null, thresholdGB: number, hidden: string[]): Band | null {
  if (!scan) return null
  const best = bandConditions(scan, thresholdGB)[0]
  return best && !hidden.includes(best.code) ? best : null
}
