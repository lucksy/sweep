import { expect, test } from 'claude-code/testing'

import { statusText } from '../../hooks/alerts/status'
import { SCAN, withWarning } from './fixture'
import { world } from './world'

const M = 1024 ** 2

test('one read-only background scan a minute after the session starts', async ($, on) => {
  const seen = world(on, { scan: SCAN })
  await $.session.start({ cwd: '/p', surface: 'terminal', isInteractive: true } as never)
  await seen.clock.advance(59_000)
  expect(seen.spawns.length).toBe(0)
  await seen.clock.advance(2_000)
  await seen.clock.settle()
  expect(seen.spawns.length).toBe(1)
  await seen.clock.advance(10 * 60_000)
  await seen.clock.settle()
  expect(seen.spawns.length).toBe(1)
  for (const argv of seen.spawns) {
    expect(argv).toContain('scan')
    expect(argv).not.toContain('clean')
  }
  expect(seen.status.at(-1)).toBe('sweep 3.5G')
})

test('no background scan when it is turned off', { options: { backgroundScan: false } }, async ($, on) => {
  const seen = world(on, { scan: SCAN })
  await $.session.start({ cwd: '/p', surface: 'terminal', isInteractive: true } as never)
  await seen.clock.advance(5 * 60_000)
  await seen.clock.settle()
  expect(seen.spawns.length).toBe(0)
  expect(seen.status).toEqual([])
})

test('status text: none, normal, warning, quiet below 100 MB, off', () => {
  expect(statusText(null, true)).toBe(undefined)
  expect(statusText(SCAN, true)).toBe('sweep 3.5G')
  expect(statusText(withWarning('low-disk', 'disk 6% free'), true)).toBe('sweep 3.5G ⚠')
  const small = { ...SCAN, totals: { ...SCAN.totals, reclaimableBytes: 50 * M } }
  expect(statusText(small, true)).toBe(undefined)
  expect(statusText({ ...small, warnings: withWarning('runaway-output', 'x').warnings }, true)).toBe('sweep 50M ⚠')
  expect(statusText(SCAN, false)).toBe(undefined)
})

test('the status line stays off when the setting is off', { options: { statusLine: false } }, async ($, on) => {
  const seen = world(on, { scan: SCAN })
  await $.session.start({ cwd: '/p', surface: 'terminal', isInteractive: true } as never)
  await seen.clock.advance(61_000)
  await seen.clock.settle()
  expect(seen.spawns.length).toBe(1)
  expect(seen.status.every((s) => s === undefined)).toBe(true)
  expect(seen.stored).toEqual([])
})

test('the scanRoots setting reaches the engine as --roots', { options: { scanRoots: '~/work, ~/code' } }, async ($, on) => {
  const seen = world(on, { scan: SCAN })
  await $.session.start({ cwd: '/p', surface: 'terminal', isInteractive: true } as never)
  await seen.clock.advance(61_000)
  await seen.clock.settle()
  expect(seen.spawns[0]?.slice(-2)).toEqual(['--roots', '~/work, ~/code'])
})
