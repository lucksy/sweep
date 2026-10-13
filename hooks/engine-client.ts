// Runs the sweep engine (plain Node) from the mod, which has no Node of its
// own, and parses what it prints. The engine is the only code that reads
// sizes or deletes files.

import type { ScanResult } from '../types'

// Pure helpers: the hooks module makes the $ calls (the engine refuses $ passed across imports).

export const FIVE_MINUTES = 5 * 60_000

export const scanArgv = (root: string) => ['node', `${root}/engine/sweep.mjs`, 'scan', '--json']

export function parseScan(run: { exitCode: number; stdout: string; stderr: string }): ScanResult {
  if (run.exitCode !== 0) throw new Error(run.stderr.trim() || `sweep engine exited ${run.exitCode}`)
  return JSON.parse(run.stdout) as ScanResult
}

export const reclaimable = (scan: ScanResult) => scan.categories.reduce((total, c) => total + (c.reclaimable ?? 0), 0)

export function formatBytes(bytes: number): string {
  const units = ['B', 'K', 'M', 'G', 'T']
  let i = 0
  while (bytes >= 1024 && i < units.length - 1) {
    bytes /= 1024
    i++
  }
  return `${bytes >= 10 || i === 0 ? Math.round(bytes) : bytes.toFixed(1)}${units[i]}`
}
