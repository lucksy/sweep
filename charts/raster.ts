// A grid of `[codePoint, foreground, background]` cells, packed as a Raster's
// `cells` (standard padded base64 of little-endian u32 triplets). Pure.

import { NONE } from './palette'

export type LegendPart = { mark: string; color: string | null; text: string }
/** A region of the chart that stands for one id (a category, a project). */
export type HitBox = { x: number; y: number; w: number; h: number; id: string }
export type Cells = { kind: 'cells'; columns: number; rows: number; cells: string }
export type Pixels = { kind: 'pixels'; columns: number; rows: number; png: string }
type Described = { legend: LegendPart[]; alt: string; hit?: HitBox[] }
export type CellChart = Cells & Described
export type PixelChart = Pixels & Described
export type Chart = CellChart | PixelChart

// Code points a Raster takes are printable and one column wide. Anything else
// (controls, combining marks, wide CJK, astral) becomes '?', so user text such
// as a project name can never get the chart refused.
const WIDE: [number, number][] = [[0x1100, 0x115f], [0x2e80, 0xa4cf], [0xac00, 0xd7a3], [0xf900, 0xfaff], [0xfe30, 0xfe4f], [0xff00, 0xff60], [0xffe0, 0xffe6]]
export function cellCode(ch: string): number {
  const c = ch.codePointAt(0) ?? 0x3f
  if (c < 0x20 || (c >= 0x7f && c < 0xa0) || c > 0xffff || (c >= 0x300 && c <= 0x36f) || (c >= 0xd800 && c <= 0xdfff)) return 0x3f
  return WIDE.some(([a, b]) => c >= a && c <= b) ? 0x3f : c
}

export class Grid {
  readonly words: Uint32Array
  constructor(readonly columns: number, readonly rows: number) {
    this.words = new Uint32Array(columns * rows * 3)
    for (let i = 0; i < columns * rows; i++) this.words.set([0x20, NONE, NONE], i * 3)
  }
  set(col: number, row: number, glyph: number, fg: number, bg: number = NONE) {
    if (col < 0 || row < 0 || col >= this.columns || row >= this.rows) return
    this.words.set([glyph, fg, bg], (row * this.columns + col) * 3)
  }
  text(col: number, row: number, s: string, fg: number, bg: number = NONE) {
    ;[...s].forEach((ch, i) => this.set(col + i, row, cellCode(ch), fg, bg))
  }
  pack(): Cells {
    const bytes = new Uint8Array(this.words.length * 4)
    const view = new DataView(bytes.buffer)
    this.words.forEach((w, i) => view.setUint32(i * 4, w, true))
    return { kind: 'cells', columns: this.columns, rows: this.rows, cells: toBase64(bytes) }
  }
}

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'

export function toBase64(bytes: Uint8Array): string {
  let out = ''
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i] ?? 0, b = bytes[i + 1] ?? 0, c = bytes[i + 2] ?? 0
    const n = (a << 16) | (b << 8) | c
    out += B64[(n >> 18) & 63]! + B64[(n >> 12) & 63]!
    out += i + 1 < bytes.length ? B64[(n >> 6) & 63]! : '='
    out += i + 2 < bytes.length ? B64[n & 63]! : '='
  }
  return out
}

/** The u32 words of packed cells, for tests and repaints. */
export function decodeCells(cells: string): Uint32Array {
  const clean = cells.replace(/=+$/, '')
  const bytes = new Uint8Array(Math.floor((clean.length * 3) / 4))
  let bits = 0, acc = 0, at = 0
  for (const ch of clean) {
    acc = (acc << 6) | B64.indexOf(ch)
    bits += 6
    if (bits >= 8) {
      bits -= 8
      bytes[at++] = (acc >> bits) & 0xff
    }
  }
  const view = new DataView(bytes.buffer)
  return Uint32Array.from({ length: bytes.length / 4 }, (_, i) => view.getUint32(i * 4, true))
}

/** Partial-block glyphs: index n is n eighths of a cell, left-aligned. */
export const EIGHTHS = [0x20, 0x258f, 0x258e, 0x258d, 0x258c, 0x258b, 0x258a, 0x2589, 0x2588]
