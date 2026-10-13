// One category in detail: where it comes from, what Claude Code cleans
// itself, what sweep removes, every item with its tick or why it is kept,
// and the age of its space. Pure.

import { formatBytes } from '../../charts/format'
import { bucketsOf, histogram } from '../../charts/histogram'
import type { ScanCategory } from '../../types'
import { ChartView, type DrawStyle } from './charts'
import { itemTicked, REASONS } from './model'
import type { El } from './overview'
import { ItemButtons, type ItemActions } from './item-actions'

export type CategoryData = {
  category: ScanCategory
  selected: string[]
  selectedItems: Record<string, string[]>
  bodyColumns: number
  style: DrawStyle
}

export type CategoryActions = ItemActions & {
  back: () => void
  toggleItem: (itemId: string) => void
  cleanBar: () => unknown
}

const RISK_COLOR = { safe: 'success', caution: 'warning', review: 'error' } as const

export function Category(E: El, d: CategoryData, a: CategoryActions) {
  const { Box, Text, Button, Markdown } = E
  const c = d.category
  const wide = d.bodyColumns >= 120
  const ageColumns = wide ? 44 : Math.max(30, d.bodyColumns - 2)
  const ages = histogram(bucketsOf(c.items, c.risk), ageColumns, 6)
  return (
    <Box flexDirection="column" gap={1}>
      <Box key="category-header" justifyContent="space-between">
        <Box gap={1}>
          <Button key="back" label="‹ Back" hotkey="b" onPress={() => a.back()} />
          <Text bold wrap="truncate-end">{`${c.id} · ${c.title} · `}</Text>
          <Text color={RISK_COLOR[c.risk]}>{c.risk}</Text>
        </Box>
        <Text>{`${formatBytes(c.reclaimableBytes)} of ${formatBytes(c.foundBytes)} reclaimable`}</Text>
      </Box>
      <Markdown key="texts" text={`**Where it comes from** ${c.text.creates}\n\n**What Claude Code cleans itself** ${c.text.claude}\n\n**What sweep removes** ${c.text.sweep}`} />
      <Box key="category-body" flexDirection={wide ? 'row' : 'column'} gap={2}>
        <Box key="items" flexDirection="column" flexGrow={1} flexShrink={1} minWidth={0}>
          <Text bold>{`Items (${c.cleanable} of ${c.found} cleanable)`}</Text>
          {c.items.length === 0 && <Text dimColor>Nothing found.</Text>}
          {c.items.map((item) => (
            <Box key={`item-row-${item.id}`} gap={1}>
              {item.cleanable && c.risk !== 'review'
                ? <Button key={`item-${item.id}`} plain label={itemTicked(d.selected, d.selectedItems, c.id, item.id) ? '[x]' : '[ ]'} onPress={() => a.toggleItem(item.id)} />
                : <Text dimColor>{' · '}</Text>}
              <Text>{formatBytes(item.bytes).padStart(6)}</Text>
              <Box flexGrow={1} flexDirection="column">
                <Text wrap="truncate-middle">{item.project ? `${item.project.split('/').pop()}  ${item.label}` : item.label}</Text>
                <Text dimColor wrap="truncate-end">{item.cleanable ? item.note : `kept: ${REASONS[item.reason ?? ''] ?? item.reason}`}</Text>
              </Box>
              {ItemButtons(E, item, c.id, a)}
            </Box>
          ))}
        </Box>
        <Box key="ages-section" flexDirection="column" width={ageColumns} flexShrink={0}>
          <Text bold>Age of this space</Text>
          {ChartView(E, ages, 'ages')}
        </Box>
      </Box>
      {a.cleanBar() as never}
    </Box>
  )
}
