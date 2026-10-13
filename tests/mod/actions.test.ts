import { expect, test, type TestBody } from 'claude-code/testing'

import { askPrompt, canAsk, revealArgv } from '../../hooks/pane/item-actions'
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

test('ask Claude submits a read-only review of the worktree and says so', async ($, on) => {
  const { seen, pane } = await drilled($, on)
  await pane.press({ key: 'ask-i_wt1' })
  const prompt = seen.prompts.at(-1) ?? ''
  expect(prompt).toMatch(/^sweep: please review the agent worktree at `\/Users\/x\/Projects\/Tree-Testing \/\.claude\/worktrees\/agent-a7224a15e5bfcd682`/)
  expect(prompt).toMatch(/Read only: do not delete, commit, reset, check out or change anything\./)
  expect(prompt).toMatch(/status --short/)
  expect(prompt).toMatch(/diff --stat <main>\.\.\.HEAD/)
  expect(prompt).toMatch(/safe to remove with \/sweep/)
  expect(seen.toasts.at(-1)).toBe('Asked Claude about agent-a7224a15e5bfcd682')
})

test('ask Claude is offered on worktrees and on branches with their own commits only', async ($, on) => {
  const { pane } = await drilled($, on)
  expect(await pane.find({ key: 'ask-i_wt3' })).toBeDefined()  // kept items too: that is when it helps most
  await pane.press({ key: 'back' })
  await pane.press({ key: 'drill-old-cli' })
  expect(await pane.find({ key: 'ask-i_cli1' })).toBeUndefined()
})

test('canAsk and the branch prompt', () => {
  const branch = item('i_b', '/r → worktree-wf_1', 0, false, 'unique-commits', { project: '/r', detail: { branch: 'worktree-wf_1', unique: 3 } })
  expect(canAsk(branch, 'worktree-branches')).toBe(true)
  expect(canAsk({ ...branch, detail: { branch: 'worktree-wf_2', unique: 0 } }, 'worktree-branches')).toBe(false)
  expect(canAsk(item('i_o', '/r/.claude/worktrees/x', 1, true, null, { detail: { orphan: true } }), 'worktrees')).toBe(false)
  expect(askPrompt(branch, 'worktree-branches')).toMatch(/^sweep: please review the branch `worktree-wf_1` in `\/r`/)
})
