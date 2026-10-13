// State sweep keeps for the session only. sweep stores no data: nothing here
// outlives the session, and nothing is written to disk or $.store.

export type ScanItem = {
  id?: string
  path: string
  bytes: number
  note?: string
  cleanable: boolean
  reason?: string | null
}
export type ScanCategory = {
  id: string
  title?: string
  risk?: 'safe' | 'caution' | 'review'
  reclaimableBytes: number
  items: ScanItem[]
}
export type ScanResult = { categories: ScanCategory[] }

export type ScanStatus = 'idle' | 'scanning' | 'error'

declare module 'claude-code' {
  interface PluginState {
    sweep: {
      scan: ScanResult | null
      scannedAt: number | null
      status: ScanStatus
      error: string | null
    }
  }
}
