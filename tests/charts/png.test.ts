import { expect, test } from 'claude-code/testing'

import { PARTS, RISK } from '../../charts/palette'
import { stackedPixels, treemapPixels } from '../../charts/pixels'
import { decodeCells } from '../../charts/raster'
import { stacked } from '../../charts/stacked'
import { treemap } from '../../charts/treemap'

const G = 1024 ** 3, M = 1024 ** 2
const NODES = [
  { id: 'worktrees', label: 'worktrees', value: 2.7 * G, color: RISK.caution },
  { id: 'tmp-sessions', label: 'tmp-sessions', value: 360 * M, color: RISK.safe },
  { id: 'old-cli', label: 'old-cli', value: 238 * M, color: RISK.safe },
]
const PARTS_IN = [
  { key: 'worktrees', label: 'Agent worktrees', bytes: 2.8 * G, reclaimable: 2.7 * G },
  { key: 'claude.plugins', label: 'Plugins', bytes: 2.1 * G },
]

// The bytes of a base64 PNG, and its width and height from IHDR.
function png(b64: string) {
  const words = decodeCells(b64.padEnd(Math.ceil(b64.length / 16) * 16, '='))
  const bytes = new Uint8Array(words.buffer)
  const be = (at: number) => (bytes[at]! << 24) | (bytes[at + 1]! << 16) | (bytes[at + 2]! << 8) | bytes[at + 3]!
  return { bytes, signature: [...bytes.slice(0, 8)], ihdr: String.fromCharCode(...bytes.slice(12, 16)), width: be(16), height: be(20) }
}

test('pixel charts are valid PNGs at 6×12 px per cell', () => {
  const t = png(treemapPixels(NODES, 60, 14).png)
  expect(t.signature).toEqual([137, 80, 78, 71, 13, 10, 26, 10])
  expect(t.ihdr).toBe('IHDR')
  expect([t.width, t.height]).toEqual([360, 168])
  const s = png(stackedPixels(PARTS_IN, 80).png)
  expect([s.width, s.height]).toEqual([480, 24])
})

test('a 120×30-cell picture stays under 2 MiB', () => {
  const b64 = treemapPixels(NODES, 120, 30).png
  expect((b64.length * 3) / 4).toBeLessThan(2 * 1024 * 1024)
})

test('each pixel chart keeps its cell twin\'s alt and hit boxes', () => {
  expect(stackedPixels(PARTS_IN, 80).alt).toBe(stacked(PARTS_IN, 80).alt)
  expect(stackedPixels(PARTS_IN, 80).legend).toEqual(stacked(PARTS_IN, 80).legend)
  const pixel = treemapPixels(NODES, 60, 14)
  const cell = treemap(NODES, 60, 14)
  expect(pixel.alt).toBe(cell.alt)
  expect(pixel.hit).toEqual(cell.hit)
  expect(pixel.legend.map((l) => l.text)).toEqual(['worktrees 2.7G', 'tmp-sessions 360M', 'old-cli 238M'])
  expect(PARTS.length).toBe(8)
})
