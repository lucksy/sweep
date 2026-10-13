// Pixel twins of the cell charts, for terminals that draw pictures (kitty,
// Ghostty): the same layout, painted at CELL_PX per cell and sent as a PNG.
// Words stay text beside the picture: the legend names every tile.

import { formatBytes } from './format'
import { CELL_PX, Canvas } from './png'
import { hex, PARTS, RISK } from './palette'
import type { PixelChart } from './raster'
import { stacked, widths, type Part } from './stacked'
import { layout, shade, treemap, type Node } from './treemap'

export function stackedPixels(parts: Part[], columns: number): PixelChart {
  const twin = stacked(parts, columns)
  const c = new Canvas(columns * CELL_PX.w, 2 * CELL_PX.h)
  const total = parts.reduce((t, p) => t + p.bytes, 0)
  let x = 0
  widths(parts, columns).forEach((eighths, i) => {
    const w = (eighths / 8) * CELL_PX.w
    c.fillRect(Math.round(x), 2, Math.max(1, Math.round(x + w) - Math.round(x) - 1), CELL_PX.h - 2, PARTS[i % PARTS.length]!)
    const share = total && parts[i]!.bytes ? Math.min(1, (parts[i]!.reclaimable ?? 0) / parts[i]!.bytes) : 0
    if (share > 0) c.fillRect(Math.round(x), CELL_PX.h + 2, Math.max(1, Math.round(w * share) - 1), 3, RISK.safe)
    x += w
  })
  return { kind: 'pixels', columns, rows: 2, png: c.png(), legend: twin.legend, alt: twin.alt, hit: twin.hit }
}

export function treemapPixels(nodes: Node[], columns: number, rows: number): PixelChart & { merged: string[] } {
  const twin = treemap(nodes, columns, rows)
  const { tiles, merged } = layout(nodes, columns, rows)
  const c = new Canvas(columns * CELL_PX.w, rows * CELL_PX.h)
  const colors = tiles.map((t, k) => (k % 2 ? shade(t.color, 0.82) : t.color))
  tiles.forEach((t, k) => c.fillRect(t.x * CELL_PX.w + 1, t.y * CELL_PX.h + 1, t.w * CELL_PX.w - 2, t.h * CELL_PX.h - 2, colors[k]!))
  return {
    kind: 'pixels', columns, rows, png: c.png(), merged: merged.map((n) => n.id),
    // No words in the picture: the legend names each tile, in its color.
    legend: tiles.map((t, k) => ({ mark: '█', color: hex(colors[k]!), text: `${t.label} ${formatBytes(t.value)}` })),
    alt: twin.alt,
    hit: twin.hit,
  }
}
