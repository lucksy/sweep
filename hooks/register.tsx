// sweep's mod: the /sweep command and its pane. Every number comes from a
// scan made in this session; nothing is stored (no $.store, no files).
// All $ calls live in this file: the views it imports are pure.

import { atom, read, update } from 'claude-code'
import type { Elements, EngineInterface, Register } from 'claude-code'

import type { Flow, Progress, ScanResult, ScanStatus, View, CleanResult } from '../types'
import { cleanArgv, formatBytes, parseClean, parseScan, progressOf, scanArgv, takeLines, textArgv } from './engine-client'
import { resolveStyle, type ChartStyle, type TerminalEnv } from '../charts/terminal'
import { ago, onlyIds, projectSelection, safeIds, selectedIds, toggle, toggleItem } from './pane/model'
import { Projects, Tabs } from './pane/projects'
import { parseSweep } from './pane/command'
import { BACKGROUND_DELAY_MS, statusText } from './alerts/status'
import { bandFor } from './alerts/band'
import { cleanFromToolResult, cleanToast, isEngineClean, runawayToasts } from './alerts/toasts'
import { Category } from './pane/category'
import { CleanBar } from './pane/clean'
import { Overview } from './pane/overview'

const PANE = 'sweep'
const OPEN = { id: PANE, title: 'Sweep' }
/** A scan older than this is redone when the pane opens. */
const FRESH_MS = 10 * 60_000

const scanned = atom({ plugin: 'sweep', key: 'scan' } as const, null as ScanResult | null)
const scannedAt = atom({ plugin: 'sweep', key: 'scannedAt' } as const, null as number | null)
const status = atom({ plugin: 'sweep', key: 'status' } as const, 'idle' as ScanStatus)
const failure = atom({ plugin: 'sweep', key: 'error' } as const, null as string | null)
const progress = atom({ plugin: 'sweep', key: 'progress' } as const, null as Progress | null)
const view = atom({ plugin: 'sweep', key: 'view' } as const, 'overview' as View)
const focusId = atom({ plugin: 'sweep', key: 'focusId' } as const, null as string | null)
const selected = atom({ plugin: 'sweep', key: 'selected' } as const, [] as string[])
const selectedItems = atom({ plugin: 'sweep', key: 'selectedItems' } as const, {} as Record<string, string[]>)
const flow = atom({ plugin: 'sweep', key: 'flow' } as const, 'idle' as Flow)
const dry = atom({ plugin: 'sweep', key: 'dry' } as const, null as CleanResult | null)
const freed = atom({ plugin: 'sweep', key: 'freedThisSession' } as const, 0)
const projectFilter = atom({ plugin: 'sweep', key: 'projectFilter' } as const, null as string | null)
const hidden = atom({ plugin: 'sweep', key: 'hidden' } as const, [] as string[])
const outcome = atom({ plugin: 'sweep', key: 'result' } as const, null as CleanResult | null)
const cleaning = atom({ plugin: 'sweep', key: 'cleaning' } as const, null as { removed: number; freed: number } | null)
const cleanError = atom({ plugin: 'sweep', key: 'cleanError' } as const, null as string | null)

// The scan in flight, so a second request joins it instead of starting another.
let inflight: Promise<void> | null = null
// What the terminal is, read once per session start: whether it draws pictures.
let terminal: TerminalEnv = {}
// Whether the status line entry is on (userConfig statusLine), set in register().
let statusLineOn = true
// The session's one background scan, so a second session.start does not schedule another.
let backgroundScheduled = false
// Runaway files already toasted this session.
const toasted = new Set<string>()

function rescan($: EngineInterface): Promise<void> {
  inflight ??= runScan($).finally(() => { inflight = null })
  return inflight
}

// Runs the engine as a child: stdout collected, stderr's NDJSON events handed to `onEvent`.
async function runEngine($: EngineInterface, argv: string[], onEvent: (event: Record<string, unknown>) => Promise<void>) {
  let stdout = ''
  let stderr = ''
  let pending = ''
  const child = $.process.spawn({ argv })
  const pieces = child[Symbol.asyncIterator]()
  let piece = await pieces.next()
  while (!piece.done) {
    if (piece.value.stream === 'stdout') stdout += piece.value.text
    else {
      const { events, rest } = takeLines(pending + piece.value.text)
      pending = rest
      if (!events.length && !piece.value.text.trim().startsWith('{')) stderr += piece.value.text
      for (const event of events) await onEvent(event)
    }
    piece = await pieces.next()
  }
  return { exitCode: piece.value?.code ?? 1, stdout, stderr }
}

