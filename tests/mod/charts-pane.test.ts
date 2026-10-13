import { expect, test, type TestBody } from 'claude-code/testing'

import { SCAN } from './fixture'
import { PANE_PROPS, run, world } from './world'

type $ = Parameters<TestBody>[0]
const open = async ($: $, seen: ReturnType<typeof world>) => {
  await $.session.start({ cwd: '/p', surface: 'terminal', isInteractive: true } as never)
  await $.command.run(run())
  await seen.clock.settle()
}
const mount = ($: $, surface: 'terminal' | 'desktop', bodyColumns = 150) =>
  $.ui.mount({ plugin: 'sweep', surface, component: 'Pane', requestId: 'sweep', props: { ...(PANE_PROPS as object), bodyColumns } as never })

test('cells: the footprint bar and the treemap are Rasters with their legends', { options: { chartStyle: 'cells' } }, async ($, on) => {
  const seen = world(on, { scan: SCAN })
  await open($, seen)
  const pane = await mount($, 'terminal')
  const footprint = await pane.find({ key: 'footprint' })
  expect(footprint?.type).toBe('Raster')
  expect(footprint?.props.columns).toBe(148)
  expect((await pane.find({ key: 'treemap' }))?.type).toBe('Raster')
  expect(await pane.find({ text: /^Agent worktrees 2\.8G$/ })).toBeDefined()
  expect(await pane.find({ text: /^reclaimable 3\.5G$/ })).toBeDefined()
  expect(await pane.find({ text: /^caution$/ })).toBeDefined()
})

test('pixels: the same charts are Images carrying their alt', { options: { chartStyle: 'pixels' } }, async ($, on) => {
  const seen = world(on, { scan: SCAN })
  await open($, seen)
  const pane = await mount($, 'terminal')
  const footprint = await pane.find({ key: 'footprint' })
  expect(footprint?.type).toBe('Image')
  expect(String(footprint?.props.alt)).toMatch(/^Claude Code uses 7\.3G: Agent worktrees 2\.8G/)
  expect((await pane.find({ key: 'treemap' }))?.type).toBe('Image')
})

test('auto picks pixels in Ghostty and cells elsewhere; never inside tmux', async ($, on) => {
  const seen = world(on, { scan: SCAN }, { TERM_PROGRAM: 'ghostty' })
  await open($, seen)
  expect((await (await mount($, 'terminal')).find({ key: 'footprint' }))?.type).toBe('Image')
})

test('auto in an ordinary terminal draws cells', async ($, on) => {
  const seen = world(on, { scan: SCAN }, { TERM_PROGRAM: 'Apple_Terminal' })
  await open($, seen)
  expect((await (await mount($, 'terminal')).find({ key: 'footprint' }))?.type).toBe('Raster')
})

test('a surface without Raster gets each chart as its alt text', async ($, on) => {
  const seen = world(on, { scan: SCAN })
  await open($, seen)
  const pane = await mount($, 'desktop')
  const footprint = await pane.find({ key: 'footprint' })
  expect(footprint?.type).toBe('Box')
  expect(footprint?.text).toMatch(/^Claude Code uses 7\.3G/)
  expect((await pane.find({ key: 'treemap' }))?.text).toMatch(/^Reclaimable: worktrees 2\.7G/)
})

test('wide: the treemap sits beside the table; narrow: above it', async ($, on) => {
  const seen = world(on, { scan: SCAN })
  await open($, seen)
  const pane = await mount($, 'terminal', 196)
  expect((await pane.find({ key: 'body' }))?.props.flexDirection).toBe('row')
  expect((await pane.find({ key: 'treemap' }))?.props.rows).toBe(7)
  await pane.redraw({ ...(PANE_PROPS as object), bodyColumns: 120 } as never)
  expect((await pane.find({ key: 'body' }))?.props.flexDirection).toBe('column')
  expect((await pane.find({ key: 'treemap' }))?.props.columns).toBe(118)
})
