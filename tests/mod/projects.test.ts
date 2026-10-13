import { expect, test, type TestBody } from 'claude-code/testing'

import type { ScanResult } from '../../types'
import { CLEAN, SCAN } from './fixture'
import { PANE_PROPS, run, world } from './world'

type $ = Parameters<TestBody>[0]

async function open($: $, on: Parameters<TestBody>[1], scan: ScanResult = SCAN) {
  const seen = world(on, { scan, clean: CLEAN })
  await $.session.start({ cwd: '/p', surface: 'terminal', isInteractive: true } as never)
  await $.command.run(run())
  await seen.clock.settle()
  const pane = await $.ui.mount({ plugin: 'sweep', surface: 'terminal', component: 'Pane', requestId: 'sweep', props: PANE_PROPS })
  return { seen, pane }
}

test('tab 2 shows reclaimable space per project, gone ones marked', async ($, on) => {
  const { pane } = await open($, on)
  expect((await pane.find({ key: 'tab-projects' }))?.props.hotkey).toBe('2')
  await pane.press({ key: 'tab-projects' })
  expect(await pane.find({ text: /^Reclaimable by project: 2 with something to clean$/ })).toBeDefined()
  expect((await pane.find({ key: 'project-bars' }))?.type).toBe('Raster')
  expect(await pane.find({ text: /^\/Users\/x\/Projects\/gone \(gone\)$/ })).toBeDefined()
  expect((await pane.find({ key: 'tab-projects' }))?.props.variant).toBe('primary')
})

test('picking a project opens its details: space by category, every item, why kept', async ($, on) => {
  const { pane } = await open($, on)
  await pane.press({ key: 'tab-projects' })
  await pane.press({ key: 'project-0' })
  expect(await pane.find({ text: /^\/Users\/x\/Projects\/Tree-Testing $/ })).toBeDefined()
  expect(await pane.find({ text: /^2\.7G of 2\.7G reclaimable$/ })).toBeDefined()
  expect((await pane.find({ key: 'project-categories' }))?.type).toBe('Raster')
  expect(await pane.find({ key: 'group-worktrees' })).toBeDefined()
  expect(await pane.find({ key: 'item-i_wt1' })).toBeDefined()
  expect(await pane.find({ key: 'item-i_wt3' })).toBeUndefined()  // another project's
  expect((await pane.find({ key: 'tab-projects' }))?.props.variant).toBe('primary')
  await pane.press({ key: 'back' })
  expect(await pane.find({ key: 'project-0' })).toBeDefined()
})

test('Select all in a project, then Clean, passes its items as --only', async ($, on) => {
  const { seen, pane } = await open($, on)
  await pane.press({ key: 'tab-projects' })
  await pane.press({ key: 'project-0' })
  await pane.press({ key: 'select-project' })
  expect(await pane.find({ text: /^Selected: 1 category · 2\.7G$/ })).toBeDefined()
  await pane.press({ key: 'clean' })
  expect(seen.spawns.find((a) => a.includes('clean'))?.slice(2)).toEqual(['clean', 'worktrees', '--only', 'i_wt1,i_wt2', '--json', '--progress'])
})

test('a gone project is marked, and ticking one item selects only it', async ($, on) => {
  const scan = { ...SCAN, categories: SCAN.categories.map((c) => c.id === 'tmp-sessions' ? { ...c, items: c.items.map((i) => ({ ...i, project: '/Users/x/Projects/gone' })) } : c) }
  const { pane } = await open($, on, scan)
  await pane.press({ key: 'tab-projects' })
  await pane.press({ key: 'project-1' })
  expect(await pane.find({ text: /^\(gone\)$/ })).toBeDefined()
  await pane.press({ key: 'item-i_tmp1' })
  expect(await pane.find({ text: /^Selected: 1 category · 360M$/ })).toBeDefined()
})

test('a partly selected category shows [~] in the overview', async ($, on) => {
  const { pane } = await open($, on)
  await pane.press({ key: 'tab-projects' })
  await pane.press({ key: 'project-0' })
  await pane.press({ key: 'item-i_wt1' })
  await pane.press({ key: 'tab-overview' })
  expect((await pane.find({ key: 'toggle-worktrees' }))?.props.label).toBe('[~]')
})

const many = Array.from({ length: 20 }, (_, i) => ({ path: `/p/project-${i}`, exists: true, bytes: (20 - i) * 1e6, reclaimableBytes: (20 - i) * 1e6, byCategory: { 'tmp-sessions': (20 - i) * 1e6 } }))
for (const [name, projects, expected] of [
  ['no projects', [], /^No project holds anything/],
  ['one project', SCAN.projects.slice(0, 1), /^Reclaimable by project: 1 with something to clean$/],
  ['more than fifteen', many, /^Reclaimable by project: 15 with something to clean \(20 seen\)$/],
] as const) {
  test(`projects: ${name}`, async ($, on) => {
    const { pane } = await open($, on, { ...SCAN, projects: [...projects] })
    await pane.press({ key: 'tab-projects' })
    expect(await pane.find({ text: expected })).toBeDefined()
    if (projects.length > 15) expect(await pane.find({ key: 'project-15' })).toBeUndefined()
  })
}

test('switching tabs keeps the selection', async ($, on) => {
  const { pane } = await open($, on)
  await pane.press({ key: 'toggle-worktrees' })
  await pane.press({ key: 'tab-projects' })
  await pane.press({ key: 'tab-overview' })
  expect(await pane.find({ text: /^Selected: 1 category · 2\.7G$/ })).toBeDefined()
})