async function runScan($: EngineInterface) {
  await update($, status, () => 'scanning')
  await update($, progress, () => null)
  await update($, failure, () => null)
  try {
    const run = await runEngine($, scanArgv($.plugin.root), async (event) => {
      const p = progressOf(event)
      if (p) await update($, progress, () => p)
    })
    const result = parseScan(run)
    const now = await $.clock.now()
    await update($, scanned, () => result)
    await update($, scannedAt, () => now)
    await update($, status, () => 'idle')
    $.ui.status(statusText(result, statusLineOn))
    for (const text of runawayToasts(result, toasted)) $.ui.toast(text)
  } catch (error) {
    await update($, failure, () => (error instanceof Error ? error.message : String(error)))
    await update($, status, () => 'error')
  }
  await update($, progress, () => null)
}

const message = (error: unknown) => (error instanceof Error ? error.message : String(error))

// Clean step 1: a dry run of the selection, then the confirm step.
async function startClean($: EngineInterface) {
  const scan = await read($, scanned)
  if (!scan || (await read($, flow)) === 'cleaning') return
  const ids = selectedIds(scan, await read($, selected))
  if (!ids.length) return
  await update($, flow, () => 'dryrun')
  try {
    const run = await runEngine($, cleanArgv($.plugin.root, ids, { only: onlyIds(scan, ids, await read($, selectedItems)) }), async () => {})
    const result = parseClean(run.stdout)
    await update($, dry, () => result)
    await update($, flow, () => 'confirm')
  } catch (error) {
    await update($, cleanError, () => message(error))
    await update($, flow, () => 'error')
  }
}

// Clean step 2: delete exactly the items the dry run showed (`--only` their ids).
async function confirmClean($: EngineInterface) {
  const shown = await read($, dry)
  if (!shown || (await read($, flow)) !== 'confirm' || !shown.removed.length) return
  await update($, flow, () => 'cleaning')
  await update($, cleaning, () => ({ removed: 0, freed: 0 }))
  try {
    const argv = cleanArgv($.plugin.root, shown.requested.categories, { yes: true, only: shown.removed.map((r) => r.id) })
    const run = await runEngine($, argv, async (event) => {
      if (event.event === 'removed') await update($, cleaning, (c) => ({ removed: (c?.removed ?? 0) + 1, freed: (c?.freed ?? 0) + Number(event.bytes ?? 0) }))
    })
    const result = parseClean(run.stdout)
    await update($, outcome, () => result)
    await update($, freed, (n) => n + result.freedBytes)
    $.ui.toast(cleanToast(result.freedBytes, result.failed.length))
    await update($, selected, () => [])
    await update($, selectedItems, () => ({}))
    await update($, projectFilter, () => null)
    await update($, dry, () => null)
    await update($, flow, () => 'done')
    void rescan($)
  } catch (error) {
    await update($, cleanError, () => message(error))
    await update($, flow, () => 'error')
  }
  await update($, cleaning, () => null)
}

/** Scan unless this session has a recent scan already. */
async function ensureScan($: EngineInterface, force = false) {
  const at = await read($, scannedAt)
  const now = await $.clock.now()
  if (force || at === null || now - at > FRESH_MS) void rescan($)
}

async function openPane($: EngineInterface, { force = false } = {}): Promise<{ text: string; placed: boolean }> {
  const placed = await $.ui.open(OPEN)
  if (!placed.isPlaced) {
    const run = await $.process.run(textArgv($.plugin.root), { timeoutMs: 5 * 60_000, env: { NO_COLOR: '1' } })
    return { text: `Pane needs ≥ 110 columns; showing text.\n${run.stdout}`, placed: false }
  }
  await ensureScan($, force)
  const result = await read($, scanned)
  const at = await read($, scannedAt)
  const now = await $.clock.now()
  return { text: result && at !== null ? `Sweep pane opened · ${formatBytes(result.totals.reclaimableBytes)} reclaimable (scanned ${ago(now - at)})` : 'Sweep pane opened · scanning…', placed: true }
}

