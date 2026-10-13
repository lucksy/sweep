// Horizontal bars, one row each, sorted by size, sharing one scale: label,
// bar (reclaimable in its risk color, then a grey tail for what is kept),
// value. SPEC-charts §3.

import { formatBytes } from './format'
import { KEPT, NONE, hex } from './palette'
import { EIGHTHS, Grid, type CellChart } from './raster'

export type BarRow = { id: string; label: string; value: number; kept?: number; color: number }

export function bars(input: BarRow[], columns: number): CellChart {
  const rows = [...input].sort((a, b) => b.value - a.value || (b.kept ?? 0) - (a.kept ?? 0))
  const anyKept = rows.some((r) => (r.kept ?? 0) > 0)
  const labelW = Math.min(20, Math.max(4, ...rows.map((r) => [...r.label].length)))
  const valueW = anyKept ? 18 : 7
  const barW = Math.max(4, columns - labelW - 2 - valueW)
  const max = Math.max(1, ...rows.map((r) => r.value + (r.kept ?? 0)))
  const g = new Grid(columns, Math.max(1, rows.length))

  rows.forEach((r, y) => {
    const label = [...r.label].length > labelW ? `${[...r.label].slice(0, labelW - 1).join('')}…` : r.label
    g.text(0, y, label, NONE)
    const eighths = (bytes: number) => Math.round((bytes / max) * barW * 8)
    const main = eighths(r.value)
    const tail = r.kept ? Math.max(1, eighths(r.value + r.kept) - main) : 0
    const x0 = labelW + 1
    for (let i = 0; i < Math.floor(main / 8); i++) g.set(x0 + i, y, EIGHTHS[8]!, r.color)
    if (main % 8) g.set(x0 + Math.floor(main / 8), y, EIGHTHS[main % 8]!, r.color)
    // The kept tail starts on the next whole cell and is drawn as light shade.
    const tailStart = x0 + Math.ceil(main / 8)
    for (let i = 0; i < Math.ceil(tail / 8); i++) g.set(tailStart + i, y, 0x2591, KEPT)
    const value = formatBytes(r.value).padStart(6)
    const keptText = r.kept ? ` +${formatBytes(r.kept)} kept` : ''
    g.text(columns - valueW, y, `${value}${keptText}`.slice(0, valueW), NONE)
  })

  const top = rows.slice(0, 3).map((r) => `${r.label} ${formatBytes(r.value)}`).join(', ')
  return {
    ...g.pack(),
    // Each row names itself; the legend only explains the grey tail.
    legend: anyKept ? [{ mark: '░', color: hex(KEPT), text: 'kept (not reclaimable)' }] : [],
    alt: rows.length ? `Reclaimable: ${top}${rows.length > 3 ? `, and ${rows.length - 3} more` : ''}.` : 'Nothing reclaimable.',
    hit: rows.map((r, y) => ({ x: 0, y, w: columns, h: 1, id: r.id })),
  }
}
