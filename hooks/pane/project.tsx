// One project in detail: its space by category, and every item of it with
// its tick or the reason it is kept. Opened from the Projects tab. Pure.

import { bars } from '../../charts/bars'
import { formatBytes } from '../../charts/format'
import { RISK } from '../../charts/palette'
import type { ScanResult } from '../../types'
import { ChartView, type DrawStyle } from './charts'
import { itemTicked, REASONS } from './model'
import type { El } from './overview'
import { ItemButtons, type ItemActions } from './item-actions'

export type ProjectData = {
  scan: ScanResult
  path: string
  selected: string[]
  selectedItems: Record<string, string[]>
  bodyColumns: number
  style: DrawStyle
}

export type ProjectActions = ItemActions & {
  back: () => void
  selectAll: () => void
  toggleItem: (categoryId: string, itemId: string) => void
  cleanBar: () => unknown
}

const RISK_COLOR = { safe: 'success', caution: 'warning', review: 'error' } as const

export function Project(E: El, d: ProjectData, a: ProjectActions) {
  const { Box, Text, Button } = E
  const row = d.scan.projects.find((p) => p.path === d.path)
  const groups = d.scan.categories
    .map((c) => ({ c, items: c.items.filter((i) => i.project === d.path) }))
    .filter((g) => g.items.length > 0)
  const reclaimable = groups.reduce((t, g) => t + g.items.filter((i) => i.cleanable).reduce((s, i) => s + i.bytes, 0), 0)
  const found = groups.reduce((t, g) => t + g.items.reduce((s, i) => s + i.bytes, 0), 0)
  const chart = bars(groups.map(({ c, items }) => ({
    id: c.id, label: c.id, color: RISK[c.risk],
    value: items.filter((i) => i.cleanable).reduce((s, i) => s + i.bytes, 0),
    kept: items.filter((i) => !i.cleanable).reduce((s, i) => s + i.bytes, 0),
  })), Math.max(40, Math.min(100, d.bodyColumns - 2)))

  return (
    <Box flexDirection="column" gap={1}>
      <Box key="project-header" justifyContent="space-between">
        <Box gap={1} flexShrink={1} minWidth={0}>
          <Button key="back" label="‹ Back" hotkey="b" onPress={() => a.back()} />
          <Text bold wrap="truncate-middle">{d.path}</Text>
          {row && !row.exists && <Text color="warning">(gone)</Text>}
        </Box>
        <Box gap={2} flexShrink={0}>
          <Text>{`${formatBytes(reclaimable)} of ${formatBytes(found)} reclaimable`}</Text>
          {reclaimable > 0 && <Button key="select-project" label="Select all" hotkey="a" onPress={() => a.selectAll()} />}
        </Box>
      </Box>
      {groups.length === 0
        ? <Text dimColor>Nothing of this project was found.</Text>
        : ChartView(E, chart, 'project-categories')}
      {groups.map(({ c, items }) => (
        <Box key={`group-${c.id}`} flexDirection="column">
          <Box gap={1}>
            <Text bold>{c.id}</Text>
            <Text color={RISK_COLOR[c.risk]}>{c.risk}</Text>
            <Text dimColor wrap="truncate-end">{`· ${c.title}`}</Text>
          </Box>
          {items.map((item) => (
            <Box key={`project-item-${item.id}`} gap={1}>
              {item.cleanable && c.risk !== 'review'
                ? <Button key={`item-${item.id}`} plain label={itemTicked(d.selected, d.selectedItems, c.id, item.id) ? '[x]' : '[ ]'} onPress={() => a.toggleItem(c.id, item.id)} />
                : <Text dimColor>{' · '}</Text>}
              <Box width={7} flexShrink={0}><Text>{formatBytes(item.bytes).padStart(6)}</Text></Box>
              <Box flexGrow={1} flexShrink={1} minWidth={0} flexDirection="column">
                <Text wrap="truncate-middle">{item.label}</Text>
                <Text dimColor wrap="truncate-end">{item.cleanable ? item.note : `kept: ${REASONS[item.reason ?? ''] ?? item.reason}`}</Text>
              </Box>
              {ItemButtons(E, item, c.id, a)}
            </Box>
          ))}
        </Box>
      ))}
      {a.cleanBar() as never}
    </Box>
  )
}
