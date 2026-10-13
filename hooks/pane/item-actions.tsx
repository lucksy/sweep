// Buttons on an item row: reveal it, copy its path, ask Claude about it. Pure.

import type { ScanItem } from '../../types'
import type { El } from './overview'

export type ItemActions = {
  reveal: (item: ScanItem) => void
  copy: (item: ScanItem) => void
  ask: (item: ScanItem, categoryId: string) => void
}

/** Worktrees, and branches with commits on no other branch: where an agent's work may still matter. */
export const canAsk = (item: ScanItem, categoryId: string) =>
  (categoryId === 'worktrees' && !item.detail.orphan) || (categoryId === 'worktree-branches' && Number(item.detail.unique ?? 0) > 0)

const READ_ONLY = 'Read only: do not delete, commit, reset, check out or change anything.'

/** The review prompt the ask button submits to Claude. */
export function askPrompt(item: ScanItem, categoryId: string): string {
  const repo = item.project ?? ''
  if (categoryId === 'worktree-branches') {
    const branch = String(item.detail.branch ?? item.label)
    return [
      `sweep: please review the branch \`${branch}\` in \`${repo}\`, left by a Claude agent. ${READ_ONLY}`,
      `1. Find the main branch: \`git -C "${repo}" symbolic-ref --short refs/remotes/origin/HEAD\` (or the current branch).`,
      `2. \`git -C "${repo}" log --oneline <main>..${branch}\` and \`git -C "${repo}" diff --stat <main>...${branch}\``,
      'Then tell me in a few lines what the agent did on it, and whether those commits are worth keeping, merging, or safe to drop.',
    ].join('\n')
  }
  return [
    `sweep: please review the agent worktree at \`${item.path}\`${item.detail.branch ? ` (branch \`${item.detail.branch}\`)` : ''}${repo ? ` of \`${repo}\`` : ''}. ${READ_ONLY}`,
    `1. \`git -C "${item.path}" status --short\``,
    `2. Find the main branch: \`git -C "${repo || item.path}" symbolic-ref --short refs/remotes/origin/HEAD\` (or the repo's current branch), then \`git -C "${item.path}" log --oneline <main>..HEAD\``,
    `3. \`git -C "${item.path}" diff --stat\` and \`git -C "${item.path}" diff --stat <main>...HEAD\``,
    'Then tell me in a few lines what the agent was doing, whether its changes or commits already live on another branch, and whether this worktree is safe to remove with /sweep (or what to keep first).',
  ].join('\n')
}

/** What an item stands for on disk: a branch item (`repo → branch`) is its repo. */
export const itemPath = (item: ScanItem) => (item.path.includes(' → ') ? item.project ?? item.path.split(' → ')[0]! : item.path)

/** Finder with the item selected on macOS; the folder holding it elsewhere. */
export function revealArgv(item: ScanItem, platform: string): string[] {
  const p = itemPath(item)
  return platform === 'darwin' ? ['open', '-R', p] : ['xdg-open', p.replace(/\/[^/]*\/?$/, '') || '/']
}

export function ItemButtons(E: El, item: ScanItem, categoryId: string, a: ItemActions) {
  const { Box, Button } = E
  return (
    <Box key={`actions-${item.id}`} gap={1} flexShrink={0}>
      <Button key={`reveal-${item.id}`} plain dimColor label="reveal" onPress={() => a.reveal(item)} />
      <Button key={`copy-${item.id}`} plain dimColor label="copy" onPress={() => a.copy(item)} />
      {canAsk(item, categoryId) && <Button key={`ask-${item.id}`} plain dimColor label="ask Claude" onPress={() => a.ask(item, categoryId)} />}
    </Box>
  )
}
