import { expect, test } from 'claude-code/testing'

import { cleanFromToolResult, isEngineClean, runawayToasts } from '../../hooks/alerts/toasts'
import { CLEAN, SCAN } from './fixture'
import { PANE_PROPS, run, world } from './world'

const G = 1024 ** 3
const done = { ...CLEAN, dryRun: false }
const SKILL = 'node /Users/x/.claude/plugins/cache/sweep/sweep/0.2.0/engine/sweep.mjs clean safe --yes --json'

test('a pane clean toasts what it freed', async ($, on) => {
  const seen = world(on, { scan: SCAN, clean: (argv: readonly string[]) => (argv.includes('--yes') ? done : CLEAN) })
  await $.session.start({ cwd: '/p', surface: 'terminal', isInteractive: true } as never)
  await $.command.run(run())
  await seen.clock.settle()
  const pane = await $.ui.mount({ plugin: 'sweep', surface: 'terminal', component: 'Pane', requestId: 'sweep', props: PANE_PROPS })
  await pane.press({ key: 'toggle-worktrees' })
  await pane.press({ key: 'clean' })
  await pane.press({ key: 'confirm' })
  await seen.clock.settle()
  expect(seen.toasts).toEqual(['sweep freed 2.7G'])
})

test('a /sweep:clean run through Bash toasts once; other Bash calls and dry runs do not', async ($, on) => {
  const seen = world(on, {
    scan: SCAN,
    bash: (command) => (command.includes('--yes') ? JSON.stringify({ ...done, failed: [{ id: 'x', category: 'c', path: '/p', error: 'nope' }] }, null, 2) : JSON.stringify(CLEAN)),
  })
  await $.session.start({ cwd: '/p', surface: 'terminal', isInteractive: true } as never)
  await $.tool.call({ tool: 'Bash', command: 'ls -la' } as never)
  await $.tool.call({ tool: 'Bash', command: SKILL.replace(' --yes', '') } as never)
  expect(seen.toasts).toEqual([])
  await $.tool.call({ tool: 'Bash', command: SKILL } as never)
  expect(seen.toasts).toEqual(['sweep freed 2.7G · 1 failed'])
})

test('isEngineClean and cleanFromToolResult', () => {
  expect(isEngineClean(SKILL)).toBe(true)
  expect(isEngineClean(SKILL.replace(' --yes', ''))).toBe(false)
  expect(isEngineClean('node engine/sweep.mjs scan --json --yes')).toBe(false)
  expect(cleanFromToolResult({ result: JSON.stringify(done) })).toEqual({ freed: 2.7 * G, failed: 0 })
  expect(cleanFromToolResult({ result: JSON.stringify(CLEAN) })).toBe(null)
  expect(cleanFromToolResult('Error: boom')).toBe(null)
})

test('runaway task output toasts once per file per session', () => {
  const toasted = new Set<string>()
  const scan = { ...SCAN, warnings: [{ code: 'runaway-output' as const, text: 'x', path: '/t/b1.output', bytes: 6 * G }] }
  expect(runawayToasts(scan, toasted)).toEqual(['sweep: a task output file reached 6.0G — /sweep'])
  expect(runawayToasts(scan, toasted)).toEqual([])
})

test('the background scan toasts a runaway file it finds', async ($, on) => {
  const scan = { ...SCAN, warnings: [{ code: 'runaway-output' as const, text: 'x', path: '/t/b1.output', bytes: 6 * G }] }
  const seen = world(on, { scan })
  await $.session.start({ cwd: '/p', surface: 'terminal', isInteractive: true } as never)
  await seen.clock.advance(61_000)
  await seen.clock.settle()
  expect(seen.toasts).toEqual(['sweep: a task output file reached 6.0G — /sweep'])
})
