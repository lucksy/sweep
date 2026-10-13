// The Overview tab: header, warnings, scan progress and the category table.
// Pure: it gets the surface's elements, the data and callbacks; the hooks
// module makes every $ call.

import type { Elements } from 'claude-code'

import { formatBytes } from '../../charts/format'
import type { Progress, ScanResult, ScanStatus } from '../../types'
import { footprintChart, reclaimTreemap, ChartView, type DrawStyle } from './charts'
import { headline, isWide, selectable } from './model'

export type El = Pick<Elements['terminal'], 'Box' | 'Text' | 'Button' | 'Markdown'> & Partial<Pick<Elements['terminal'], 'Raster' | 'Image'>>

export type OverviewData = {
  scan: ScanResult | null
  status: ScanStatus
  error: string | null
  progress: Progress | null
  scannedAgo: string | null
  selected: string[]
  selectedItems: Record<string, string[]>
  bodyColumns: number
  freedThisSession: number
  style: DrawStyle
  projectFilter: string | null
}

export type OverviewActions = {
  rescan: () => void
  toggle: (id: string) => void
  selectSafe: () => void
  drill: (id: string) => void
  /** The clean flow's bar, drawn under the table (hooks/pane/clean.tsx). */
  cleanBar: () => unknown
  /** The tab bar (hooks/pane/projects.tsx). */
  tabs: () => unknown
  clearFilter: () => void
}

const RISK_COLOR = { safe: 'success', caution: 'warning', review: 'error' } as const

export function ProgressLine(E: El, progress: Progress | null, width: number) {
  const { Box, Text } = E
  const done = progress ? progress.index / Math.max(1, progress.total) : 0
  const barW = Math.max(10, Math.min(40, width - 40))
  const filled = Math.round(done * barW)
  return (
    <Box key="progress">
      <Text dimColor>{`Scanning Claude Code's storage… ${progress ? `${progress.index}/${progress.total} ${progress.id ?? ''}` : ''} `}</Text>
      <Text color="suggestion">{'█'.repeat(filled)}</Text>
      <Text dimColor>{'░'.repeat(barW - filled)}</Text>
    </Box>
  )
}

export function Header(E: El, d: OverviewData, a: Pick<OverviewActions, 'rescan'>) {
  const { Box, Text, Button } = E
  return (
    <Box key="header" flexDirection="column">
      <Box justifyContent="space-between">
        <Text bold wrap="truncate-end">{d.scan ? headline(d.scan) : 'sweep: what Claude Code stores on this machine'}</Text>
        <Box gap={1}>
          {d.scannedAgo && <Text dimColor>{`scanned ${d.scannedAgo}`}</Text>}
          <Button key="rescan" label="Rescan" hotkey="r" onPress={() => a.rescan()} />
        </Box>
      </Box>
      {(d.scan?.warnings ?? []).map((w, i) => (
        <Box key={`warning-${i}`}><Text color="error" wrap="truncate-end">{`⚠ ${w.text}`}</Text></Box>
      ))}
      {d.status === 'scanning' && ProgressLine(E, d.progress, d.bodyColumns)}
      {d.error && <Text color="error">{`Scan failed: ${d.error}`}</Text>}
    </Box>
  )
}

export function CategoryTable(E: El, d: OverviewData, a: OverviewActions) {
  const { Box, Text, Button } = E
  const scan = d.scan
  if (!scan) return null
  const review = scan.categories.filter((c) => c.risk === 'review' && c.found > 0)
  return (
    <Box key="table" flexDirection="column">
      <Box>
        <Box width={4}><Text dimColor>{' '}</Text></Box>
        <Box width={20}><Text dimColor>Category</Text></Box>
        <Box width={9}><Text dimColor>Risk</Text></Box>
        <Box width={8}><Text dimColor>Size</Text></Box>
        <Box width={9}><Text dimColor>Items</Text></Box>
      </Box>
      {scan.categories.filter((c) => c.found > 0 || c.reclaimableBytes > 0).map((c) => (
        <Box key={`row-${c.id}`}>
          <Box width={4}>
            {selectable(c)
              ? <Button key={`toggle-${c.id}`} plain label={d.selected.includes(c.id) ? '[x]' : '[ ]'} onPress={() => a.toggle(c.id)} />
              : <Text dimColor>{'   '}</Text>}
          </Box>
          <Box width={20}><Text wrap="truncate-end">{c.id}</Text></Box>
          <Box width={9}><Text color={RISK_COLOR[c.risk]}>{c.risk}</Text></Box>
          <Box width={8}><Text>{formatBytes(c.reclaimableBytes).padStart(6)}</Text></Box>
          <Box width={9}><Text dimColor>{`${c.cleanable}/${c.found}`.padStart(7)}</Text></Box>
          <Box flexGrow={1}><Text dimColor wrap="truncate-end">{c.title}</Text></Box>
          <Button key={`drill-${c.id}`} plain label="›" onPress={() => a.drill(c.id)} />
        </Box>
      ))}
      {review.length > 0 && (
        <Text dimColor wrap="truncate-end">{`review: ${review.map((c) => c.id).join(', ')} need --force; ask in chat: /sweep:clean <id> --force`}</Text>
      )}
    </Box>
  )
}

/** Charts beside the table when the pane is wide, above it when narrow. */
export function Overview(E: El, d: OverviewData, a: OverviewActions) {
  const { Box, Text } = E
  const scan = d.scan
  const wide = isWide(d.bodyColumns)
  const width = Math.max(20, d.bodyColumns - 2)
  const mapColumns = wide ? Math.floor(width * 0.42) : width
  return (
    <Box flexDirection="column" gap={1}>
      {Header(E, d, a)}
      {a.tabs() as never}
      {d.projectFilter && (
        <Box key="filter" gap={2}>
          <Text color="suggestion" wrap="truncate-middle">{`Selected: the items of ${d.projectFilter}`}</Text>
          <E.Button key="clear-filter" label="Clear" hotkey="x" onPress={() => a.clearFilter()} />
        </Box>
      )}
      {!scan && d.status !== 'scanning' && !d.error && <Text dimColor>No scan yet. Press r to scan.</Text>}
      {scan && (
        <Box key="footprint-section" flexDirection="column">
          <Text bold>Footprint</Text>
          {ChartView(E, footprintChart(scan, width, d.style), 'footprint')}
        </Box>
      )}
      {scan && (
        <Box key="body" flexDirection={wide ? 'row' : 'column'} gap={wide ? 3 : 1}>
          {scan.totals.reclaimableBytes > 0 && (
            <Box key="map-section" flexDirection="column" width={mapColumns}>
              <Text bold>Reclaimable</Text>
              {ChartView(E, reclaimTreemap(scan, mapColumns, wide ? 14 : 8, d.style), 'treemap')}
            </Box>
          )}
          <Box key="table-section" flexDirection="column" flexGrow={1}>
            {CategoryTable(E, d, a)}
          </Box>
        </Box>
      )}
      {a.cleanBar() as never}
    </Box>
  )
}
