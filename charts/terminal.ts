// Whether this terminal draws pictures, from its environment: kitty or
// Ghostty, not inside tmux (from agent-skills-mods' pixels.ts).
export type TerminalEnv = { term?: string; termProgram?: string; kitty?: string; tmux?: string }

export function drawsPixels(env: TerminalEnv): boolean {
  if (env.tmux) return false
  return /kitty|ghostty/i.test(env.term ?? '') || /kitty|ghostty/i.test(env.termProgram ?? '') || !!env.kitty
}

export type ChartStyle = 'auto' | 'pixels' | 'cells'

/** cells or pixels for a terminal; `text` where the surface draws neither. */
export function resolveStyle(style: ChartStyle, env: TerminalEnv, surfaceHasRaster: boolean): 'cells' | 'pixels' | 'text' {
  if (!surfaceHasRaster) return 'text'
  if (style === 'pixels') return 'pixels'
  if (style === 'cells') return 'cells'
  return drawsPixels(env) ? 'pixels' : 'cells'
}
