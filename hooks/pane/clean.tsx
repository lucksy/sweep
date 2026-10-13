// The clean flow under the table: select → dry run → confirm → cleaning → done.
// Pure: register.tsx runs the engine and moves `flow`.

import { formatBytes } from '../../charts/format'
import type { CleanResult, Flow, ScanResult } from '../../types'
import type { El } from './overview'
import { selectedBytes } from './model'

/** What a caution category costs you, in plain words (SPEC-pane §Clean flow). */
export const CAUTION: Record<string, string> = {
  worktrees: 'worktrees: agent checkouts are deleted; their commits are already on other branches',
  transcripts: "transcripts: those sessions can't be resumed",
  'orphan-projects': "orphan-projects: those sessions can't be resumed; memory is kept",
  'file-history': 'file-history: rewind is lost for those sessions',
  'plugin-versions': 'plugin-versions: restart sessions still running an old plugin version',
}

export type CleanData = {
  scan: ScanResult | null
  flow: Flow
  selected: string[]
  selectedItems: Record<string, string[]>
  dry: CleanResult | null
  result: CleanResult | null
  removedSoFar: number
  freedSoFar: number
  error: string | null
  freedThisSession: number
}

export type CleanActions = {
  selectSafe: () => void
  clean: () => void
  confirm: () => void
  trash: () => void
  cancel: () => void
  back: () => void
}

const byCategory = (rows: { category: string; bytes?: number }[]) => {
  const out = new Map<string, { n: number; bytes: number }>()
  for (const r of rows) {
    const x = out.get(r.category) ?? { n: 0, bytes: 0 }
    out.set(r.category, { n: x.n + 1, bytes: x.bytes + (r.bytes ?? 0) })
  }
  return [...out]
}

export function CleanBar(E: El, d: CleanData, a: CleanActions) {
  const { Box, Text, Button } = E
  if (!d.scan) return null

  if (d.flow === 'dryrun') return <Box key="clean-bar"><Text dimColor>Checking what would be removed… (dry run, nothing is deleted)</Text></Box>

  if (d.flow === 'confirm' && d.dry) {
    const rows = byCategory(d.dry.removed)
    const cautions = rows.map(([id]) => CAUTION[id]).filter(Boolean)
    return (
      <Box key="clean-bar" flexDirection="column" borderStyle="round" borderColor="warning" paddingX={1}>
        <Text bold>{d.dry.removed.length ? `Delete ${d.dry.removed.length} item(s), ${formatBytes(d.dry.freedBytes)}?` : 'Nothing in this selection can be removed now.'}</Text>
        {rows.map(([id, x]) => <Box key={`dry-${id}`}><Text>{`  ${id}: ${x.n} item(s) · ${formatBytes(x.bytes)}`}</Text></Box>)}
        {cautions.map((line, i) => <Box key={`caution-${i}`}><Text color="warning">{`  ${line}`}</Text></Box>)}
        {d.dry.kept.length > 0 && <Text dimColor>{`  kept ${d.dry.kept.length}: they hold work or are in use`}</Text>}
        <Box gap={2} marginTop={1}>
          {d.dry.removed.length > 0 && <Button key="confirm" label={`Delete ${formatBytes(d.dry.freedBytes)}`} hotkey="y" variant="primary" onPress={() => a.confirm()} />}
          {d.dry.removed.length > 0 && <Button key="trash" label={`Move ${formatBytes(d.dry.freedBytes)} to Trash`} hotkey="t" onPress={() => a.trash()} />}
          <Button key="cancel" label="Cancel" hotkey="n" onPress={() => a.cancel()} />
        </Box>
      </Box>
    )
  }

  if (d.flow === 'cleaning') {
    const total = d.dry?.removed.length ?? 0
    return <Box key="clean-bar"><Text color="warning">{`Removing… ${d.removedSoFar}/${total} · ${formatBytes(d.freedSoFar)} done`}</Text></Box>
  }

  if (d.flow === 'error') {
    return (
      <Box key="clean-bar" gap={2}>
        <Text color="error">{`Clean failed: ${d.error ?? 'unknown error'}`}</Text>
        <Button key="back" label="Back" hotkey="b" onPress={() => a.back()} />
      </Box>
    )
  }

  const bytes = selectedBytes(d.scan, d.selected, d.selectedItems)
  return (
    <Box key="clean-bar" flexDirection="column">
      {d.flow === 'done' && d.result && (
        <Box key="done" flexDirection="column">
          <Text color={d.result.failed.length ? 'warning' : 'success'}>
            {d.result.mode === 'trash'
              ? `Moved ${formatBytes(d.result.freedBytes)} to the Trash · empty it to free the space · ${d.result.removed.length} moved · ${d.result.kept.length} kept · ${d.result.failed.length} failed`
              : `Freed ${formatBytes(d.result.freedBytes)} · ${d.result.removed.length} removed · ${d.result.kept.length} kept · ${d.result.failed.length} failed`}
          </Text>
          {d.result.failed.map((f, i) => <Box key={`failed-${i}`}><Text color="error" wrap="truncate-middle">{`  ${f.path}: ${f.error}`}</Text></Box>)}
        </Box>
      )}
      <Box gap={2}>
        <Text>{`Selected: ${d.selected.length} categor${d.selected.length === 1 ? 'y' : 'ies'} · ${formatBytes(bytes)}`}</Text>
        <Button key="select-safe" label="Select safe" hotkey="s" onPress={() => a.selectSafe()} />
        {d.selected.length > 0 && <Button key="clean" label={`Clean ${formatBytes(bytes)}…`} hotkey="c" onPress={() => a.clean()} />}
        {d.freedThisSession > 0 && <Text dimColor>{`freed this session ${formatBytes(d.freedThisSession)}`}</Text>}
      </Box>
    </Box>
  )
}
