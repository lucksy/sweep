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
  expect(await pane.find({ text: /^Reclaimable by project \(top 2 of 2\)$/ })).toBeDefined()
  expect((await pane.find({ key: 'project-bars' }))?.type).toBe('Raster')
  expect(await pane.find({ text: /^\/Users\/x\/Projects\/gone \(gone\)$/ })).toBeDefined()
  expect((await pane.find({ key: 'tab-projects' }))?.props.label).toBe('[Projects]')
})

test('picking a project selects its items and cleans them with --only', async ($, on) => {
  const { seen, pane } = await open($, on)
  await pane.press({ key: 'tab-projects' })
  await pane.press({ key: 'project-0' })
  expect(await pane.find({ text: /^Selected: the items of \/Users\/x\/Projects\/Tree-Testing $/ })).toBeDefined()
  expect(await pane.find({ text: /^Selected: 1 category · 2\.7G$/ })).toBeDefined()
  await pane.press({ key: 'clean' })
  expect(seen.spawns.find((a) => a.includes('clean'))?.slice(2)).toEqual(['clean', 'worktrees', '--only', 'i_wt1,i_wt2', '--json', '--progress'])
  await pane.press({ key: 'cancel' })
  await pane.press({ key: 'clear-filter' })
  expect(await pane.find({ text: /^Selected: 0 categories · 0B$/ })).toBeDefined()
})

const many = Array.from({ length: 20 }, (_, i) => ({ path: `/p/project-${i}`, exists: true, bytes: (20 - i) * 1e6, reclaimableBytes: (20 - i) * 1e6, byCategory: { 'tmp-sessions': (20 - i) * 1e6 } }))
for (const [name, projects, expected] of [
  ['no projects', [], /^No project holds anything/],
  ['one project', SCAN.projects.slice(0, 1), /\(top 1 of 1\)/],
  ['more than fifteen', many, /\(top 15 of 20\)/],
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
