/**
 * Glass Lab export utilities (Phase 2 M2).
 *
 * Turns a GlassConfig into shareable artifacts:
 *  - standalone CSS (graceful degradation: blur/saturate/tint/highlight/glow;
 *    the full displacement-map refraction stays JS-driven, noted in comments)
 *  - a self-contained React component embedding that CSS
 *  - raw JSON
 *  - a URL share link (#g=<base64url of config JSON>, unicode-safe)
 */

import { withAlpha } from './color'
import { DEFAULT_CONFIG, type GlassConfig } from './presets'

function radiusPx(cornerRadius: number): string {
  return cornerRadius >= 999 ? '9999px' : `${cornerRadius}px`
}

/** CSS body shared by the CSS and React exports. */
function cssBody(config: GlassConfig): string {
  const hl = Math.max(0, Math.min(1, config.highlight))
  const glow =
    config.glow && config.glow !== 'transparent'
      ? `,\n  0 0 24px 2px ${config.glow}`
      : ''
  const tint =
    config.tintOpacity > 0
      ? `\n  /* 染色 ${Math.round(config.tintOpacity * 100)}% */\n  background: ${withAlpha(config.tint, config.tintOpacity)};`
      : ''

  return `/* 生成自 GlassLab 玻璃实验室 — https://github.com/AceGuru-bjx/GlassLab
 * 说明：blur/saturate/染色/边缘高光为纯 CSS；
 * 完整的边缘位移折射（Kyant0 算法）由 JS 位移贴图驱动，Web 版引擎见上方仓库。 */
.liquid-glass {
  position: relative;
  border-radius: ${radiusPx(config.cornerRadius)};
  -webkit-backdrop-filter: blur(${config.blur}px) saturate(${config.saturation}%);
  backdrop-filter: blur(${config.blur}px) saturate(${config.saturation}%);${tint}
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.28),
    inset 0 -1px 0 rgba(0, 0, 0, 0.12), 0 8px 32px rgba(0, 0, 0, 0.12)${glow};
}

/* 菲涅尔边缘高光 ${Math.round(hl * 100)}% @ ${config.lightAngle}° */
.liquid-glass::before {
  content: "";
  position: absolute;
  inset: 0;
  border-radius: inherit;
  padding: 1.5px;
  pointer-events: none;
  background: linear-gradient(${config.lightAngle}deg,
    rgba(255, 255, 255, ${(0.75 * hl).toFixed(2)}) 0%,
    rgba(255, 255, 255, ${(0.18 * hl).toFixed(2)}) 28%,
    rgba(255, 255, 255, ${(0.02 * hl).toFixed(2)}) 50%,
    rgba(255, 255, 255, ${(0.1 * hl).toFixed(2)}) 72%,
    rgba(255, 255, 255, ${(0.45 * hl).toFixed(2)}) 100%);
  -webkit-mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
  -webkit-mask-composite: xor;
  mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
  mask-composite: exclude;
}`
}

/** Standalone CSS export. */
export function configToCss(config: GlassConfig): string {
  return cssBody(config)
}

/** Self-contained React component export (CSS embedded, zero deps). */
export function configToReact(config: GlassConfig): string {
  const css = cssBody(config)
  return `// 生成自 GlassLab 玻璃实验室 — https://github.com/AceGuru-bjx/GlassLab
// 用法：<LiquidGlassCard>你的内容</LiquidGlassCard>
// 完整液态玻璃引擎（边缘位移折射 + 光谱色散）见上方仓库。

const config = ${JSON.stringify(config, null, 2)}

const css = \`${css}\`

export function LiquidGlassCard({
  children,
}: {
  children?: React.ReactNode
}) {
  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: css }} />
      <div className="liquid-glass">{children}</div>
    </>
  )
}`
}

/** Raw JSON export. */
export function configToJson(config: GlassConfig): string {
  return JSON.stringify(config, null, 2)
}

// ---------------------------------------------------------------------------
// Share-link codec — unicode-safe base64url of the config JSON.
// ---------------------------------------------------------------------------

function toBase64Url(json: string): string {
  const bytes = new TextEncoder().encode(json)
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function fromBase64Url(s: string): string {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/')
  const bin = atob(b64)
  const bytes = Uint8Array.from(bin, c => c.charCodeAt(0))
  return new TextDecoder().decode(bytes)
}

/**
 * Build the share URL for the current config.
 * Client-side only (uses `location`).
 */
export function shareUrl(config: GlassConfig): string {
  return `${window.location.origin}/#g=${toBase64Url(JSON.stringify(config))}`
}

/** Extract the `#g=` payload from a URL hash, if present. */
export function hashPayload(hash: string): string | null {
  const m = hash.match(/^#g=([A-Za-z0-9_-]+)$/)
  return m ? m[1] : null
}

/**
 * Decode a share payload back into a GlassConfig.
 * Merges over DEFAULT_CONFIG (forward-compatible), coerces numbers and
 * validates types; returns null for anything malformed — bad links must
 * never crash the lab.
 */
export function decodeConfig(payload: string): GlassConfig | null {
  try {
    const raw: unknown = JSON.parse(fromBase64Url(payload))
    if (typeof raw !== 'object' || raw === null) return null
    const merged: GlassConfig = { ...DEFAULT_CONFIG, ...(raw as object) }
    // Coerce the numeric surface; any non-finite value poisons the SVG
    // filter chain, so reject the payload outright.
    const numKeys = [
      'refraction',
      'height',
      'dispersion',
      'blur',
      'saturation',
      'cornerRadius',
      'highlight',
      'lightAngle',
      'tintOpacity',
      'elasticity',
    ] as const
    for (const k of numKeys) {
      const v = Number(merged[k])
      if (!Number.isFinite(v)) return null
      merged[k] = v
    }
    const boolKeys = ['depthEffect', 'overLight'] as const
    for (const k of boolKeys) {
      if (typeof merged[k] !== 'boolean') return null
    }
    if (typeof merged.tint !== 'string' || typeof merged.glow !== 'string') {
      return null
    }
    return merged
  } catch {
    return null
  }
}
