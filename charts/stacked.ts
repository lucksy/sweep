// The footprint bar (SPEC-charts §1): one row of parts sized by bytes, with
// eighth-cell precision where two parts meet, and a second row underlining
// the reclaimable share of each part.

import { formatBytes } from './format'
import { PARTS, RISK, hex } from './palette'
import { EIGHTHS, Grid, type CellChart } from './raster'

export type Part = { key: string; label: string; bytes: number; reclaimable?: number }

/** Each part's width in eighths of a cell, summing to columns*8; a part of 1% or more gets a cell at least. */
export function widths(parts: Part[], columns: number): number[] {
  const total = parts.reduce((t, p) => t + p.bytes, 0)
  const full = columns * 8
  if (!total) return parts.map(() => 0)
  const w = parts.map((p) => Math.round((p.bytes / total) * full))
  parts.forEach((p, i) => { if (p.bytes / total >= 0.01 && w[i]! < 8) w[i] = 8 })
  const widest = w.indexOf(Math.max(...w))
  w[widest] = w[widest]! + full - w.reduce((t, x) => t + x, 0)
  return w
}

export function stacked(parts: Part[], columns: number): CellChart {
  const g = new Grid(columns, 2)
  const w = widths(parts, columns)
  const color = (i: number) => PARTS[i % PARTS.length]!
  // Spans in eighths: [start, end) per part.
  let at = 0
  const spans = w.map((n) => { const s = [at, at + n] as const; at += n; return s })

  for (let c = 0; c < columns; c++) {
    const lo = c * 8, hi = lo + 8
    const inCell = spans.map(([s, e], i) => ({ i, n: Math.max(0, Math.min(e, hi) - Math.max(s, lo)) })).filter((x) => x.n > 0)
    if (!inCell.length) continue
    const [first, second] = inCell
    if (!second || first!.n === 8) g.set(c, 0, EIGHTHS[8]!, color(first!.i))
    else g.set(c, 0, EIGHTHS[first!.n]!, color(first!.i), color(second.i))
  }
  // Underline the reclaimable share at the start of each part.
  parts.forEach((p, i) => {
    const share = p.bytes ? Math.min(1, (p.reclaimable ?? 0) / p.bytes) : 0
    const [s, e] = spans[i]!
    const end = s + Math.round((e - s) * share)
    for (let c = Math.round(s / 8); c < Math.round(end / 8); c++) g.set(c, 1, 0x2580, RISK.safe)
  })

  const total = parts.reduce((t, p) => t + p.bytes, 0)
  const reclaimable = parts.reduce((t, p) => t + (p.reclaimable ?? 0), 0)
  const top = [...parts].sort((a, b) => b.bytes - a.bytes).slice(0, 3).map((p) => `${p.label} ${formatBytes(p.bytes)}`).join(', ')
  return {
    ...g.pack(),
    legend: [
      ...parts.map((p, i) => ({ part: p, i })).filter(({ part }) => part.bytes > 0).map(({ part, i }) => ({ mark: '█', color: hex(color(i)), text: `${part.label} ${formatBytes(part.bytes)}` })),
      ...(reclaimable ? [{ mark: '▀', color: hex(RISK.safe), text: `reclaimable ${formatBytes(reclaimable)}` }] : []),
    ],
    alt: total ? `Claude Code uses ${formatBytes(total)}: ${top}; ${formatBytes(reclaimable)} reclaimable.` : 'Claude Code uses nothing here.',
    hit: parts.map((p, i) => ({ x: Math.round(spans[i]![0] / 8), y: 0, w: Math.max(0, Math.round(spans[i]![1] / 8) - Math.round(spans[i]![0] / 8)), h: 2, id: p.key })).filter((h) => h.w > 0),
  }
}
