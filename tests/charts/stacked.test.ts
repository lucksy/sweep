import { expect, test } from 'claude-code/testing'

import { PARTS, RISK } from '../../charts/palette'
import { stacked, widths } from '../../charts/stacked'
import { grid, textOf } from './helpers'

const G = 1024 ** 3, M = 1024 ** 2
const PARTS_IN = [
  { key: 'worktrees', label: 'Agent worktrees', bytes: 2.8 * G, reclaimable: 2.7 * G },
  { key: 'tmp', label: 'Temp sessions', bytes: 1.6 * G, reclaimable: 0.36 * G },
  { key: 'claude.projects', label: 'Transcripts', bytes: 1.4 * G },
  { key: 'claude.plugins', label: 'Plugins', bytes: 2.1 * G, reclaimable: 0.2 * G },
  { key: 'claude.fileHistory', label: 'Checkpoints', bytes: 0.09 * G },
  { key: 'claudeJson', label: '~/.claude.json', bytes: 1.4 * M },
]

test('segment widths sum to the width, and a part of 1% or more is always visible', () => {
  for (const columns of [20, 57, 100, 143]) {
    const w = widths(PARTS_IN, columns)
    expect(w.reduce((t, x) => t + x, 0)).toBe(columns * 8)
    expect(w[4]).toBeGreaterThanOrEqual(8)  // checkpoints: ~1%
    const chart = stacked(PARTS_IN, columns)
    const colors = new Set(grid(chart)[0]!.flatMap((c) => [c.fg, c.bg]))
    expect(colors.has(PARTS[4]!)).toBe(true)
  }
})

test('two rows: parts, then the reclaimable share underlined in green', () => {
  const chart = stacked(PARTS_IN, 80)
  expect(chart.rows).toBe(2)
  const under = grid(chart)[1]!.filter((c) => c.ch === '▀')
  expect(under.length).toBeGreaterThan(20)
  expect(under.every((c) => c.fg === RISK.safe)).toBe(true)
  expect(textOf(chart)[0]!.length).toBe(80)
})

test('legend, alt and hit boxes', () => {
  const chart = stacked(PARTS_IN, 80)
  expect(chart.legend[0]).toEqual({ mark: '█', color: '#1f8fd1', text: 'Agent worktrees 2.8G' })
  expect(chart.legend.at(-1)?.text).toBe('reclaimable 3.3G')
  expect(chart.alt).toBe('Claude Code uses 8.0G: Agent worktrees 2.8G, Plugins 2.1G, Temp sessions 1.6G; 3.3G reclaimable.')
  expect(chart.hit?.[0]).toEqual({ x: 0, y: 0, w: 28, h: 2, id: 'worktrees' })
  expect(stacked([], 40).alt).toBe('Claude Code uses nothing here.')
})
