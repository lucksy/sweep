import { expect, test } from 'claude-code/testing'

import { bars } from '../../charts/bars'
import { formatBytes } from '../../charts/format'
import { contrast, KEPT, PARTS, RISK } from '../../charts/palette'
import { cellCode, decodeCells, Grid, toBase64 } from '../../charts/raster'
import { grid, isNarrow, textOf } from './helpers'

const G = 1024 ** 3, M = 1024 ** 2

test('cells pack to columns*rows triplets and decode back', () => {
  const g = new Grid(3, 2)
  g.text(0, 0, 'ab', 0xff0000)
  const packed = g.pack()
  expect(decodeCells(packed.cells).length).toBe(3 * 2 * 3)
  expect(textOf(packed)).toEqual(['ab', ''])
  expect(toBase64(new Uint8Array([1, 2, 3, 4]))).toBe('AQIDBA==')
})

test('user text with wide or control characters cannot break a chart', () => {
  for (const ch of ['日', '😀', '\n', '́', '\u0007']) expect(cellCode(ch)).toBe(0x3f)
  for (const ch of ['a', '█', '…', '⣿', '─']) expect(cellCode(ch)).toBe(ch.codePointAt(0))
})

test('palette colors reach 3:1 on dark and light backgrounds', () => {
  for (const c of [...Object.values(RISK), KEPT, ...PARTS]) {
    expect(contrast(c, 0x1e1e1e)).toBeGreaterThanOrEqual(3)
    expect(contrast(c, 0xffffff)).toBeGreaterThanOrEqual(3)
  }
})

const ROWS = [
  { id: 'old-cli', label: 'old-cli', value: 238 * M, color: RISK.safe },
  { id: 'worktrees', label: 'worktrees', value: 2.7 * G, color: RISK.caution },
  { id: 'plugin-versions', label: 'plugin-versions', value: 199 * M, kept: 16 * M, color: RISK.caution },
  { id: 'tmp-sessions', label: 'tmp-sessions', value: 360 * M, color: RISK.safe },
]

test('bars: one row per input, sorted, one shared scale, every cell narrow', () => {
  const chart = bars(ROWS, 60)
  expect(chart.columns).toBe(60)
  expect(chart.rows).toBe(4)
  const text = textOf(chart)
  expect(text.map((l) => l.split(' ')[0])).toEqual(['worktrees', 'tmp-sessions', 'old-cli', 'plugin-versions'])
  const blocks = (line: string) => [...line].filter((c) => c === '█').length
  expect(blocks(text[0]!)).toBeGreaterThan(blocks(text[1]!) * 5)
  for (const row of grid(chart)) for (const cell of row) expect(isNarrow(cell.ch.codePointAt(0)!)).toBe(true)
  expect(text[0]).toMatch(/2\.7G$/)
})

test('bars: kept bytes draw as a grey tail and say so', () => {
  const chart = bars(ROWS, 60)
  const row = grid(chart)[3]!
  expect(row.some((c) => c.ch === '░' && c.fg === KEPT)).toBe(true)
  expect(textOf(chart)[3]).toMatch(/\+16M kept/)
  expect(chart.legend.map((l) => l.text)).toEqual(['kept (not reclaimable)'])
})

test('bars: the alt names the top three with units, and hit boxes map rows to ids', () => {
  const chart = bars(ROWS, 60)
  expect(chart.alt).toBe('Reclaimable: worktrees 2.7G, tmp-sessions 360M, old-cli 238M, and 1 more.')
  expect(chart.hit?.map((h) => h.id)).toEqual(['worktrees', 'tmp-sessions', 'old-cli', 'plugin-versions'])
  expect(bars([], 40).alt).toBe('Nothing reclaimable.')
})

test('bytes print the way the CLI prints them', () => {
  expect(formatBytes(2.7 * G)).toBe('2.7G')
  expect(formatBytes(360 * M)).toBe('360M')
  expect(formatBytes(0)).toBe('0B')
})
