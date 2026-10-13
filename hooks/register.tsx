// sweep's mod: the /sweep command and its pane. Every number comes from a
// scan made in this session; nothing is stored.

import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { ScanResult, ScanStatus } from '../types'
import { FIVE_MINUTES, formatBytes, parseScan, reclaimable, scanArgv } from './engine-client'

const PANE = 'sweep'
const OPEN = { id: PANE, title: 'Sweep' }

const scanned = atom({ plugin: 'sweep', key: 'scan' } as const, null as ScanResult | null)
const scannedAt = atom({ plugin: 'sweep', key: 'scannedAt' } as const, null as number | null)
const status = atom({ plugin: 'sweep', key: 'status' } as const, 'idle' as ScanStatus)
const failure = atom({ plugin: 'sweep', key: 'error' } as const, null as string | null)

async function rescan($: EngineInterface) {
  if ((await read($, status)) === 'scanning') return
  await update($, status, () => 'scanning')
  try {
    const result = parseScan(await $.process.run(scanArgv($.plugin.root), { timeoutMs: FIVE_MINUTES }))
    const now = await $.clock.now()
    await update($, scanned, () => result)
    await update($, scannedAt, () => now)
    await update($, failure, () => null)
    await update($, status, () => 'idle')
  } catch (error) {
    await update($, failure, () => (error instanceof Error ? error.message : String(error)))
    await update($, status, () => 'error')
  }
}

export const register: Register = (on) => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'sweep',
      description: 'Open the sweep pane: what Claude Code stores and what you can free',
      argumentHint: '[scan | clean <ids> | explain <id> | text]',
    })
    return next(e)
  })

  on('command.run', { command: 'sweep' }, async ($) => {
    await $.ui.open(OPEN)
    void rescan($)
    return { text: 'Sweep pane opened · scanning…' }
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text } = $.ui.resolve(e)
    const result = await read($, scanned)
    const state = await read($, status)
    const error = await read($, failure)

    return (
      <Box flexDirection="column">
        {result && <Text bold>{formatBytes(reclaimable(result))} reclaimable</Text>}
        {!result && state === 'scanning' && <Text dimColor>Scanning Claude Code's storage…</Text>}
        {error && <Text color="red">Scan failed: {error}</Text>}
      </Box>
    )
  })
}
