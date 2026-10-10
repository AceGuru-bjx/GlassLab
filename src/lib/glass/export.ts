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

import { scaleColorAlpha, withAlpha } from './color'
import { brushedDataUri, bubbleRisePeriodSec, bubblesDataUri } from './textures'
import { DEFAULT_CONFIG, type GlassConfig } from './presets'

function radiusPx(cornerRadius: number): string {
  return cornerRadius >= 999 ? '9999px' : `${cornerRadius}px`
}

/** CSS body shared by the CSS and React exports. */
function cssBody(config: GlassConfig): string {
  const hl = Math.max(0, Math.min(1, config.highlight))
  const hlColor =
    typeof config.highlightColor === 'string' && config.highlightColor.trim()
      ? config.highlightColor
      : '#ffffff'
  const frost = Math.max(0, Math.min(1, config.frost ?? 0))
  const vignette = Math.max(0, Math.min(1, config.vignette ?? 0))
  const edgeBlur = Math.max(0, Math.min(1, config.edgeBlur ?? 0))
  const glowOpacity = Math.max(0, Math.min(1, config.glowOpacity ?? 1))
  const glowSpread = Math.max(0, Math.min(60, config.glowSpread ?? 24))
  const glow =
    config.glow && config.glow !== 'transparent'
      ? `,\n  0 0 ${glowSpread}px ${(glowSpread / 12).toFixed(1)}px ${scaleColorAlpha(config.glow, glowOpacity)}`
      : ''
  const tintBg =
    config.tintOpacity > 0
      ? `\n  /* 染色 ${Math.round(config.tintOpacity * 100)}% */\n  background-color: ${withAlpha(config.tint, config.tintOpacity)};`
      : ''
  const vignetteShadow =
    vignette > 0.01
      ? `, inset 0 0 48px rgba(0, 0, 0, ${((0.55 * vignette) || 0).toFixed(3)})`
      : ''
  // Phase 9: frost noise moves to the ROOT element as a background-image
  // layer — the ::after pseudo-element is now reserved for the edge-blur
  // ring. The grain intensity is baked into the SVG's feColorMatrix alpha
  // row (the root cannot take ::after's `opacity` without dimming content).
  const frostGrain = frost > 0.01 ? (0.34 * frost * 0.5).toFixed(4) : '0'
  // Phase 9 M2: texture layers stack as additional background-images on the
  // root element, intensity baked into each data-URI (engine-identical).
  const brushed = Math.max(0, Math.min(1, config.brushed ?? 0))
  const bubbles = Math.max(0, Math.min(1, config.bubbles ?? 0))
  // Phase 10 M1/M2: parametric textures (direction / scale / count / rise).
  const brushedAngle = Math.max(0, Math.min(360, config.brushedAngle ?? 0))
  // Light angle, normalized (0 = to top, clockwise).
  const rimAngleDeg = ((Math.round(Number.isFinite(config.lightAngle) ? config.lightAngle : 45) % 360) + 360) % 360
  // ---- Phase 11 M1: directional cast shadow (exported as a static bake of
  // the current lightAngle; the live light-follow rotation is interactive
  // and cannot be expressed in pure CSS). Shadow falls along the light
  // direction: dx = sin(θ)·d, dy = -cos(θ)·d (CSS y grows downward). ----
  const shadowIntensity = Math.max(0, Math.min(1, config.shadowIntensity ?? 0))
  const shadowDistance = Math.max(0, Math.min(40, config.shadowDistance ?? 14))
  const shadowSoftness = Math.max(0, Math.min(60, config.shadowSoftness ?? 28))
  // Phase 12 M2: shadow tint — #0f172a keeps legacy exports byte-identical
  // (withAlpha over a 6-digit hex emits the exact `rgba(15, 23, 42, a)`).
  const shadowColor =
    typeof config.shadowColor === 'string' && config.shadowColor.trim()
      ? config.shadowColor
      : '#0f172a'
  const castShadow =
    shadowIntensity > 0.01
      ? `,\n  /* 方向性投影（光源 ${rimAngleDeg}°对侧） */\n  ${(Math.sin((rimAngleDeg * Math.PI) / 180) * shadowDistance).toFixed(1)}px ${(-Math.cos((rimAngleDeg * Math.PI) / 180) * shadowDistance).toFixed(1)}px ${shadowSoftness.toFixed(1)}px ${withAlpha(
          shadowColor,
          0.5 * shadowIntensity
        )}`
      : ''
  // Phase 11 M2: brushedFollow bakes the effective angle (light + 90°) —
  // CSS exports are static, the live link is a lab-only interactive state.
  const effectiveBrushedAngle = config.brushedFollow
    ? (((rimAngleDeg + 90) % 360) + 360) % 360
    : brushedAngle
  const bubbleSize = Math.max(0.4, Math.min(2.2, config.bubbleSize ?? 1))
  const bubbleDensity = Math.max(0.3, Math.min(2.5, config.bubbleDensity ?? 1))
  const bubbleRise = Math.max(0, Math.min(1, config.bubbleRise ?? 0))
  const bgImages: string[] = []
  const bgSizes: string[] = []
  if (frost > 0.01) {
    bgImages.push(`url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='180' height='180'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.82' numOctaves='2' stitchTiles='stitch'/%3E%3CfeColorMatrix values='0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 ${frostGrain} ${frostGrain} ${frostGrain} 0 0'/%3E%3C/filter%3E%3Crect width='180' height='180' filter='url(%23n)'/%3E%3C/svg%3E")`)
    bgSizes.push('180px 180px')
  }
  if (brushed > 0.01) {
    bgImages.push(`url("${brushedDataUri(brushed * 0.4, effectiveBrushedAngle)}")`)
    bgSizes.push('240px 240px')
  }
  if (bubbles > 0.01) {
    bgImages.push(`url("${bubblesDataUri(bubbles * 0.55, bubbleSize, bubbleDensity)}")`)
    bgSizes.push('200px 200px')
  }
  const frostBg =
    bgImages.length > 0
      ? `\n  /* 叠层纹理（SVG data-URI，零 JS） */\n  background-image: ${bgImages.join(', ')};\n  background-size: ${bgSizes.join(', ')};`
      : ''
  // Phase 9 (closing the Phase 5 legacy gap): edge-blur ring — a masked
  // backdrop-blur band over the outer edge, center stays crisp. Pure CSS.
  const edgeBand = Math.round(6 + edgeBlur * 22)
  const edgeBlurPx = (edgeBlur * 26).toFixed(1)
  const edgeLayer =
    edgeBlur > 0.01
      ? `\n\n/* 边缘高斯弥散 ${Math.round(edgeBlur * 100)}% — 边缘环 backdrop-blur，中心保持清晰 */\n.liquid-glass::after {\n  content: "";\n  position: absolute;\n  inset: 0;\n  border-radius: inherit;\n  padding: ${edgeBand}px;\n  pointer-events: none;\n  -webkit-backdrop-filter: blur(${edgeBlurPx}px);\n  backdrop-filter: blur(${edgeBlurPx}px);\n  -webkit-mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);\n  -webkit-mask-composite: xor;\n  mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);\n  mask-composite: exclude;\n}`
      : ''

  // ---- Phase 9 M3: motion export ----
  const glowPulse = Math.max(0, Math.min(1, config.glowPulse ?? 0))
  const rimFlow = Math.max(0, Math.min(1, config.rimFlow ?? 0))
  const glowPulsePeriod = (3.6 - 3.0 * glowPulse).toFixed(1)
  const rimFlowPeriod = (6 - 4.5 * rimFlow).toFixed(1)
  const hasGlow = !!(config.glow && config.glow !== 'transparent')
  // Glow breathing animates the root's full box-shadow stack (only the glow
  // alpha differs between the two keyframes) — box-shadow interpolates.
  // Phase 10 M2: bubble rise lives on the same root element (the bubble
  // tile is the last background-image layer), so both rules merge into a
  // single comma-separated animation list.
  const riseAnimated = bubbleRise > 0.01 && bubbles > 0.01
  const rootAnimations: string[] = []
  if (glowPulse > 0.01 && hasGlow) {
    rootAnimations.push(
      `glass-glow-pulse ${glowPulsePeriod}s ease-in-out infinite alternate`
    )
  }
  if (riseAnimated) {
    rootAnimations.push(
      `glass-bubble-rise ${bubbleRisePeriodSec(bubbleRise)}s linear infinite`
    )
  }
  const glowAnimationRule =
    rootAnimations.length > 0 ? `\n  animation: ${rootAnimations.join(', ')};` : ''
  const glowPulseKeyframes =
    glowPulse > 0.01 && hasGlow
      ? `\n\n/* 辉光呼吸（周期 ${glowPulsePeriod}s）— 两态均携带完整投影栈（含方向性投影） */\n@keyframes glass-glow-pulse {\n  from { box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.28),\n    inset 0 -1px 0 rgba(0, 0, 0, 0.12), 0 8px 32px rgba(0, 0, 0, 0.12)${vignetteShadow}${castShadow},\n  0 0 ${glowSpread}px ${(glowSpread / 12).toFixed(1)}px ${scaleColorAlpha(config.glow, glowOpacity)}; }\n  to { box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.28),\n    inset 0 -1px 0 rgba(0, 0, 0, 0.12), 0 8px 32px rgba(0, 0, 0, 0.12)${vignetteShadow}${castShadow},\n  0 0 ${glowSpread}px ${(glowSpread / 12).toFixed(1)}px ${scaleColorAlpha(config.glow, glowOpacity * 0.45)}; }\n}`
      : ''
  const rimFlowRule =
    rimFlow > 0.01
      ? `\n  --glass-rim-start: ${rimAngleDeg}deg;\n  --glass-rim-angle: ${rimAngleDeg}deg;\n  animation: glass-rim-flow ${rimFlowPeriod}s linear infinite;`
      : ''
  const rimGradientAngle = rimFlow > 0.01 ? 'var(--glass-rim-angle)' : `${config.lightAngle}deg`
  const rimFlowKeyframes =
    rimFlow > 0.01
      ? `\n\n/* 高光流动（周期 ${rimFlowPeriod}s）— @property 注册 <angle> 平滑插值 */\n@property --glass-rim-angle {\n  syntax: "<angle>";\n  initial-value: 0deg;\n  inherits: false;\n}\n@keyframes glass-rim-flow {\n  from { --glass-rim-angle: var(--glass-rim-start); }\n  to { --glass-rim-angle: calc(var(--glass-rim-start) + 360deg); }\n}`
      : ''
  // Bubble rise: the seamless 200px tile shifts up by exactly one tile.
  // background-position must list every background-image layer — bubbles is
  // always the last one pushed onto the stack, the others hold still.
  const bubbleRiseKeyframes = riseAnimated
    ? `\n\n/* 气泡上升（周期 ${bubbleRisePeriodSec(bubbleRise)}s）— 无缝 200px 贴图循环上移 */\n@keyframes glass-bubble-rise {\n  from { background-position: ${bgImages
        .map(() => '0 0')
        .join(', ')}; }\n  to { background-position: ${bgImages
        .map((_, i) => (i === bgImages.length - 1 ? '0 -200px' : '0 0'))
        .join(', ')}; }\n}`
    : ''
  const motionGuard =
    glowPulse > 0.01 || rimFlow > 0.01 || riseAnimated
      ? `\n\n@media (prefers-reduced-motion: reduce) {\n  .liquid-glass, .liquid-glass::before { animation: none !important; }\n}`
      : ''

  return `/* 生成自 GlassLab 玻璃实验室 — https://github.com/AceGuru-bjx/GlassLab
 * 说明：blur/saturate/染色/磨砂噪点/暗角/边缘高斯弥散/辉光为纯 CSS；
 * 完整的边缘位移折射（Kyant0 算法）由 JS 引擎驱动，见上方仓库。 */
.liquid-glass {
  position: relative;
  border-radius: ${radiusPx(config.cornerRadius)};
  -webkit-backdrop-filter: blur(${config.blur}px) saturate(${config.saturation}%);
  backdrop-filter: blur(${config.blur}px) saturate(${config.saturation}%);${tintBg}${frostBg}
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.28),
    inset 0 -1px 0 rgba(0, 0, 0, 0.12), 0 8px 32px rgba(0, 0, 0, 0.12)${vignetteShadow}${castShadow}${glow};${glowAnimationRule}
}

/* 菲涅尔边缘高光 ${Math.round(hl * 100)}% @ ${config.lightAngle}° */
.liquid-glass::before {
  content: "";
  position: absolute;
  inset: 0;
  border-radius: inherit;
  padding: 1.5px;
  pointer-events: none;
  background: linear-gradient(${rimGradientAngle},
    ${withAlpha(hlColor, 0.75 * hl)} 0%,
    ${withAlpha(hlColor, 0.18 * hl)} 28%,
    ${withAlpha(hlColor, 0.02 * hl)} 50%,
    ${withAlpha(hlColor, 0.1 * hl)} 72%,
    ${withAlpha(hlColor, 0.45 * hl)} 100%);${rimFlowRule}
  -webkit-mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
  -webkit-mask-composite: xor;
  mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
  mask-composite: exclude;
}${edgeLayer}${glowPulseKeyframes}${rimFlowKeyframes}${bubbleRiseKeyframes}${motionGuard}`
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

// JSON.stringify keeps the CSS a single escaped string literal — tint/glow
// from share payloads can contain backticks or \${...} which would corrupt
// a bare template literal (#54).
const css = ${JSON.stringify(css)}

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

/** Extract the `#g=` payload from a URL hash, if present.
 *
 * Accepts both the canonical unpadded base64url this app emits and padded
 * standard base64 (`=` tail, up to 2 chars) that third-party tools (btoa
 * with a JSON length not divisible by 3) produce — `=` is legal inside a
 * URL fragment and `fromBase64Url`→`atob` handles padding natively, so the
 * only thing that can reject such links is this regex (issue #96). */
export function hashPayload(hash: string): string | null {
  const m = hash.match(/^#g=([A-Za-z0-9_-]+={0,2})$/)
  return m ? m[1] : null
}

/**
 * Validate an unknown parsed-JSON value as a GlassConfig.
 * Merges over DEFAULT_CONFIG (forward-compatible), coerces numbers and
 * validates types; returns null for anything malformed. Shared by the share-
 * link decoder (decodeConfig) and the .glass.json file import (Phase 6 M3).
 */
export function validateConfigObject(raw: unknown): GlassConfig | null {
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
    'frost',
    'brushed',
    'brushedAngle',
    'bubbles',
    'bubbleSize',
    'bubbleDensity',
    'bubbleRise',
    'shadowIntensity',
    'shadowDistance',
    'shadowSoftness',
    'lightSmoothing',
    'edgeBlur',
    'vignette',
    'glowOpacity',
    'glowSpread',
    'glowPulse',
    'rimFlow',
  ] as const
  for (const k of numKeys) {
    const v = Number(merged[k])
    if (!Number.isFinite(v)) return null
    merged[k] = v
  }
  const boolKeys = ['depthEffect', 'overLight', 'lightFollow', 'brushedFollow'] as const
  for (const k of boolKeys) {
    if (typeof merged[k] !== 'boolean') return null
  }
  if (
    typeof merged.tint !== 'string' ||
    typeof merged.glow !== 'string' ||
    typeof merged.highlightColor !== 'string' ||
    typeof merged.shadowColor !== 'string'
  ) {
    return null
  }
  return merged
}

/**
 * Decode a share payload back into a GlassConfig.
 * Merges over DEFAULT_CONFIG (forward-compatible), coerces numbers and
 * validates types; returns null for anything malformed — bad links must
 * never crash the lab.
 */
export function decodeConfig(payload: string): GlassConfig | null {
  try {
    return validateConfigObject(JSON.parse(fromBase64Url(payload)))
  } catch {
    return null
  }
}
