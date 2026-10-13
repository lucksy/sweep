import { expect, test, type TestBody } from 'claude-code/testing'

import type { CleanResult } from '../../types'
import { onlyIds } from '../../hooks/pane/model'
import { CLEAN, SCAN } from './fixture'
import { PANE_PROPS, run, world, type Engine } from './world'

type $ = Parameters<TestBody>[0]
const G = 1024 ** 3

// The engine: a dry run answers CLEAN; --yes answers it as done.
const engine = (over: Partial<CleanResult> = {}, extra: Partial<Engine> = {}): Engine => ({
  scan: SCAN,
  clean: (argv: readonly string[]) => (argv.includes('--yes') ? { ...CLEAN, dryRun: false, ...over } : CLEAN),
  ...extra,
})

async function ready($: $, on: Parameters<TestBody>[1], e: Engine) {
  const seen = world(on, e)
  await $.session.start({ cwd: '/p', surface: 'terminal', isInteractive: true } as never)
  await $.command.run(run())
  await seen.clock.settle()
  const pane = await $.ui.mount({ plugin: 'sweep', surface: 'terminal', component: 'Pane', requestId: 'sweep', props: PANE_PROPS })
  return { seen, pane }
}
const cleans = (seen: ReturnType<typeof world>) => seen.spawns.filter((a) => a.includes('clean')).map((a) => a.slice(2))

test('Clean… runs a dry run of the selection, then asks with a separate Delete key', async ($, on) => {
  const { seen, pane } = await ready($, on, engine())
  expect(await pane.find({ key: 'clean' })).toBeUndefined()
  await pane.press({ key: 'toggle-worktrees' })
  const clean = await pane.find({ key: 'clean' })
  expect(clean?.props.hotkey).toBe('c')
  await pane.press({ key: 'clean' })
  expect(cleans(seen)).toEqual([['clean', 'worktrees', '--json', '--progress']])
  expect(await pane.find({ text: /^Delete 2 item\(s\), 2\.7G\?$/ })).toBeDefined()
  expect(await pane.find({ text: /^ {2}worktrees: 2 item\(s\) · 2\.7G$/ })).toBeDefined()
  expect(await pane.find({ text: /agent checkouts are deleted/ })).toBeDefined()
  expect(await pane.find({ text: /kept 1: they hold work or are in use/ })).toBeDefined()
  const confirm = await pane.find({ key: 'confirm' })
  expect(confirm?.props.hotkey).toBe('y')
  expect(confirm?.props.label).toBe('Delete 2.7G')
})

test('Delete removes exactly what the dry run showed, then rescans and clears the selection', async ($, on) => {
  const { seen, pane } = await ready($, on, engine())
  await pane.press({ key: 'toggle-worktrees' })
  await pane.press({ key: 'clean' })
  const scansBefore = seen.spawns.filter((a) => a.includes('scan')).length
  await pane.press({ key: 'confirm' })
  await seen.clock.settle()
  expect(cleans(seen)[1]).toEqual(['clean', 'worktrees', '--only', 'i_wt1,i_wt2', '--yes', '--json', '--progress'])
  expect(await pane.find({ text: /^Freed 2\.7G · 2 removed · 1 kept · 0 failed$/ })).toBeDefined()
  expect(await pane.find({ text: /^Selected: 0 categories · 0B$/ })).toBeDefined()
  expect(await pane.find({ text: /^freed this session 2\.7G$/ })).toBeDefined()
  expect(seen.spawns.filter((a) => a.includes('scan')).length).toBe(scansBefore + 1)
  expect(await pane.find({ key: 'confirm' })).toBeUndefined()
})

test('items unticked in the drill-down become --only (whole categories list all their cleanable items)', () => {
  expect(onlyIds(SCAN, ['worktrees', 'old-cli'], {})).toBe(null)
  expect(onlyIds(SCAN, ['worktrees', 'old-cli'], { worktrees: ['i_wt2'] })).toEqual(['i_wt2', 'i_cli1'])
})

test('Cancel goes back without deleting', async ($, on) => {
  const { seen, pane } = await ready($, on, engine())
  await pane.press({ key: 'toggle-worktrees' })
  await pane.press({ key: 'clean' })
  await pane.press({ key: 'cancel' })
  expect(await pane.find({ key: 'confirm' })).toBeUndefined()
  expect(await pane.find({ text: /^Selected: 1 category · 2\.7G$/ })).toBeDefined()
  expect(cleans(seen).some((a) => a.includes('--yes'))).toBe(false)
})

test('a partial failure is reported with the failed paths', async ($, on) => {
  const failed = [{ id: 'i_wt2', category: 'worktrees', path: '/b', error: 'git worktree remove failed' }]
  const { seen, pane } = await ready($, on, engine({ removed: [CLEAN.removed[0]!], failed, freedBytes: 1.4 * G }, { cleanExit: 1 }))
  await pane.press({ key: 'toggle-worktrees' })
  await pane.press({ key: 'clean' })
  await pane.press({ key: 'confirm' })
  await seen.clock.settle()
  expect(await pane.find({ text: /^Freed 1\.4G · 1 removed · 1 kept · 1 failed$/ })).toBeDefined()
  expect(await pane.find({ text: /\/b: git worktree remove failed/ })).toBeDefined()
})

test('an engine that does not answer JSON puts the flow in error, with a way back', async ($, on) => {
  const { pane } = await ready($, on, { scan: SCAN, clean: 'Error: boom', cleanExit: 2 })
  await pane.press({ key: 'toggle-worktrees' })
  await pane.press({ key: 'clean' })
  expect(await pane.find({ text: /^Clean failed:/ })).toBeDefined()
  await pane.press({ key: 'back' })
  expect(await pane.find({ text: /^Selected: 1 category/ })).toBeDefined()
})

test('Move to Trash runs the clean with --trash and says the space returns when the Trash is emptied', async ($, on) => {
  const { seen, pane } = await ready($, on, engine({ mode: 'trash' }))
  await pane.press({ key: 'toggle-worktrees' })
  await pane.press({ key: 'clean' })
  const trash = await pane.find({ key: 'trash' })
  expect(trash?.props.hotkey).toBe('t')
  expect(trash?.props.label).toBe('Move 2.7G to Trash')
  await pane.press({ key: 'trash' })
  await seen.clock.settle()
  expect(cleans(seen)[1]).toEqual(['clean', 'worktrees', '--only', 'i_wt1,i_wt2', '--yes', '--trash', '--json', '--progress'])
  expect(await pane.find({ text: /^Moved 2\.7G to the Trash · empty it to free the space · 2 moved/ })).toBeDefined()
  expect(seen.toasts).toEqual(['sweep moved 2.7G to the Trash'])
})
