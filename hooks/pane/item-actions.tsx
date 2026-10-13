// Buttons on an item row: reveal it, copy its path. Pure.

import type { ScanItem } from '../../types'
import type { El } from './overview'

export type ItemActions = {
  reveal: (item: ScanItem) => void
  copy: (item: ScanItem) => void
}

/** What an item stands for on disk: a branch item (`repo → branch`) is its repo. */
export const itemPath = (item: ScanItem) => (item.path.includes(' → ') ? item.project ?? item.path.split(' → ')[0]! : item.path)

/** Finder with the item selected on macOS; the folder holding it elsewhere. */
export function revealArgv(item: ScanItem, platform: string): string[] {
  const p = itemPath(item)
  return platform === 'darwin' ? ['open', '-R', p] : ['xdg-open', p.replace(/\/[^/]*\/?$/, '') || '/']
}

export function ItemButtons(E: El, item: ScanItem, a: ItemActions) {
  const { Box, Button } = E
  return (
    <Box key={`actions-${item.id}`} gap={1} flexShrink={0}>
      <Button key={`reveal-${item.id}`} plain dimColor label="reveal" onPress={() => a.reveal(item)} />
      <Button key={`copy-${item.id}`} plain dimColor label="copy" onPress={() => a.copy(item)} />
    </Box>
  )
}
