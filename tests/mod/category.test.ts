import { expect, test, type TestBody } from 'claude-code/testing'

import { toggleItem } from '../../hooks/pane/model'
import { CLEAN, SCAN } from './fixture'
import { PANE_PROPS, run, world } from './world'

type $ = Parameters<TestBody>[0]

async function drilled($: $, on: Parameters<TestBody>[1], id = 'worktrees') {
  const seen = world(on, { scan: SCAN, clean: CLEAN })
  await $.session.start({ cwd: '/p', surface: 'terminal', isInteractive: true } as never)
  await $.command.run(run())
  await seen.clock.settle()
  const pane = await $.ui.mount({ plugin: 'sweep', surface: 'terminal', component: 'Pane', requestId: 'sweep', props: PANE_PROPS })
  await pane.press({ key: `drill-${id}` })
  return { seen, pane }
}

test('the drill-down explains the category and lists every item', async ($, on) => {
  const { pane } = await drilled($, on)
  expect(await pane.find({ text: /^worktrees · Agent and workflow worktrees · $/ })).toBeDefined()
  expect(await pane.find({ text: /^2\.7G of 2\.7G reclaimable$/ })).toBeDefined()
  const texts = await pane.find({ key: 'texts' })
  expect(texts?.type).toBe('Markdown')
  expect(String(texts?.props.text)).toMatch(/\*\*Where it comes from\*\* Where worktrees comes from\./)
  expect(String(texts?.props.text)).toMatch(/\*\*What sweep removes\*\*/)
  expect(await pane.find({ text: /^Items \(2 of 3 cleanable\)$/ })).toBeDefined()
  expect(await pane.find({ key: 'item-i_wt1' })).toBeDefined()
})

test('kept items show why and cannot be ticked', async ($, on) => {
  const { pane } = await drilled($, on)
  expect(await pane.find({ key: 'item-i_wt3' })).toBeUndefined()
  expect(await pane.find({ text: /^kept: created during a session still running in this repo \(--force in chat\)$/ })).toBeDefined()
})

test('ticking single items sets the Clean total and the --only list', async ($, on) => {
  const { seen, pane } = await drilled($, on)
  expect((await pane.find({ key: 'item-i_wt1' }))?.props.label).toBe('[ ]')
  await pane.press({ key: 'item-i_wt2' })
  expect(await pane.find({ text: /^Selected: 1 category · 1\.3G$/ })).toBeDefined()
  expect((await pane.find({ key: 'item-i_wt1' }))?.props.label).toBe('[ ]')
  expect((await pane.find({ key: 'item-i_wt2' }))?.props.label).toBe('[x]')
  await pane.press({ key: 'clean' })
  expect(seen.spawns.find((a) => a.includes('clean'))?.slice(2)).toEqual(['clean', 'worktrees', '--only', 'i_wt2', '--json', '--progress'])
})

test('the age histogram matches the category\'s items', async ($, on) => {
  const { pane } = await drilled($, on)
  const ages = await pane.find({ key: 'ages' })
  expect(ages?.type).toBe('Raster')
  expect(await pane.find({ text: /^Age of this space$/ })).toBeDefined()
})

test('Back returns to the overview', async ($, on) => {
  const { pane } = await drilled($, on)
  await pane.press({ key: 'back' })
  expect(await pane.find({ key: 'toggle-worktrees' })).toBeDefined()
})

test('toggleItem keeps selected and selectedItems consistent', () => {
  let s = toggleItem(SCAN, [], {}, 'worktrees', 'i_wt1')
  expect(s).toEqual({ selected: ['worktrees'], selectedItems: { worktrees: ['i_wt1'] } })
  s = toggleItem(SCAN, s.selected, s.selectedItems, 'worktrees', 'i_wt2')
  expect(s).toEqual({ selected: ['worktrees'], selectedItems: {} })
  s = toggleItem(SCAN, s.selected, s.selectedItems, 'worktrees', 'i_wt1')
  expect(s).toEqual({ selected: ['worktrees'], selectedItems: { worktrees: ['i_wt2'] } })
  s = toggleItem(SCAN, s.selected, s.selectedItems, 'worktrees', 'i_wt2')
  expect(s).toEqual({ selected: [], selectedItems: {} })
})
