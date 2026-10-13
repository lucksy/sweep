import { decodeCells } from '../../charts/raster'

/** Each cell of a chart as [char, fg, bg], row by row. */
export function grid(chart: { columns: number; rows: number; cells: string }) {
  const w = decodeCells(chart.cells)
  return Array.from({ length: chart.rows }, (_, y) =>
    Array.from({ length: chart.columns }, (_, x) => {
      const i = (y * chart.columns + x) * 3
      return { ch: String.fromCodePoint(w[i]!), fg: w[i + 1]!, bg: w[i + 2]! }
    }),
  )
}

export const textOf = (chart: { columns: number; rows: number; cells: string }) => grid(chart).map((row) => row.map((c) => c.ch).join('').trimEnd())

/** Printable, one column wide: ASCII, Latin-1, general punctuation, box drawing, blocks, braille. */
export const isNarrow = (c: number) => (c >= 0x20 && c < 0x7f) || (c >= 0xa0 && c < 0x300) || (c >= 0x2000 && c < 0x2070) || (c >= 0x2500 && c < 0x25a0) || (c >= 0x2800 && c < 0x2900)
