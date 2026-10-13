// Stands for Claude Code beneath the sweep mod in tests: the engine process,
// the UI calls, and spies proving sweep never stores anything.

import { mock } from 'claude-code/testing'
import type { On } from 'claude-code'

export const ROOT = '/plugins/sweep'

export type Engine = {
  /** What `sweep scan --json` prints; a function sees the argv. */
  scan?: unknown
  /** What `sweep clean … --json` prints; a function sees the argv. */
  clean?: unknown | ((argv: readonly string[]) => unknown)
  /** The exit code of a clean (a scan exits with `exitCode`). */
  cleanExit?: number
  exitCode?: number
  /** NDJSON progress lines the scan writes to stderr. */
  progress?: unknown[]
  /** Holds every spawned engine after its progress until the test calls release(). */
  hold?: boolean
}

export function world(on: On, engine: Engine = {}, env: Record<string, string> = {}) {
  const seen = {
    commands: [] as { name: string; description?: string; argumentHint?: string }[],
    opened: [] as string[],
    status: [] as (string | undefined)[],
    toasts: [] as string[],
    runs: [] as string[][],
    spawns: [] as string[][],
    writes: [] as string[],
    stored: [] as string[],
    release: () => {},
    placed: true,
  }
  const answer = (argv: readonly string[]) => {
    if (!argv.includes('clean')) return JSON.stringify(engine.scan ?? {})
    const clean = typeof engine.clean === 'function' ? (engine.clean as (a: readonly string[]) => unknown)(argv) : engine.clean
    return typeof clean === 'string' ? clean : JSON.stringify(clean ?? {})
  }
  const exitOf = (argv: readonly string[]) => (argv.includes('clean') ? engine.cleanExit ?? 0 : engine.exitCode ?? 0)

  on('process.run', (_$, e) => {
    seen.runs.push([...e.argv])
    return { value: { exitCode: engine.exitCode ?? 0, stdout: answer(e.argv), stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }
  })
  const gate = engine.hold ? new Promise<void>((resolve) => { seen.release = resolve }) : Promise.resolve()
  on('process.spawn', async function* (_$, e) {
    seen.runs.push([...e.argv])
    seen.spawns.push([...e.argv])
    const events = e.argv.includes('clean') && e.argv.includes('--yes')
      ? (JSON.parse(answer(e.argv)) as { removed?: { id: string; bytes: number }[] }).removed?.map((r) => ({ event: 'removed', id: r.id, bytes: r.bytes })) ?? []
      : engine.progress ?? []
    for (const line of events) yield { stream: 'stderr' as const, text: `${JSON.stringify(line)}\n` }
    if (!e.argv.includes('clean')) await gate
    yield { stream: 'stdout' as const, text: answer(e.argv) }
    return { value: { code: exitOf(e.argv), signal: null } }
  })
  on('command.register', (_$, e) => {
    seen.commands.push({ name: e.name, description: e.description, argumentHint: e.argumentHint })
    return { value: { command: e.name } }
  })
  on('ui.open', (_$, e) => {
    seen.opened.push(e.id)
    return seen.placed ? { value: { isPlaced: true as const } } : { value: { isPlaced: false as const, reason: 'the terminal is too narrow' } }
  })
  on('ui.status', (_$, e) => {
    seen.status.push(e.text)
    return { value: undefined }
  })
  on('ui.toast', (_$, e) => {
    seen.toasts.push(e.text)
    return { value: undefined }
  })
  on('fs.write', (_$, e) => {
    seen.writes.push(e.path)
    return { value: undefined }
  })
  on('store.set', (_$, e) => {
    seen.stored.push(String((e as { key?: string }).key))
    return { value: undefined } as never
  })
  on('session.start', (_$, e) => ({ cwd: e.cwd }) as never)
  mock.env(on, env)
  const clock = mock.clock(on, { now: Date.parse('2026-10-13T12:00:00Z') })
  return Object.assign(seen, { clock })
}

export const run = (args = '') =>
  ({ command: 'sweep', args, origin: { kind: 'composer' }, presentation: { isFullscreen: true, columns: 160 } }) as never

export const PANE_PROPS = { title: 'Sweep', isFocused: true, bodyColumns: 150, placement: 'dock', scroll: { offset: 0, bodyRows: 40 } } as never
