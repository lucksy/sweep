import { expect, test, type TestBody } from 'claude-code/testing'

import { bandConditions, bandFor } from '../../hooks/alerts/band'
import type { ScanResult } from '../../types'
import { SCAN } from './fixture'
import { world } from './world'

type $ = Parameters<TestBody>[0]
const G = 1024 ** 3
const BAND = (hasSurvey = false) => ({ hasSurvey, isWorking: false, maxRows: 10, bodyColumns: 120, scroll: { offset: 0, bodyRows: 10 }, view: {} }) as never
const big: ScanResult = { ...SCAN, totals: { ...SCAN.totals, reclaimableBytes: 6.2 * G } }
const warn = (scan: ScanResult, ...w: ScanResult['warnings']) => ({ ...scan, warnings: w })
const runaway = { code: 'runaway-output' as const, text: 'x', bytes: 6 * G, path: '/t/b1.output' }
const lowDisk = { code: 'low-disk' as const, text: 'x', bytes: 60 * G }
const paused = { code: 'sweep-paused' as const, text: 'x' }
const many = { code: 'many-worktrees' as const, text: 'x', count: 14, path: '/Users/x/Projects/aihqlk' }

test('each condition has its line', () => {
  expect(bandConditions(big, 5).map((b) => b.text)).toEqual(['sweep: 6.2G reclaimable · 2.7G in worktrees'])
  expect(bandConditions(warn(SCAN, runaway), 5)[0]?.text).toBe('sweep: a task output file is 6.0G')
  expect(bandConditions(warn(SCAN, lowDisk), 5)[0]?.text).toBe('sweep: disk 6% free · Claude Code can free 3.5G')
  expect(bandConditions(warn(SCAN, paused), 5)[0]).toEqual({ code: 'sweep-paused', text: "sweep: Claude Code's own cleanup is paused (settings error) · see /status", canOpen: false })
  expect(bandConditions(warn(SCAN, many), 5)[0]?.text).toBe('sweep: 14 agent worktrees in aihqlk')
  expect(bandConditions(SCAN, 5)).toEqual([])
})

test('the most severe condition wins; a hidden one stays hidden unless a worse one appears', () => {
  const all = warn(big, many, paused, lowDisk, runaway)
  expect(bandConditions(all, 5).map((b) => b.code)).toEqual(['runaway-output', 'low-disk', 'sweep-paused', 'reclaimable', 'many-worktrees'])
  expect(bandFor(big, 5, ['reclaimable'])).toBe(null)
  expect(bandFor(warn(big, lowDisk), 5, ['reclaimable'])?.code).toBe('low-disk')
  expect(bandFor(big, 10, [])).toBe(null)
})

async function banded($: $, on: Parameters<TestBody>[1], scan: ScanResult) {
  const seen = world(on, { scan })
  await $.session.start({ cwd: '/p', surface: 'terminal', isInteractive: true } as never)
  await seen.clock.advance(61_000)
  await seen.clock.settle()
  return seen
}

test('the band shows after the background scan, and Hide holds for the session', async ($, on) => {
  await banded($, on, big)
  const band = await $.ui.mount({ plugin: 'sweep', surface: 'terminal', component: 'AbovePrompt', props: BAND() })
  expect(await band.find({ text: /^sweep: 6\.2G reclaimable · 2\.7G in worktrees$/ })).toBeDefined()
  expect((await band.find({ key: 'sweep-open' }))?.props.hotkey).toBe('o')
  await band.press({ key: 'sweep-hide' })
  expect(await band.find({ text: /^sweep:/ })).toBeUndefined()
})

test('the band is silent while a survey shows', async ($, on) => {
  await banded($, on, big)
  const band = await $.ui.mount({ plugin: 'sweep', surface: 'terminal', component: 'AbovePrompt', props: BAND(true) })
  expect(await band.find({ text: /^sweep:/ })).toBeUndefined()
})

test('Open opens the pane', async ($, on) => {
  const seen = await banded($, on, big)
  const band = await $.ui.mount({ plugin: 'sweep', surface: 'terminal', component: 'AbovePrompt', props: BAND() })
  await band.press({ key: 'sweep-open' })
  expect(seen.opened).toEqual(['sweep'])
})

test('a lower threshold from settings brings the band sooner', { options: { bandThresholdGB: 3 } }, async ($, on) => {
  await banded($, on, SCAN)
  const band = await $.ui.mount({ plugin: 'sweep', surface: 'terminal', component: 'AbovePrompt', props: BAND() })
  expect(await band.find({ text: /^sweep: 3\.5G reclaimable/ })).toBeDefined()
})
