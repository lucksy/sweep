// The status line entry (SPEC-alerts §2). Pure.

import { formatBytes } from '../../charts/format'
import type { ScanResult } from '../../types'

export const QUIET_BYTES = 100 * 1024 ** 2

/** `sweep 3.5G`, `sweep 3.5G ⚠`, or undefined (no entry). */
export function statusText(scan: ScanResult | null, enabled: boolean): string | undefined {
  if (!enabled || !scan) return undefined
  const warned = scan.warnings.length > 0
  if (scan.totals.reclaimableBytes < QUIET_BYTES && !warned) return undefined
  return `sweep ${formatBytes(scan.totals.reclaimableBytes)}${warned ? ' ⚠' : ''}`
}

/** Seconds after the session starts before the background scan runs. */
export const BACKGROUND_DELAY_MS = 60_000
