// The pane's charts, drawn as a Raster (cells), an Image (pixels) or, where
// the surface has neither, their legend and alt as text. Pure.

import type { Chart, LegendPart } from '../../charts/raster'
import { hex, RISK } from '../../charts/palette'
import { stackedPixels, treemapPixels } from '../../charts/pixels'
import { stacked } from '../../charts/stacked'
import { treemap } from '../../charts/treemap'
import type { ScanResult } from '../../types'
import type { El } from './overview'

export type DrawStyle = 'cells' | 'pixels' | 'text'

export function footprintChart(scan: ScanResult, columns: number, style: DrawStyle): Chart {
  const reclaimableByPart: Record<string, number> = {
    worktrees: ['worktrees', 'worktree-deps'].reduce((t, id) => t + (scan.categories.find((c) => c.id === id)?.reclaimableBytes ?? 0), 0),
    tmp: scan.categories.find((c) => c.id === 'tmp-sessions')?.reclaimableBytes ?? 0,
    'claude.projects': ['transcripts', 'orphan-projects'].reduce((t, id) => t + (scan.categories.find((c) => c.id === id)?.reclaimableBytes ?? 0), 0),
    'claude.plugins': ['plugin-versions', 'plugin-orphan-data', 'marketplace-deps'].reduce((t, id) => t + (scan.categories.find((c) => c.id === id)?.reclaimableBytes ?? 0), 0),
    'claude.fileHistory': scan.categories.find((c) => c.id === 'file-history')?.reclaimableBytes ?? 0,
    cli: scan.categories.find((c) => c.id === 'old-cli')?.reclaimableBytes ?? 0,
  }
  const parts = scan.footprint.parts.map((p) => ({ ...p, reclaimable: reclaimableByPart[p.key] ?? 0 }))
  return style === 'pixels' ? stackedPixels(parts, columns) : stacked(parts, columns)
}

const RISK_LEGEND: LegendPart[] = (['safe', 'caution', 'review'] as const).map((r) => ({ mark: '█', color: hex(RISK[r]), text: r }))

export function reclaimTreemap(scan: ScanResult, columns: number, rows: number, style: DrawStyle): Chart {
  const nodes = scan.categories.filter((c) => c.reclaimableBytes > 0).map((c) => ({ id: c.id, label: c.id, value: c.reclaimableBytes, color: RISK[c.risk] }))
  const used = new Set(scan.categories.filter((c) => c.reclaimableBytes > 0).map((c) => c.risk))
  const legend = RISK_LEGEND.filter((l) => used.has(l.text as 'safe'))
  return style === 'pixels' ? treemapPixels(nodes, columns, rows) : treemap(nodes, columns, rows, legend)
}

export function Legend(E: El, legend: LegendPart[], key: string) {
  const { Box, Text } = E
  return (
    <Box key={key} flexWrap="wrap" columnGap={2}>
      {legend.map((l, i) => (
        <Box key={`${key}-${i}`} gap={1}>
          <Text color={l.color ?? undefined}>{l.mark}</Text>
          <Text dimColor>{l.text}</Text>
        </Box>
      ))}
    </Box>
  )
}

/** A chart as the surface can draw it, its legend under it. */
export function ChartView(E: El, chart: Chart, key: string) {
  const { Box, Text, Raster, Image } = E
  const body = chart.kind === 'pixels' && Image
    ? <Image key={key} source={{ png: chart.png }} columns={chart.columns} rows={chart.rows} alt={chart.alt} />
    : chart.kind === 'cells' && Raster
      ? <Raster key={key} columns={chart.columns} rows={chart.rows} cells={chart.cells} />
      : <Box key={key}><Text wrap="wrap">{chart.alt}</Text></Box>
  return (
    <Box key={`${key}-box`} flexDirection="column">
      {body}
      {chart.legend.length > 0 && Legend(E, chart.legend, `${key}-legend`)}
    </Box>
  )
}
