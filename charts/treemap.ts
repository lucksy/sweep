// A squarified treemap over a box of cells (SPEC-charts §2). Cells are about
// twice as tall as wide, so the layout runs in a space of columns × rows*2.
// Tiles too small to read merge into "+N more".

import { formatBytes } from './format'
import { contrast, KEPT } from './palette'
import { Grid, type CellChart, type HitBox, type LegendPart } from './raster'

export type Node = { id: string; label: string; value: number; color: number }
type Rect = { x: number; y: number; w: number; h: number }
type Placed = Node & Rect

const MORE = '+more'

// Bruls, Huizing & van Wijk: lay rows along the shorter side, keeping tiles near square.
function squarify(nodes: Node[], rect: Rect): Placed[] {
  const total = nodes.reduce((t, n) => t + n.value, 0)
  if (!nodes.length || total <= 0) return []
  const scale = (rect.w * rect.h) / total
  const areas = nodes.map((n) => n.value * scale)
  const out: Placed[] = []
  let { x, y, w, h } = rect
  let i = 0
  while (i < nodes.length) {
    const side = Math.min(w, h)
    let row = [i]
    let worst = ratio(row.map((k) => areas[k]!), side)
    while (i + row.length < nodes.length) {
      const next = [...row, i + row.length]
      const r = ratio(next.map((k) => areas[k]!), side)
      if (r > worst) break
      row = next
      worst = r
    }
    const sum = row.reduce((t, k) => t + areas[k]!, 0)
    const thick = sum / side
    let offset = 0
    for (const k of row) {
      const len = areas[k]! / thick
      out.push(w >= h ? { ...nodes[k]!, x, y: y + offset, w: thick, h: len } : { ...nodes[k]!, x: x + offset, y, w: len, h: thick })
      offset += len
    }
    if (w >= h) { x += thick; w -= thick } else { y += thick; h -= thick }
    i += row.length
  }
  return out
}

function ratio(areas: number[], side: number) {
  const sum = areas.reduce((t, a) => t + a, 0)
  const max = Math.max(...areas), min = Math.min(...areas)
  return Math.max((side * side * max) / (sum * sum), (sum * sum) / (side * side * min))
}

// Rounded to whole cells by rounding edges, so neighbours share their edge exactly.
const toCells = (p: Placed) => {
  const x0 = Math.round(p.x), x1 = Math.round(p.x + p.w), y0 = Math.round(p.y / 2), y1 = Math.round((p.y + p.h) / 2)
  return { ...p, x: x0, y: y0, w: x1 - x0, h: y1 - y0 }
}

// Every tile at least 2 columns × 1 row; the smallest go into one "+N more" tile until that holds.
function layout(nodes: Node[], columns: number, rows: number) {
  const sorted = [...nodes].filter((n) => n.value > 0).sort((a, b) => b.value - a.value)
  for (let keep = sorted.length; keep >= 0; keep--) {
    const rest = sorted.slice(keep)
    const shown: Node[] = [...sorted.slice(0, keep), ...(rest.length ? [{ id: MORE, label: `+${rest.length} more`, value: rest.reduce((t, n) => t + n.value, 0), color: KEPT }] : [])]
    const tiles = squarify(shown, { x: 0, y: 0, w: columns, h: rows * 2 }).map(toCells)
    if (tiles.every((t) => t.w >= 2 && t.h >= 1)) return { tiles, merged: rest }
  }
  return { tiles: [], merged: sorted }
}

const shade = (c: number, f: number) => [16, 8, 0].reduce((out, s) => out | (Math.round(((c >> s) & 0xff) * f) << s), 0)

/** `legend` says what the colors mean (the caller knows: risk levels, parts). */
export function treemap(nodes: Node[], columns: number, rows: number, legend: LegendPart[] = []): CellChart & { merged: string[] } {
  const g = new Grid(columns, rows)
  const { tiles, merged } = layout(nodes, columns, rows)
  tiles.forEach((t, k) => {
    // Neighbouring tiles of one color alternate a little darker, so their edge shows.
    const bg = k % 2 ? shade(t.color, 0.82) : t.color
    const fg = contrast(0x000000, bg) >= contrast(0xffffff, bg) ? 0x000000 : 0xffffff
    for (let yy = t.y; yy < t.y + t.h; yy++) for (let xx = t.x; xx < t.x + t.w; xx++) g.set(xx, yy, 0x20, fg, bg)
    const fit = (s: string) => ([...s].length > t.w - 1 ? `${[...s].slice(0, Math.max(1, t.w - 2)).join('')}…` : s)
    g.text(t.x + (t.w > 2 ? 1 : 0), t.y, fit(t.label), fg, bg)
    if (t.h >= 2) g.text(t.x + (t.w > 2 ? 1 : 0), t.y + 1, fit(formatBytes(t.value)), fg, bg)
    else if ([...t.label].length + 6 < t.w) g.text(t.x + 2 + [...t.label].length, t.y, formatBytes(t.value), fg, bg)
  })
  const total = nodes.reduce((t, n) => t + Math.max(0, n.value), 0)
  const pct = (v: number) => `${Math.round((v / total) * 100)}%`
  const top = [...nodes].sort((a, b) => b.value - a.value).slice(0, 3).filter((n) => n.value > 0)
  const hit: HitBox[] = tiles.map((t) => ({ x: t.x, y: t.y, w: t.w, h: t.h, id: t.id }))
  return {
    ...g.pack(),
    legend,
    alt: total ? `Reclaimable: ${top.map((n) => `${n.label} ${formatBytes(n.value)} (${pct(n.value)})`).join(', ')}${nodes.length > 3 ? `, and ${nodes.length - 3} more` : ''}.` : 'Nothing reclaimable.',
    hit,
    merged: merged.map((n) => n.id),
  }
}
