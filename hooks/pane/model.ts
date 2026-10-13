// Pure pane logic: layout, selection and what the header says.

import type { ScanCategory, ScanResult } from '../../types'
import { formatBytes } from '../../charts/format'

/** Body columns at which charts sit beside the table instead of above it. */
export const WIDE = 140

export const isWide = (bodyColumns: number) => bodyColumns >= WIDE

export function ago(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000))
  if (s < 45) return 'just now'
  if (s < 90 * 60) return `${Math.round(s / 60)} min ago`
  return `${Math.round(s / 3600)} h ago`
}

export const percent = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 100) : 0)

export function headline(scan: ScanResult): string {
  const { disk, footprint, totals } = scan
  return `Claude Code uses ${formatBytes(footprint.totalBytes)} · ${formatBytes(totals.reclaimableBytes)} reclaimable · disk ${formatBytes(disk.freeBytes)} free (${percent(disk.freeBytes, disk.totalBytes)}%)`
}

/** Categories the pane can tick: anything but review (that needs --force in chat). */
export const selectable = (c: ScanCategory) => c.risk !== 'review' && c.cleanable > 0

export const safeIds = (scan: ScanResult) => scan.categories.filter((c) => c.risk === 'safe' && selectable(c)).map((c) => c.id)

export const toggle = (list: string[], id: string) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id])

/** Bytes a clean of the selection would free: whole categories, or the ticked items where some were unticked. */
export function selectedBytes(scan: ScanResult, selected: string[], selectedItems: Record<string, string[]>): number {
  return scan.categories.filter((c) => selected.includes(c.id)).reduce((total, c) => {
    const only = selectedItems[c.id]
    return total + (only ? c.items.filter((i) => i.cleanable && only.includes(i.id)).reduce((t, i) => t + i.bytes, 0) : c.reclaimableBytes)
  }, 0)
}

/** The ticked categories in report order, ready for the engine. */
export const selectedIds = (scan: ScanResult, selected: string[]) => scan.categories.map((c) => c.id).filter((id) => selected.includes(id))

/** Item ids for `--only` when some items of a ticked category were unticked; null when whole categories go. */
export function onlyIds(scan: ScanResult, selected: string[], selectedItems: Record<string, string[]>): string[] | null {
  if (!selected.some((id) => selectedItems[id])) return null
  return scan.categories.filter((c) => selected.includes(c.id)).flatMap((c) => selectedItems[c.id] ?? c.items.filter((i) => i.cleanable).map((i) => i.id))
}

/** Kept reasons in plain words (the engine's REASONS, engine/text.mjs). */
export const REASONS: Record<string, string> = {
  dirty: 'uncommitted changes',
  'unique-commits': 'commits on no other branch (--force in chat removes the folder, keeps the branch)',
  locked: 'locked by a running agent',
  'live-session': 'belongs to a running session',
  'owned-by-live-session': 'created during a session still running in this repo (--force in chat)',
  'git-error': 'git could not read it',
  'running-version': 'used by the running CLI version',
  'in-use': 'marked in use by a session',
  recent: 'changed in the last day',
  'unknown-origin': 'original folder unknown (--force in chat)',
  review: 'needs review (--force in chat)',
}

/** Whether an item is ticked: its category is, and no item list leaves it out. */
export const itemTicked = (selected: string[], selectedItems: Record<string, string[]>, categoryId: string, itemId: string) =>
  selected.includes(categoryId) && (!selectedItems[categoryId] || selectedItems[categoryId]!.includes(itemId))

/** Ticks or unticks one item, keeping `selected` and `selectedItems` consistent. */
export function toggleItem(scan: ScanResult, selected: string[], selectedItems: Record<string, string[]>, categoryId: string, itemId: string) {
  const all = scan.categories.find((c) => c.id === categoryId)?.items.filter((i) => i.cleanable).map((i) => i.id) ?? []
  const current = selected.includes(categoryId) ? selectedItems[categoryId] ?? all : []
  const next = current.includes(itemId) ? current.filter((id) => id !== itemId) : [...current, itemId]
  const items = { ...selectedItems }
  delete items[categoryId]
  if (!next.length) return { selected: selected.filter((id) => id !== categoryId), selectedItems: items }
  if (next.length < all.length) items[categoryId] = all.filter((id) => next.includes(id))
  return { selected: selected.includes(categoryId) ? selected : [...selected, categoryId], selectedItems: items }
}

/** A project's cleanable items, as a selection: its categories and their item ids. */
export function projectSelection(scan: ScanResult, project: string) {
  const selectedItems: Record<string, string[]> = {}
  for (const c of scan.categories) {
    if (c.risk === 'review') continue
    const ids = c.items.filter((i) => i.cleanable && i.project === project).map((i) => i.id)
    if (ids.length) selectedItems[c.id] = ids
  }
  return { selected: Object.keys(selectedItems), selectedItems }
}
