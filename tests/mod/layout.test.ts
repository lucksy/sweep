import { expect, test } from 'claude-code/testing'

import { SCAN } from './fixture'
import { PANE_PROPS, run, world } from './world'

// Regressions from the first real look at the pane (2026-10-13 screenshot).
test('wide: the map and the table columns never shrink into each other', async ($, on) => {
  const seen = world(on, { scan: SCAN })
  await $.session.start({ cwd: '/p', surface: 'terminal', isInteractive: true } as never)
  await $.command.run(run())
  await seen.clock.settle()
  const pane = await $.ui.mount({ plugin: 'sweep', surface: 'terminal', component: 'Pane', requestId: 'sweep', props: { ...(PANE_PROPS as object), bodyColumns: 196 } as never })
  const map = await pane.find({ key: 'map-section' })
  expect(map?.props.flexShrink).toBe(0)
  const treemap = await pane.find({ key: 'treemap' })
  expect(treemap?.props.columns).toBe(map?.props.width)
  expect(Number(map?.props.width) + 3 + 76).toBeLessThanOrEqual(194)
  // As tall as the table: five categories with something found, the header and the review note.
  expect(treemap?.props.rows).toBe(7)
  expect((await pane.find({ key: 'table-section' }))?.props.minWidth).toBe(0)
  for (const width of [140, 160]) {
    await pane.redraw({ ...(PANE_PROPS as object), bodyColumns: width } as never)
    const m = await pane.find({ key: 'map-section' })
    expect(Number(m?.props.width) + 3 + 76).toBeLessThanOrEqual(width - 2)
  }
})

test('tabs are plain labels; the active one is primary', async ($, on) => {
  const seen = world(on, { scan: SCAN })
  await $.session.start({ cwd: '/p', surface: 'terminal', isInteractive: true } as never)
  await $.command.run(run())
  await seen.clock.settle()
  const pane = await $.ui.mount({ plugin: 'sweep', surface: 'terminal', component: 'Pane', requestId: 'sweep', props: PANE_PROPS })
  const overview = await pane.find({ key: 'tab-overview' })
  expect(overview?.props.label).toBe('Overview')
  expect(overview?.props.variant).toBe('primary')
  expect((await pane.find({ key: 'tab-projects' }))?.props.dimColor).toBe(true)
})
