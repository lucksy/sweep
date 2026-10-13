import { expect, test } from 'claude-code/testing'

import { world, run, PANE_PROPS } from './world'

const SCAN = {
  categories: [
    { id: 'worktrees', reclaimable: 2_899_102_105, items: [] },
    { id: 'tmp-sessions', reclaimable: 382_730_240, items: [] },
  ],
}

test('/sweep is registered as a bare command when the session starts', async ($, on) => {
  const seen = world(on, { scan: SCAN })
  await $.session.start({ cwd: '/p', surface: 'terminal', isInteractive: true } as never)
  expect(seen.commands.map((c) => c.name)).toContain('sweep')
})

test('/sweep opens the sweep pane and shows the reclaimable total from a scan', async ($, on) => {
  const seen = world(on, { scan: SCAN })
  await $.session.start({ cwd: '/p', surface: 'terminal', isInteractive: true } as never)
  const { text } = await $.command.run(run())
  expect(seen.opened).toEqual(['sweep'])
  expect(text).toMatch(/Sweep pane opened/)
  await seen.clock.settle()

  const engine = seen.runs.find((argv) => argv.includes('scan'))
  expect(engine?.[0]).toBe('node')
  expect(engine?.[1]).toMatch(/engine\/sweep\.mjs$/)
  expect(engine).toContain('--json')

  const pane = await $.ui.mount({ plugin: 'sweep', surface: 'terminal', component: 'Pane', requestId: 'sweep', props: PANE_PROPS })
  expect(await pane.find({ text: /3\.1G reclaimable/ })).toBeDefined()
  expect(seen.writes).toEqual([])
})

test('a scan four times the size of a real one (~300 KB) fits in session state', async ($, on) => {
  const items = Array.from({ length: 1500 }, (_, i) => ({
    path: `/Users/someone/Projects/project-${i}/.claude/worktrees/agent-${'a'.repeat(40)}`,
    bytes: 1_000_000, note: 'clean, nothing unsaved · node_modules 1.0G · 23d old', cleanable: true,
  }))
  const seen = world(on, { scan: { categories: [{ id: 'worktrees', reclaimable: 1_500_000_000, items }] } })
  await $.session.start({ cwd: '/p', surface: 'terminal', isInteractive: true } as never)
  await $.command.run(run())
  await seen.clock.settle()
  const pane = await $.ui.mount({ plugin: 'sweep', surface: 'terminal', component: 'Pane', requestId: 'sweep', props: PANE_PROPS })
  expect(await pane.find({ text: /1\.4G reclaimable/ })).toBeDefined()
})
