import { expect, test, type TestBody } from 'claude-code/testing'

import { revealArgv } from '../../hooks/pane/item-actions'
import { SCAN, item } from './fixture'
import { PANE_PROPS, run, world } from './world'

type $ = Parameters<TestBody>[0]

async function drilled($: $, on: Parameters<TestBody>[1]) {
  const seen = world(on, { scan: SCAN })
  await $.session.start({ cwd: '/p', surface: 'terminal', isInteractive: true } as never)
  await $.command.run(run())
  await seen.clock.settle()
  const pane = await $.ui.mount({ plugin: 'sweep', surface: 'terminal', component: 'Pane', requestId: 'sweep', props: PANE_PROPS })
  await pane.press({ key: 'drill-worktrees' })
  return { seen, pane }
}

test('reveal opens Finder at the item, kept items included', async ($, on) => {
  const { seen, pane } = await drilled($, on)
  await pane.press({ key: 'reveal-i_wt3' })
  expect(seen.runs.at(-1)).toEqual(['open', '-R', '/Users/x/Projects/agent-skills-mods/.claude/worktrees/agent-a55e'])
})

test('copy puts the path on the clipboard and says so', async ($, on) => {
  const { seen, pane } = await drilled($, on)
  await pane.press({ key: 'copy-i_wt1' })
  expect(seen.copied).toEqual(['/Users/x/Projects/Tree-Testing /.claude/worktrees/agent-a7224a15e5bfcd682'])
  expect(seen.toasts).toEqual(['Copied /Users/x/Projects/Tree-Testing /.claude/worktrees/agent-a7224a15e5bfcd682'])
})

test('the project view has the same buttons', async ($, on) => {
  const seen = world(on, { scan: SCAN })
  await $.session.start({ cwd: '/p', surface: 'terminal', isInteractive: true } as never)
  await $.command.run(run())
  await seen.clock.settle()
  const pane = await $.ui.mount({ plugin: 'sweep', surface: 'terminal', component: 'Pane', requestId: 'sweep', props: PANE_PROPS })
  await pane.press({ key: 'tab-projects' })
  await pane.press({ key: 'project-0' })
  expect(await pane.find({ key: 'reveal-i_wt1' })).toBeDefined()
  expect(await pane.find({ key: 'copy-i_wt1' })).toBeDefined()
})

test('revealArgv: a branch item reveals its repo; Linux opens the folder holding it', () => {
  const branch = item('i_b', '/Users/x/repo → worktree-wf_1', 0, true, null, { project: '/Users/x/repo' })
  expect(revealArgv(branch, 'darwin')).toEqual(['open', '-R', '/Users/x/repo'])
  expect(revealArgv(item('i_f', '/home/x/.claude/file-history/abc', 1), 'linux')).toEqual(['xdg-open', '/home/x/.claude/file-history'])
})
