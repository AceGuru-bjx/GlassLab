/**
 * Shared CSS color utilities for the glass engine, export system and UI
 * decisions.
 *
 * The API color whitelist (#25) permits #hex(3/4/6/8), rgb()/rgba()/
 * hsl()/hsla() and "transparent". Every consumer must compose alpha and
 * judge lightness correctly for ALL of them — the three per-file copies
 * this replaces only understood 6-digit hex (#50).
 */

const SHORT_HEX = /^[0-9a-f]{3}$|^[0-9a-f]{4}$/
const LONG_HEX = /^[0-9a-f]{6}$|^[0-9a-f]{8}$/

function round3(v: number): number {
  return Math.round(v * 1000) / 1000
}

/**
 * Apply an extra alpha multiplier to any whitelisted CSS color.
 *
 * - 3/6-digit hex → exact portable `rgba()` (fast path, canvas-safe)
 * - 4/8-digit hex (alpha-carrying) and functional colors →
 *   `color-mix(in srgb, <color> N%, transparent)`, which premultiplies
 *   the source alpha correctly (4/8-digit hex keeps its own alpha × N)
 * - `transparent` mixes to transparent; alpha=1 short-circuits to the
 *   original color; alpha=0 produces a fully transparent layer
 */
export function withAlpha(color: string, alpha: number): string {
  const a = round3(Math.max(0, Math.min(1, alpha)))
  const c = color.trim()
  const hex = c.startsWith('#') ? c.slice(1).toLowerCase() : ''
  if (LONG_HEX.test(hex) || SHORT_HEX.test(hex)) {
    // 3/6-digit have no alpha byte — exact rgba() output.
    if (hex.length === 3 || hex.length === 6) {
      const full = hex.length === 3 ? hex.split('').map(x => x + x).join('') : hex
      const n = parseInt(full, 16)
      return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`
    }
    // 4/8-digit carry their own alpha — color-mix composes both factors.
  }
  if (a <= 0) return 'rgba(0, 0, 0, 0)'
  if (a >= 1) return c
  const pct = Math.round(a * 10000) / 100
  return `color-mix(in srgb, ${c} ${pct}%, transparent)`
}

/**
 * Normalize any whitelisted CSS color to a simple #rrggbb hex string.
 * Uses the same canvas reference parser as isDarkColor — unparseable or
 * fully transparent colors resolve to #000000. Feeds <input type="color">
 * swatches, which only accept 6-digit hex values.
 */
export function toHexColor(color: string | undefined | null): string {
  if (typeof document === 'undefined' || typeof color !== 'string') return '#000000'
  const canvas = document.createElement('canvas')
  canvas.width = 1
  canvas.height = 1
  const ctx = canvas.getContext('2d')
  if (!ctx) return '#000000'
  ctx.fillStyle = '#000000'
  ctx.fillStyle = color.trim()
  const v = ctx.fillStyle
  if (v.startsWith('#')) {
    const hex = v.slice(1)
    if (hex.length === 8) return '#' + hex.slice(0, 6)
    if (hex.length === 4) return '#' + hex.slice(0, 3).split('').map(x => x + x).join('')
    if (hex.length === 3) return '#' + hex.split('').map(x => x + x).join('')
    if (hex.length === 6) return v
  }
  const m = v.match(/rgba?\(([^)]+)\)/)
  if (!m) return '#000000'
  const parts = m[1].split(/[\s,/]+/).filter(Boolean).map(parseFloat)
  if (parts.length < 3 || parts.slice(0, 3).some(x => Number.isNaN(x))) return '#000000'
  const b = (n: number) =>
    Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0')
  return `#${b(parts[0])}${b(parts[1])}${b(parts[2])}`
}

/**
 * Scale the alpha of any whitelisted CSS color by a multiplier, keeping RGB
 * intact — returns a plain `rgba()` (portable everywhere, including exported
 * CSS). `transparent` passes through. Feeds the Phase 9 glow system where
 * the final glow alpha = the color's own alpha × glowOpacity.
 *
 * Uses the same canvas reference parser as isDarkColor; an unparseable color
 * scales nothing and returns `rgba(0, 0, 0, 0)` (invisible, safe default).
 */
export function scaleColorAlpha(color: string, k: number): string {
  const c = color.trim()
  if (c === '' || c === 'transparent') return 'transparent'
  // k >= 1 is the identity — return the original string so SSR (no canvas)
  // and client render byte-identical box-shadows (hydration stability).
  if (!(k < 1)) return c
  if (typeof document === 'undefined') return c
  const canvas = document.createElement('canvas')
  canvas.width = 1
  canvas.height = 1
  const ctx = canvas.getContext('2d')
  if (!ctx) return c
  ctx.fillStyle = '#ffffff'
  ctx.fillStyle = c
  const v = ctx.fillStyle
  let r = 255
  let g = 255
  let b = 255
  let a = 1
  if (v.startsWith('#')) {
    const hex = v.slice(1)
    let body = hex
    if (hex.length === 8) {
      a = parseInt(hex.slice(6), 16) / 255
      body = hex.slice(0, 6)
    } else if (hex.length === 4) {
      a = parseInt(hex.slice(3), 16) / 255
      body = hex.slice(0, 3)
    }
    if (body.length === 3) body = body.split('').map(x => x + x).join('')
    const n = parseInt(body, 16)
    if (!Number.isNaN(n) && body.length === 6) {
      r = (n >> 16) & 255
      g = (n >> 8) & 255
      b = n & 255
    }
  } else {
    const m = v.match(/rgba?\(([^)]+)\)/)
    if (!m) return 'rgba(0, 0, 0, 0)'
    const parts = m[1].split(/[\s,/]+/).filter(Boolean).map(parseFloat)
    if (parts.length < 3 || parts.slice(0, 3).some(x => Number.isNaN(x))) {
      return 'rgba(0, 0, 0, 0)'
    }
    r = parts[0]
    g = parts[1]
    b = parts[2]
    a = parts.length > 3 && !Number.isNaN(parts[3]) ? parts[3] : 1
  }
  return `rgba(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)}, ${round3(
    Math.max(0, Math.min(1, a * k))
  )})`
}

/**
 * Perceived-luminance darkness test for any whitelisted CSS color.
 * Uses a detached canvas as the reference CSS color parser, so hex of any
 * length, rgb()/hsl() forms and "transparent" all resolve identically to
 * the browser's own rules. Unparseable colors are treated as light.
 */
export function isDarkColor(color: string): boolean {
  if (typeof document === 'undefined') return false
  const canvas = document.createElement('canvas')
  canvas.width = 1
  canvas.height = 1
  const ctx = canvas.getContext('2d')
  if (!ctx) return false
  // fillStyle keeps its previous value when assigned an invalid color —
  // an invalid input therefore reads back as white, which is "not dark",
  // the same answer an explicit validity check would produce.
  ctx.fillStyle = color.trim()
  const v = ctx.fillStyle
  let r = 255
  let g = 255
  let b = 255
  let a = 1
  if (v.startsWith('#')) {
    // Canonical readback is #rrggbb (opaque); handle alpha-carrying
    // spellings defensively for engines that echo them back verbatim.
    const hex = v.slice(1)
    let body = hex
    if (hex.length === 8) {
      a = parseInt(hex.slice(6), 16) / 255
      body = hex.slice(0, 6)
    } else if (hex.length === 4) {
      a = parseInt(hex.slice(3), 16) / 255
      body = hex.slice(0, 3)
    }
    if (body.length === 3) body = body.split('').map(x => x + x).join('')
    const n = parseInt(body, 16)
    if (!Number.isNaN(n) && body.length === 6) {
      r = (n >> 16) & 255
      g = (n >> 8) & 255
      b = n & 255
    }
  } else {
    const m = v.match(/rgba?\(([^)]+)\)/)
    if (!m) return false
    const parts = m[1].split(/[\s,/]+/).filter(Boolean).map(parseFloat)
    if (parts.length < 3 || parts.slice(0, 3).some(x => Number.isNaN(x))) return false
    r = parts[0]
    g = parts[1]
    b = parts[2]
    a = parts.length > 3 && !Number.isNaN(parts[3]) ? parts[3] : 1
  }
  if (a === 0) return false
  return (r * 299 + g * 587 + b * 114) / 1000 < 128
}
