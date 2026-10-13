// Toasts (SPEC-alerts §4): a clean finished, runaway task output found. Pure.

import { formatBytes } from '../../charts/format'
import type { ScanResult } from '../../types'

export const cleanToast = (freedBytes: number, failed: number) => `sweep freed ${formatBytes(freedBytes)}${failed ? ` · ${failed} failed` : ''}`

/** A Bash command that runs this engine's real clean with JSON output (what /sweep:clean runs on yes). */
export const isEngineClean = (command: string) =>
  /engine\/sweep\.mjs['"]?\s+clean\b/.test(command) && /(^|\s)--yes(\s|$)/.test(command) && /(^|\s)--json(\s|$)/.test(command)

/**
 * Freed bytes and failures from a Bash result holding the engine's clean JSON,
 * whatever shape the result arrives in; null when it is not a real clean.
 */
export function cleanFromToolResult(result: unknown): { freed: number; failed: number } | null {
  const text = typeof result === 'string' ? result : JSON.stringify(result ?? '')
  const freed = text.match(/\\?"freedBytes\\?":\s*(\d+(?:\.\d+)?)/)
  if (!freed || !/\\?"dryRun\\?":\s*false/.test(text)) return null
  const failedBlock = text.match(/\\?"failed\\?":\s*\[(.*?)\]/s)?.[1] ?? ''
  return { freed: Number(freed[1]), failed: (failedBlock.match(/\\?"error\\?":/g) ?? []).length }
}

/** Toasts for runaway task output not toasted yet this session; marks them toasted. */
export function runawayToasts(scan: ScanResult, toasted: Set<string>): string[] {
  const out: string[] = []
  for (const w of scan.warnings) {
    if (w.code !== 'runaway-output' || !w.path || toasted.has(w.path)) continue
    toasted.add(w.path)
    out.push(`sweep: a task output file reached ${formatBytes(w.bytes ?? 0)} — /sweep`)
  }
  return out
}
