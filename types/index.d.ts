// sweep's session state and the engine contract it holds. sweep stores no
// data: nothing here outlives the session, and nothing is written to disk or
// $.store. The contract mirrors SPEC-engine §Contract (schema 1).

export type Risk = 'safe' | 'caution' | 'review'

export type ScanItem = {
  id: string
  path: string
  label: string
  bytes: number
  ageDays: number | null
  project: string | null
  cleanable: boolean
  reason: string | null
  note: string
  detail: Record<string, unknown>
}

export type ScanCategory = {
  id: string
  title: string
  group: string
  risk: Risk
  text: { creates: string; claude: string; sweep: string }
  foundBytes: number
  reclaimableBytes: number
  found: number
  cleanable: number
  error: string | null
  items: ScanItem[]
}

export type FootprintPart = { key: string; label: string; bytes: number }
export type Warning = { code: 'runaway-output' | 'low-disk' | 'sweep-paused' | 'many-worktrees'; text: string; path?: string; bytes?: number; count?: number }
export type ProjectRow = { path: string; exists: boolean; bytes: number; reclaimableBytes: number; byCategory: Record<string, number> }

export type ScanResult = {
  schema: 1
  tool: { name: string; version: string }
  scannedAt: string
  durationMs: number
  options: { days: number | null; force: boolean }
  host: { platform: string; claudeDir: string; tmpRoot: string; cliVersion: string | null }
  disk: { path: string; totalBytes: number; freeBytes: number }
  footprint: { totalBytes: number; parts: FootprintPart[] }
  totals: { reclaimableBytes: number; safeBytes: number; keptBytes: number }
  categories: ScanCategory[]
  projects: ProjectRow[]
  ageBuckets: { label: string; bytes: number; byRisk: Record<Risk, number> }[]
  warnings: Warning[]
  info: { key: string; value: string; text: string }[]
}

export type CleanRow = { id: string; category: string; path: string }
export type CleanResult = {
  schema: 1
  dryRun: boolean
  mode?: 'delete' | 'trash'
  startedAt: string
  durationMs: number
  requested: { categories: string[]; only: string[] | null; force: boolean }
  freedBytes: number
  removed: (CleanRow & { bytes: number })[]
  kept: (CleanRow & { reason: string })[]
  skipped: { id: string; reason: string }[]
  failed: (CleanRow & { error: string })[]
}

export type ScanStatus = 'idle' | 'scanning' | 'error'
export type Progress = { index: number; total: number; id: string | null }
export type View = 'overview' | 'category' | 'projects' | 'project'
export type Flow = 'idle' | 'dryrun' | 'confirm' | 'cleaning' | 'done' | 'error'

declare module 'claude-code' {
  interface PluginState {
    sweep: {
      scan: ScanResult | null
      scannedAt: number | null
      status: ScanStatus
      error: string | null
      progress: Progress | null
      view: View
      focusId: string | null
      selected: string[]
      selectedItems: Record<string, string[]>
      projectFilter: string | null
      focusProject: string | null
      flow: Flow
      dry: CleanResult | null
      result: CleanResult | null
      freedThisSession: number
      cleaning: { removed: number; freed: number } | null
      cleanError: string | null
      hidden: string[]
    }
  }
}
