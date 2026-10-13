import { expect, test } from 'claude-code/testing'

import { RISK } from '../../charts/palette'
import { treemap } from '../../charts/treemap'
import { textOf } from './helpers'

const G = 1024 ** 3, M = 1024 ** 2
const NODES = [
  { id: 'worktrees', label: 'worktrees', value: 2.7 * G, color: RISK.caution },
  { id: 'tmp-sessions', label: 'tmp-sessions', value: 360 * M, color: RISK.safe },
  { id: 'old-cli', label: 'old-cli', value: 238 * M, color: RISK.safe },
  { id: 'plugin-versions', label: 'plugin-versions', value: 199 * M, color: RISK.caution },
  { id: 'config-backups', label: 'config-backups', value: 0.8 * M, color: RISK.safe },
  { id: 'session-leftovers', label: 'session-leftovers', value: 47 * 1024, color: RISK.safe },
]

for (const [columns, rows] of [[60, 14], [40, 8], [100, 20], [24, 6]] as const) {
  test(`treemap ${columns}×${rows}: tiles cover the box without overlap, sized by value`, () => {
    const chart = treemap(NODES, columns, rows)
    const tiles = chart.hit!
    const covered = new Set<string>()
    for (const t of tiles) {
      expect(t.w).toBeGreaterThanOrEqual(2)
      expect(t.h).toBeGreaterThanOrEqual(1)
      for (let y = t.y; y < t.y + t.h; y++) for (let x = t.x; x < t.x + t.w; x++) {
        expect(covered.has(`${x},${y}`)).toBe(false)
        covered.add(`${x},${y}`)
      }
    }
    expect(covered.size).toBe(columns * rows)
    const total = NODES.reduce((t, n) => t + n.value, 0)
    for (const t of tiles.filter((x) => x.id !== '+more')) {
      const expected = (NODES.find((n) => n.id === t.id)!.value / total) * columns * rows
      expect(Math.abs(t.w * t.h - expected)).toBeLessThanOrEqual(t.w + t.h)
    }
    const shown = tiles.map((t) => t.id).filter((id) => id !== '+more')
    expect([...shown, ...chart.merged].sort()).toEqual(NODES.map((n) => n.id).sort())
  })
}

test('the biggest tile is labelled with its name and size; small ones merge into +N more', () => {
  const chart = treemap(NODES, 60, 14)
  const text = textOf(chart).join('\n')
  expect(text).toContain('worktrees')
  expect(text).toContain('2.7G')
  expect(chart.merged.length).toBeGreaterThan(0)
  expect(text).toMatch(/\+\d more/)
})

test('alt and legend', () => {
  const legend = [{ mark: '█', color: '#c47f00', text: 'caution' }]
  const chart = treemap(NODES, 60, 14, legend)
  expect(chart.alt).toBe('Reclaimable: worktrees 2.7G (78%), tmp-sessions 360M (10%), old-cli 238M (7%), and 3 more.')
  expect(chart.legend).toEqual(legend)
  expect(treemap([], 20, 5).alt).toBe('Nothing reclaimable.')
})