export const register: Register = (on, options) => {
  const chartStyle = (options.chartStyle ?? 'auto') as ChartStyle
  statusLineOn = options.statusLine !== false
  const backgroundScan = options.backgroundScan !== false
  const thresholdGB = typeof options.bandThresholdGB === 'number' ? options.bandThresholdGB : 5

  on('session.start', async ($, e, next) => {
    terminal = {
      term: await $.env.get('TERM'),
      termProgram: await $.env.get('TERM_PROGRAM'),
      kitty: await $.env.get('KITTY_WINDOW_ID'),
      tmux: await $.env.get('TMUX'),
    }
    // One read-only scan a minute in, so the status line and band have numbers.
    if (backgroundScan && !backgroundScheduled) {
      backgroundScheduled = true
      $.clock.after(BACKGROUND_DELAY_MS, () => void rescan($))
    }
    await $.command.register({
      name: 'sweep',
      description: 'Open the sweep pane: what Claude Code stores and what you can free',
      argumentHint: '[scan | clean <ids> | explain <id> | text]',
    })
    return next(e)
  })

  on('command.run', { command: 'sweep' }, async ($, e) => {
    const command = parseSweep(String(e.args ?? ''))
    if (command.kind === 'error') return { text: command.text }
    if (command.kind === 'text') {
      const run = await $.process.run(textArgv($.plugin.root, command.args), { timeoutMs: 5 * 60_000, env: { NO_COLOR: '1' } })
      return { text: run.stdout || run.stderr }
    }
    const opened = await openPane($, { force: command.kind === 'scan' })
    if (!opened.placed) return { text: opened.text }
    if (command.kind === 'explain') {
      await update($, focusId, () => command.id)
      await update($, view, () => 'category')
      return { text: `${opened.text} · ${command.id}` }
    }
    if (command.kind === 'clean') {
      // Tick the categories once a scan is there, then dry-run them: the pane lands on the confirm step.
      void (async () => {
        if (inflight) await inflight
        const scan = await read($, scanned)
        if (!scan) return
        const ids = command.ids === 'safe' ? safeIds(scan) : command.ids
        await update($, selected, () => ids)
        await update($, selectedItems, () => ({}))
        await update($, projectFilter, () => null)
        await update($, view, () => 'overview')
        await startClean($)
      })()
      return { text: `${opened.text} · checking what cleaning ${command.ids === 'safe' ? 'the safe categories' : command.ids.join(', ')} would remove` }
    }
    return { text: opened.text }
  })

  // A clean the /sweep:clean skill ran through Bash: toast what it freed.
  // The handler replays the settled result, so a failure here never touches the call.
  on('tool.call', { tool: 'Bash' }, async ($, e, next) => {
    const ran = await next(e)
    if (isEngineClean(String((e as { command?: unknown }).command ?? ''))) {
      const clean = cleanFromToolResult(ran)
      if (clean) {
        await update($, freed, (n) => n + clean.freed)
        $.ui.toast(cleanToast(clean.freed, clean.failed))
      }
    }
    return ran
  }).catch(($, e, next) => next(e))

  // One line above the prompt for the most severe condition; Hide lasts the session.
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey) return next(e)
    const band = bandFor(await read($, scanned), thresholdGB, await read($, hidden))
    if (!band) return next(e)
    const { Box, Text, Button } = $.ui.resolve(e)
    return (
      <Box gap={2}>
        <Text color="warning" wrap="truncate-end">{band.text}</Text>
        {band.canOpen && <Button key="sweep-open" label="Open" hotkey="o" onPress={() => void openPane($)} />}
        <Button key="sweep-hide" label="Hide" hotkey="h" onPress={() => void update($, hidden, (list) => [...list, band.code])} />
      </Box>
    )
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const els = $.ui.resolve(e)
    const { Box, Text, Button, Markdown } = els
    // Every surface's table names every element (missing ones draw nothing);
    // only the terminal draws Raster and Image.
    const terminalEls = e.surface === 'terminal' ? (els as Elements['terminal']) : null
    const Raster = terminalEls?.Raster
    const Image = terminalEls?.Image
    const E = { Box, Text, Button, Markdown, Raster, Image }
    const result = await read($, scanned)
    const at = await read($, scannedAt)
    const now = await $.clock.now()
    const data = {
      scan: result,
      status: await read($, status),
      error: await read($, failure),
      progress: await read($, progress),
      scannedAgo: at === null ? null : ago(now - at),
      selected: await read($, selected),
      selectedItems: await read($, selectedItems),
      bodyColumns: e.props.bodyColumns,
      freedThisSession: await read($, freed),
      style: resolveStyle(chartStyle, terminal, !!Raster),
      projectFilter: await read($, projectFilter),
    }
    const currentFlow = await read($, flow)
    const shown = await read($, dry)
    const done = await read($, outcome)
    const progressNow = await read($, cleaning)
    const cleanFailure = await read($, cleanError)
    const cleanBar = () => CleanBar(E, {
      scan: result, flow: currentFlow, selected: data.selected, selectedItems: data.selectedItems,
      dry: shown, result: done, removedSoFar: progressNow?.removed ?? 0, freedSoFar: progressNow?.freed ?? 0,
      error: cleanFailure, freedThisSession: data.freedThisSession,
      }, {
      selectSafe: () => void (result && Promise.all([update($, selected, () => safeIds(result)), update($, selectedItems, () => ({})), update($, projectFilter, () => null)])),
      clean: () => void startClean($),
      confirm: () => void confirmClean($),
      cancel: () => void Promise.all([update($, flow, () => 'idle'), update($, dry, () => null)]),
      back: () => void Promise.all([update($, flow, () => 'idle'), update($, cleanError, () => null)]),
      })
    const currentView = await read($, view)
    const tab = (v: 'overview' | 'projects') => void update($, view, () => v)
    const tabs = () => Tabs(E, currentView === 'projects' ? 'projects' : 'overview', { tab })
    if (currentView === 'projects' && result) {
      const { Box } = E
      return (
        <Box flexDirection="column" gap={1}>
          {tabs()}
          {Projects(E, { scan: result, bodyColumns: data.bodyColumns, style: data.style }, {
            pick: (path) => void (async () => {
              const next = projectSelection(result, path)
              await update($, selected, () => next.selected)
              await update($, selectedItems, () => next.selectedItems)
              await update($, projectFilter, () => path)
              await update($, view, () => 'overview')
            })(),
          })}
          {cleanBar() as never}
        </Box>
      )
    }
    const focusedId = await read($, focusId)
    const focused = result?.categories.find((c) => c.id === focusedId)
    if (currentView === 'category' && result && focused) {
      return Category(E, { category: focused, selected: data.selected, selectedItems: data.selectedItems, bodyColumns: data.bodyColumns, style: data.style }, {
        back: () => void update($, view, () => 'overview'),
        toggleItem: (itemId) => void (async () => {
          const next = toggleItem(result, await read($, selected), await read($, selectedItems), focused.id, itemId)
          await update($, selected, () => next.selected)
          await update($, selectedItems, () => next.selectedItems)
        })(),
        cleanBar,
      })
    }
    return Overview(E, data, {
      rescan: () => void rescan($),
      // A whole-category tick drops any item list the drill-down left for it.
      toggle: (id) => void Promise.all([
        update($, projectFilter, () => null),
        update($, selected, (list) => toggle(list, id)),
        update($, selectedItems, (items) => Object.fromEntries(Object.entries(items).filter(([k]) => k !== id))),
      ]),
      selectSafe: () => void (result && Promise.all([update($, selected, () => safeIds(result)), update($, selectedItems, () => ({})), update($, projectFilter, () => null)])),
      drill: (id) => void Promise.all([update($, focusId, () => id), update($, view, () => 'category')]),
      cleanBar,
      tabs,
      clearFilter: () => void Promise.all([update($, projectFilter, () => null), update($, selected, () => []), update($, selectedItems, () => ({}))]),
    })
  })
}

