import { expect, test, type TestBody } from 'claude-code/testing'

import { SCAN, withWarning } from './fixture'
import { PANE_PROPS, run, world } from './world'

type $ = Parameters<TestBody>[0]
const start = ($: $) => $.session.start({ cwd: '/p', surface: 'terminal', isInteractive: true } as never)
const props = (bodyColumns: number) => ({ ...(PANE_PROPS as object), bodyColumns }) as never
const mount = ($: $, bodyColumns = 150) =>
  $.ui.mount({ plugin: 'sweep', surface: 'terminal', component: 'Pane', requestId: 'sweep', props: props(bodyColumns) })

test('/sweep is a bare command, registered when the session starts', async ($, on) => {
  const seen = world(on, { scan: SCAN })
  await start($)
  expect(seen.commands.map((c) => c.name)).toEqual(['sweep'])
})

test('/sweep opens the pane, scans with progress, and draws the overview', async ($, on) => {
  const seen = world(on, { scan: SCAN, progress: [{ event: 'category', id: 'worktrees', index: 1, total: 13 }, { event: 'category', id: 'plugin-versions', index: 3, total: 13 }] })
  await start($)
  const { text } = await $.command.run(run())
  expect(text).toBe('Sweep pane opened · scanning…')
  expect(seen.opened).toEqual(['sweep'])
  await seen.clock.settle()
  expect(seen.spawns[0]?.slice(2)).toEqual(['scan', '--json', '--progress'])
  expect(seen.spawns[0]?.[1]).toMatch(/engine\/sweep\.mjs$/)
  const pane = await mount($)
  expect(await pane.find({ text: /Claude Code uses 7\.4G · 3\.5G reclaimable · disk 590G free \(59%\)/ })).toBeDefined()
  expect(await pane.find({ text: /^worktrees$/ })).toBeDefined()
  expect(await pane.find({ text: /scanned just now/ })).toBeDefined()
})

test('while a scan runs the pane shows its progress; a second request joins it', async ($, on) => {
  const seen = world(on, { scan: SCAN, hold: true, progress: [{ event: 'category', id: 'plugin-versions', index: 3, total: 13 }] })
  await start($)
  await $.command.run(run())
  await $.command.run(run('scan'))
  const pane = await mount($)
  expect(await pane.find({ text: /Scanning Claude Code's storage… 3\/13 plugin-versions/ })).toBeDefined()
  expect(seen.spawns.length).toBe(1)
  seen.release()
  await seen.clock.settle()
  expect(await pane.find({ text: /^worktrees$/ })).toBeDefined()
})

test('with a fresh scan in this session, opening again draws at once without the engine', async ($, on) => {
  const seen = world(on, { scan: SCAN })
  await start($)
  await $.command.run(run())
  await seen.clock.settle()
  const { text } = await $.command.run(run())
  expect(text).toBe('Sweep pane opened · 3.5G reclaimable (scanned just now)')
  expect(seen.spawns.length).toBe(1)
  await seen.clock.advance(11 * 60_000)
  await $.command.run(run())
  await seen.clock.settle()
  expect(seen.spawns.length).toBe(2)
})

test('the layout keeps its header, table and selection bar at 196, 140 and 106 columns', async ($, on) => {
  const seen = world(on, { scan: withWarning('runaway-output', 'a task output file is 6.0G: /t/b1.output') })
  await start($)
  await $.command.run(run())
  await seen.clock.settle()
  const pane = await mount($)
  for (const columns of [196, 140, 106]) {
    await pane.redraw(props(columns))
    expect(await pane.find({ text: /^Claude Code uses/ })).toBeDefined()
    expect(await pane.find({ text: /^⚠ a task output file is 6\.0G/ })).toBeDefined()
    expect(await pane.find({ text: /^Selected: 0 categories · 0B$/ })).toBeDefined()
    expect(await pane.find({ key: 'rescan' })).toBeDefined()
  }
})

test('toggles and Select safe pick categories; review ones have no toggle', async ($, on) => {
  const seen = world(on, { scan: SCAN })
  await start($)
  await $.command.run(run())
  await seen.clock.settle()
  const pane = await mount($)
  await pane.press({ key: 'toggle-worktrees' })
  expect(await pane.find({ text: /^Selected: 1 category · 2\.7G$/ })).toBeDefined()
  await pane.press({ key: 'select-safe' })
  expect(await pane.find({ text: /^Selected: 2 categories · 593M$/ })).toBeDefined()
  expect(await pane.find({ key: 'toggle-marketplace-deps' })).toBeUndefined()
  expect(await pane.find({ text: /need --force; ask in chat/ })).toBeDefined()
})

test('below 110 columns /sweep answers with the text report', async ($, on) => {
  const seen = world(on, { scan: SCAN })
  seen.placed = false
  await start($)
  const { text } = await $.command.run(run())
  expect(text).toMatch(/^Pane needs ≥ 110 columns; showing text\./)
  expect(seen.runs.at(-1)?.slice(2)).toEqual(['scan'])
  expect(seen.spawns.length).toBe(0)
})

test('a scan four times the size of a real one (~300 KB) fits in session state', async ($, on) => {
  const items = Array.from({ length: 1500 }, (_, i) => ({ ...SCAN.categories[0]!.items[0]!, id: `i_${i}`, path: `/Users/someone/Projects/p-${i}/.claude/worktrees/agent-${'a'.repeat(40)}` }))
  const seen = world(on, { scan: { ...SCAN, categories: [{ ...SCAN.categories[0]!, items }] } })
  await start($)
  await $.command.run(run())
  await seen.clock.settle()
  expect(await (await mount($)).find({ text: /^worktrees$/ })).toBeDefined()
})

test('sweep stores nothing: no $.store and no file writes', async ($, on) => {
  const seen = world(on, { scan: SCAN })
  await start($)
  await $.command.run(run())
  await seen.clock.settle()
  await (await mount($)).press({ key: 'select-safe' })
  expect(seen.stored).toEqual([])
  expect(seen.writes).toEqual([])
})
