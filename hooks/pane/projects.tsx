// The Projects tab: where reclaimable space sits, per project. Pressing a
// project selects its items and goes back to the overview. Pure.

import { bars } from '../../charts/bars'
import { formatBytes } from '../../charts/format'
import { RISK } from '../../charts/palette'
import type { ScanResult } from '../../types'
import { ChartView, type DrawStyle } from './charts'
import type { El } from './overview'

export const TOP = 15

export type ProjectsData = { scan: ScanResult; bodyColumns: number; style: DrawStyle }
export type ProjectsActions = { pick: (path: string) => void }

const name = (path: string) => path.replace(/\/+$/, '').split('/').pop() || path

// The risk of the category holding most of a project's reclaimable bytes.
function riskOf(scan: ScanResult, byCategory: Record<string, number>) {
  const top = Object.entries(byCategory).sort((a, b) => b[1] - a[1])[0]?.[0]
  return scan.categories.find((c) => c.id === top)?.risk ?? 'safe'
}

export function Projects(E: El, d: ProjectsData, a: ProjectsActions) {
  const { Box, Text, Button } = E
  const rows = d.scan.projects.filter((p) => p.bytes > 0).slice(0, TOP)
  if (!rows.length) return <Box key="projects"><Text dimColor>No project holds anything sweep can measure.</Text></Box>
  const chart = bars(rows.map((p) => ({
    id: p.path, label: `${name(p.path)}${p.exists ? '' : ' (gone)'}`, value: p.reclaimableBytes,
    kept: p.bytes - p.reclaimableBytes, color: RISK[riskOf(d.scan, p.byCategory)],
  })), Math.max(40, d.bodyColumns - 2))
  return (
    <Box key="projects" flexDirection="column" gap={1}>
      <Text bold>{`Reclaimable by project: ${rows.length} with something to clean${d.scan.projects.length > rows.length ? ` (${d.scan.projects.length} seen)` : ''}`}</Text>
      {ChartView(E, chart, 'project-bars')}
      <Box key="project-list" flexDirection="column">
        {rows.map((p, i) => (
          <Box key={`project-row-${i}`} gap={1}>
            <Button key={`project-${i}`} plain label="›" onPress={() => a.pick(p.path)} />
            <Text wrap="truncate-middle">{`${p.path}${p.exists ? '' : ' (gone)'}`}</Text>
            <Text dimColor>{`${formatBytes(p.reclaimableBytes)} reclaimable · ${Object.keys(p.byCategory).join(', ') || 'nothing to clean'}`}</Text>
          </Box>
        ))}
      </Box>
    </Box>
  )
}

export function Tabs(E: El, view: 'overview' | 'projects', a: { tab: (v: 'overview' | 'projects') => void }) {
  const { Box, Button } = E
  return (
    <Box key="tabs" gap={2}>
      {/* A Button draws its own brackets: the active tab is the primary one, the other dim. */}
      <Button key="tab-overview" label="Overview" hotkey="1" variant={view === 'overview' ? 'primary' : 'secondary'} dimColor={view !== 'overview'} onPress={() => a.tab('overview')} />
      <Button key="tab-projects" label="Projects" hotkey="2" variant={view === 'projects' ? 'primary' : 'secondary'} dimColor={view !== 'projects'} onPress={() => a.tab('projects')} />
    </Box>
  )
}
