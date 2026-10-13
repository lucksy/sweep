import { expect, test, type TestBody } from 'claude-code/testing'

import { parseSweep } from '../../hooks/pane/command'
import { CLEAN, SCAN } from './fixture'
import { PANE_PROPS, run, world } from './world'

type $ = Parameters<TestBody>[0]
const start = ($: $) => $.session.start({ cwd: '/p', surface: 'terminal', isInteractive: true } as never)
const mount = ($: $) => $.ui.mount({ plugin: 'sweep', surface: 'terminal', component: 'Pane', requestId: 'sweep', props: PANE_PROPS })

test('parseSweep reads every form and refuses the rest with the choices', () => {
  expect(parseSweep('')).toEqual({ kind: 'open' })
  expect(parseSweep(' scan ')).toEqual({ kind: 'scan' })
  expect(parseSweep('clean safe')).toEqual({ kind: 'clean', ids: 'safe' })
  expect(parseSweep('clean worktrees old-cli')).toEqual({ kind: 'clean', ids: ['worktrees', 'old-cli'] })
  expect(parseSweep('explain tmp-sessions')).toEqual({ kind: 'explain', id: 'tmp-sessions' })
  expect(parseSweep('text')).toEqual({ kind: 'text', args: ['scan'] })
  expect(parseSweep('text explain old-cli')).toEqual({ kind: 'text', args: ['explain', 'old-cli'] })
  const bad = parseSweep('clean bogus')
  expect(bad.kind === 'error' && bad.text).toMatch(/^Unknown category: bogus\. Categories: worktrees, /)
  const review = parseSweep('clean marketplace-deps')
  expect(review.kind === 'error' && review.text).toMatch(/need --force; ask in chat/)
  expect(parseSweep('frobnicate').kind).toBe('error')
})

test('/sweep clean worktrees lands on the confirm step with worktrees ticked', async ($, on) => {
  const seen = world(on, { scan: SCAN, clean: CLEAN })
  await start($)
  const { text } = await $.command.run(run('clean worktrees'))
  expect(text).toMatch(/checking what cleaning worktrees would remove$/)
  await seen.clock.settle()
  expect(seen.spawns.find((a) => a.includes('clean'))?.slice(2)).toEqual(['clean', 'worktrees', '--json', '--progress'])
  expect((await (await mount($)).find({ key: 'confirm' }))?.props.label).toBe('Delete 2.7G')
})

test('/sweep clean safe ticks the safe categories', async ($, on) => {
  const seen = world(on, { scan: SCAN, clean: CLEAN })
  await start($)
  await $.command.run(run('clean safe'))
  await seen.clock.settle()
  expect(seen.spawns.find((a) => a.includes('clean'))?.slice(2, 4)).toEqual(['clean', 'tmp-sessions'])
})

test('/sweep explain old-cli opens that category', async ($, on) => {
  const seen = world(on, { scan: SCAN })
  await start($)
  await $.command.run(run('explain old-cli'))
  await seen.clock.settle()
  expect(await (await mount($)).find({ text: /^old-cli · Old Claude Code binaries · $/ })).toBeDefined()
})

test('/sweep text answers with the engine text and opens no pane', async ($, on) => {
  const seen = world(on, { scan: SCAN })
  await start($)
  await $.command.run(run('text explain old-cli'))
  expect(seen.opened).toEqual([])
  expect(seen.runs.at(-1)?.slice(2)).toEqual(['explain', 'old-cli'])
})

test('an unknown category answers with the list and does nothing else', async ($, on) => {
  const seen = world(on, { scan: SCAN })
  await start($)
  const { text } = await $.command.run(run('explain nope'))
  expect(text).toMatch(/^Unknown category: nope\. Categories: /)
  expect(seen.opened).toEqual([])
  expect(seen.spawns).toEqual([])
})
