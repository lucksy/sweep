import { expect, test } from 'claude-code/testing'

import { bucketsOf, histogram } from '../../charts/histogram'
import { RISK } from '../../charts/palette'
import { grid, textOf } from './helpers'

const M = 1024 ** 2
const empty = () => bucketsOf([], 'safe')

test('bucketsOf sorts cleanable items by age and skips kept ones', () => {
  const b = bucketsOf([
    { bytes: 10, ageDays: 0, cleanable: true }, { bytes: 5, ageDays: 200, cleanable: true },
    { bytes: 7, ageDays: 23, cleanable: true }, { bytes: 99, ageDays: 3, cleanable: false }, { bytes: 4, ageDays: null, cleanable: true },
  ], 'caution')
  expect(b.map((x) => x.bytes)).toEqual([10, 0, 7, 0, 5])
  expect(b[2]!.byRisk).toEqual({ safe: 0, caution: 7, review: 0 })
})

test('empty buckets draw only the labels', () => {
  const chart = histogram(empty(), 40, 6)
  expect(textOf(chart).slice(0, 5).every((l) => l === '')).toBe(true)
  expect(textOf(chart)[5]).toMatch(/< 1 d/)
  expect(chart.alt).toBe('Nothing reclaimable.')
})

test('one full bucket fills its column to the top, in its risk color', () => {
  const b = empty()
  b[2] = { label: '7–30 d', bytes: 2700 * M, byRisk: { safe: 0, caution: 2700 * M, review: 0 } }
  const chart = histogram(b, 40, 6)
  const cells = grid(chart)
  const col = 2 * 8  // third column starts at 2 * (colW + 1), colW = 7
  for (let row = 0; row < 5; row++) {
    expect(cells[row]![col]!.ch).toBe('█')
    expect(cells[row]![col]!.fg).toBe(RISK.caution)
  }
  expect(cells[0]![0]!.ch).toBe(' ')
  expect(chart.alt).toBe('Reclaimable by age: 7–30 d 2.6G.')
  expect(chart.legend.map((l) => l.text)).toEqual(['caution'])
})

test('narrow columns use short labels', () => {
  expect(textOf(histogram(empty(), 25, 4))[3]).toBe('<1d  1-7d 7-30d30-90>90d')
})
