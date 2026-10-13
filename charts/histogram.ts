// Age of reclaimable space (SPEC-charts §4): five columns, oldest right,
// bytes stacked by risk from the bottom, the bucket under each column.

import { formatBytes } from './format'
import { hex, RISK, type Risk } from './palette'
import { Grid, type CellChart } from './raster'

export type Bucket = { label: string; bytes: number; byRisk: Record<Risk, number> }

const LIMITS: [string, number][] = [['< 1 d', 1], ['1–7 d', 7], ['7–30 d', 30], ['30–90 d', 90], ['> 90 d', Infinity]]
const SHORT = ['<1d', '1-7d', '7-30d', '30-90d', '>90d']

/** The buckets of one category's cleanable items, as the engine computes them for all. */
export function bucketsOf(items: { bytes: number; ageDays: number | null; cleanable: boolean }[], risk: Risk): Bucket[] {
  const buckets = LIMITS.map(([label]) => ({ label, bytes: 0, byRisk: { safe: 0, caution: 0, review: 0 } }))
  for (const i of items) {
    if (!i.cleanable || i.ageDays == null) continue
    const b = buckets[LIMITS.findIndex(([, max]) => i.ageDays! < max)]!
    b.bytes += i.bytes
    b.byRisk[risk] += i.bytes
  }
  return buckets
}

// Lower blocks: index n is n eighths of a cell, from the bottom.
const LOWER = [0x20, 0x2581, 0x2582, 0x2583, 0x2584, 0x2585, 0x2586, 0x2587, 0x2588]
const ORDER: Risk[] = ['safe', 'caution', 'review']

export function histogram(buckets: Bucket[], columns: number, rows: number): CellChart {
  const g = new Grid(columns, rows)
  const plot = Math.max(1, rows - 1)
  const colW = Math.max(1, Math.floor(columns / buckets.length) - 1)
  const max = Math.max(1, ...buckets.map((b) => b.bytes))
  buckets.forEach((b, k) => {
    const x0 = k * (colW + 1)
    // Eighths of the column height each risk takes, stacked bottom up.
    let base = 0
    for (const risk of ORDER) {
      const top = base + Math.round((b.byRisk[risk] / max) * plot * 8)
      for (let e = base; e < top; e += 8 - (e % 8)) {
        const row = plot - 1 - Math.floor(e / 8)
        const fill = Math.min(8, top - Math.floor(e / 8) * 8)
        for (let x = 0; x < colW; x++) g.set(x0 + x, row, LOWER[fill]!, RISK[risk])
      }
      base = top
    }
    const label = (colW >= 6 ? b.label : SHORT[k]!).slice(0, colW + 1)
    g.text(x0, plot, label, 0x737a80)
  })
  const filled = buckets.filter((b) => b.bytes > 0).sort((a, b) => b.bytes - a.bytes)
  return {
    ...g.pack(),
    legend: ORDER.filter((r) => buckets.some((b) => b.byRisk[r] > 0)).map((r) => ({ mark: '█', color: hex(RISK[r]), text: r })),
    alt: filled.length ? `Reclaimable by age: ${filled.slice(0, 3).map((b) => `${b.label} ${formatBytes(b.bytes)}`).join(', ')}.` : 'Nothing reclaimable.',
    hit: buckets.map((b, k) => ({ x: k * (colW + 1), y: 0, w: colW, h: plot, id: b.label })),
  }
}
