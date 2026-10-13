---
status: draft
created: 2026-10-13
module: charts
---

# Spec: charts

## Objective

Pure TypeScript renderers that turn one scan's numbers into terminal charts for the pane. sweep stores no data, so there are no charts over time. Each chart comes in two forms:
- **cells**: a `Raster`'s glyph grid of blocks and braille, which draws in every terminal.
- **pixels**: a PNG for `Image`, which draws in kitty and Ghostty.

Every chart also returns a legend and an `alt` sentence, so meaning never rests on color alone. The module has no Claude Code API and no Node API, so it is unit-tested directly.

Prior art to reuse (the author's own MIT code): `agent-skills-mods/packages/core/chart.ts` (cell packing, base64, legends) and `pixels.ts` (`encodePng`, `zlib`, `drawsPixels`). Copy what fits; don't import across repos.

## Output shape

```ts
export type Cells = { kind: 'cells'; columns: number; rows: number; cells: string }   // Raster props
export type Pixels = { kind: 'pixels'; columns: number; rows: number; png: string }   // Image source, base64
export type Chart = (Cells | Pixels) & {
  legend: LegendPart[]          // { mark: '█', color: '#3fbf5a', text: 'worktrees 2.7G' }
  alt: string                   // "Worktrees 2.7G of 3.5G reclaimable; temp 365M; …"
  hit?: HitBox[]                // { x, y, w, h, id }: which category/project each region is (for presses)
}
```

`style: 'cells' | 'pixels'` is chosen by the caller (SPEC-pane, userConfig `chartStyle`). Sizes are in terminal cells; pixels use 6×12 px per cell, as `pixels.ts` does.

## Palette (`palette.ts`)

| meaning | color |
|---|---|
| safe | `#3fbf5a` green |
| caution | `#fab219` amber |
| review | `#d03b3b` red |
| kept (not reclaimable) | `#4a4f4c` grey |
| footprint parts (8) | a fixed categorical order, tested with a contrast check against dark and light backgrounds (≥ 3:1) |
| axis, grid | `#5a6460` |

The same id always gets the same color in every chart.

## Charts

### 1. Footprint bar (`stackedBar`)

One or two rows, the full width. Each segment is one footprint part, sized by bytes with eighth-block precision (`▏▎▍▌▋▊▉█`) on the dividing cell. A second row marks the reclaimable share of each part in its risk color, as an underline of `▀`.

```
██████████████▋▓▓▓▓▓▓▓▓▓▓▓▓░░░░░░░░░░▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒██
worktrees 2.8G   tmp 1.6G      projects 1.4G  plugins 2.1G          cli 0.7G
▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀   ▀▀▀▀                          ▀▀           = reclaimable
```

### 2. Treemap of reclaimable space (`treemap`)

A squarified treemap over a box (for example 60×14 cells).
- **Level 1:** categories, colored by risk.
- **Level 2 (drill-down):** items, or projects.
- Each tile with room shows `label size` in contrasting text. Tiles under 2×1 cells merge into `+N more`.
- `hit` boxes let the pane map a press or hover on a tile to its category. Presses are routed through a `Client` region where available; otherwise the category table drives selection.

```
┌──────────────────────────────┬──────────────┬─────────┐
│ worktrees                    │ tmp-sessions │ plugin- │
│ 2.7G                         │ 365M         │ versions│
│                              ├──────────┬───┤ 199M    │
│                              │ old-cli  │+3 │         │
└──────────────────────────────┴──────────┴───┴─────────┘
```

### 3. Bar list (`bars`)

Horizontal bars, one row each, sorted by size, sharing one scale. A row reads: label, bar, value. Kept bytes draw as a grey tail after the reclaimable part. Used for categories, projects (top 15) and items.

```
worktrees          ███████████████████████████████▌      2.7G
tmp-sessions       ████▏                                 365M
old-cli            ██▋                                   238M
plugin-versions    ██▎░                                  199M  (+16M kept)
```

### 4. Age histogram (`histogram`)

Five vertical columns from `ageBuckets` (`< 1 d` … `> 90 d`), the bytes stacked by risk, with labels under each column. Shown in the category drill-down, so you can see whether waste is old (safe to drop) or recent (in use).

## Animation (optional, pane only)

- A Raster can be repainted with `$.ui.blit`. On first draw, the treemap and bars may grow in over 300 ms (`reveal(cells, fraction)`, as `revealCells` does in agent-skills-mods).
- It runs only when `chartStyle` isn't `cells-static`, and never in tests.

## Acceptance Criteria

- [ ] Each chart returns `columns × rows` that match its input box, and `cells` decodes to exactly `columns*rows*3` u32 values, each code point printable and one column wide.
- [ ] The segment widths of `stackedBar` sum to the width (± 1 eighth-cell), and a part ≥ 1% of the total is always visible.
- [ ] `treemap` tile areas are proportional to bytes within 1 cell, and every input id has a tile or is counted in `+N more`.
- [ ] `histogram` handles empty buckets and a single non-empty bucket.
- [ ] `png` output is a valid PNG (signature plus IHDR check), ≤ 2 MiB for a 120×30-cell chart.
- [ ] `alt` names the top three values with units for every chart.
- [ ] Snapshot tests of decoded cells for fixed inputs.
