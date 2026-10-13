// sweep's mod: the /sweep command and its pane. Every number comes from a
// scan made in this session; nothing is stored (no $.store, no files).
// All $ calls live in this file: the views it imports are pure.

import { atom, read, update } from 'claude-code'
import type { Elements, EngineInterface, Register } from 'claude-code'

import type { Flow, Progress, ScanResult, ScanStatus, View, CleanResult } from '../types'
import { formatBytes, parseScan, progressOf, scanArgv, takeLines, textArgv } from './engine-client'
import { resolveStyle, type ChartStyle, type TerminalEnv } from '../charts/terminal'
import { ago, safeIds, toggle } from './pane/model'
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

// The scan in flight, so a second request joins it instead of starting another.
let inflight: Promise<void> | null = null
// What the terminal is, read once per session start: whether it draws pictures.
let terminal: TerminalEnv = {}

function rescan($: EngineInterface): Promise<void> {
  inflight ??= runScan($).finally(() => { inflight = null })
  return inflight
}

async function runScan($: EngineInterface) {
  await update($, status, () => 'scanning')
  await update($, progress, () => null)
  await update($, failure, () => null)
  let stdout = ''
  let stderr = ''
  let pending = ''
  try {
    const child = $.process.spawn({ argv: scanArgv($.plugin.root) })
    const pieces = child[Symbol.asyncIterator]()
    let piece = await pieces.next()
    while (!piece.done) {
      if (piece.value.stream === 'stdout') stdout += piece.value.text
      else {
        stderr += piece.value.text
        const { events, rest } = takeLines(pending + piece.value.text)
        pending = rest
        for (const event of events) {
          const p = progressOf(event)
          if (p) await update($, progress, () => p)
        }
      }
      piece = await pieces.next()
    }
    const result = parseScan({ exitCode: piece.value?.code ?? 1, stdout, stderr: stderr.split('\n').filter((l) => !l.startsWith('{')).join('\n') })
    const now = await $.clock.now()
    await update($, scanned, () => result)
    await update($, scannedAt, () => now)
    await update($, status, () => 'idle')
  } catch (error) {
    await update($, failure, () => (error instanceof Error ? error.message : String(error)))
    await update($, status, () => 'error')
  }
  await update($, progress, () => null)
}

/** Scan unless this session has a recent scan already. */
async function ensureScan($: EngineInterface, force = false) {
  const at = await read($, scannedAt)
  const now = await $.clock.now()
  if (force || at === null || now - at > FRESH_MS) void rescan($)
}

async function openPane($: EngineInterface, { force = false } = {}): Promise<{ text: string }> {
  const placed = await $.ui.open(OPEN)
  if (!placed.isPlaced) {
    const run = await $.process.run(textArgv($.plugin.root), { timeoutMs: 5 * 60_000, env: { NO_COLOR: '1' } })
    return { text: `Pane needs ≥ 110 columns; showing text.\n${run.stdout}` }
  }
  await ensureScan($, force)
  const result = await read($, scanned)
  const at = await read($, scannedAt)
  const now = await $.clock.now()
  return { text: result && at !== null ? `Sweep pane opened · ${formatBytes(result.totals.reclaimableBytes)} reclaimable (scanned ${ago(now - at)})` : 'Sweep pane opened · scanning…' }
}

export const register: Register = (on, options) => {
  const chartStyle = (options.chartStyle ?? 'auto') as ChartStyle

  on('session.start', async ($, e, next) => {
    terminal = {
      term: await $.env.get('TERM'),
      termProgram: await $.env.get('TERM_PROGRAM'),
      kitty: await $.env.get('KITTY_WINDOW_ID'),
      tmux: await $.env.get('TMUX'),
    }
    await $.command.register({
      name: 'sweep',
      description: 'Open the sweep pane: what Claude Code stores and what you can free',
      argumentHint: '[scan | clean <ids> | explain <id> | text]',
    })
    return next(e)
  })

  on('command.run', { command: 'sweep' }, async ($, e) => {
    const [sub] = String(e.args ?? '').trim().split(/\s+/)
    return openPane($, { force: sub === 'scan' })
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
    }
    return Overview(E, data, {
      rescan: () => void rescan($),
      toggle: (id) => void update($, selected, (list) => toggle(list, id)),
      selectSafe: () => void (result && update($, selected, () => safeIds(result))),
      drill: (id) => void Promise.all([update($, focusId, () => id), update($, view, () => 'category')]),
    })
  })
}

// Read by later tasks (clean flow, views); declared here so the state contract stays whole.
void flow
void dry
