'use client'

/*
 * LiquidGlass — web port of Kyant0/AndroidLiquidGlass.
 *
 * Upstream: https://github.com/Kyant0/AndroidLiquidGlass (Apache-2.0)
 * The rounded-rect refraction / dispersion shader (AGSL) is re-expressed as:
 *   1. canvas-baked displacement maps (see lib/glass/displacement-map.ts)
 *      — `base` = refraction vector field, `quad` = quadrupolar spectral field
 *   2. an SVG filter chain reproducing the upstream 7-tap dispersion:
 *      feImage(base) -> feDisplacementMap (refraction)
 *      + per wavelength t ∈ {+1, +2/3, +1/3, 0, -1/3, -2/3, -1}:
 *          feDisplacementMap(quad, scale = 2·amount·k·t)  (spectral offset)
 *          feColorMatrix (upstream channel weights)
 *        accumulated with feComposite(arithmetic k2=k3=1)
 *      -> feGaussianBlur -> feColorMatrix(saturate)
 *      Upstream weights (Shaders.kt): R=(red+orange+yellow)/3.5 + purple/7,
 *      G=orange/7+(yellow+green+cyan)/3.5, B=(cyan+blue+purple)/3, A=all/7 —
 *      each channel's weights sum to exactly 1.
 *   3. a CSS fresnel rim highlight (Kyant0: HighlightStyle.Default, 45°)
 */

import {
  memo,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from 'react'
import { scaleColorAlpha, withAlpha } from '@/lib/glass/color'
import { renderDisplacementMaps } from '@/lib/glass/displacement-map'
import {
  brushedDataUri,
  bubbleDriftAmpPx,
  bubbleDriftPeriodSec,
  bubbleRisePeriodSec,
  bubblesDataUri,
  sparkleDataUri,
  sparkleTwinklePeriodSec,
} from '@/lib/glass/textures'
import type { GlassConfig } from '@/lib/glass/presets'

export interface LiquidGlassProps {
  config: GlassConfig
  children?: React.ReactNode
  className?: string
  style?: React.CSSProperties
  /** Render scale of the displacement map for crispness */
  mapScale?: number
  /** Disable refraction entirely (cheap mode) */
  disabled?: boolean
}

/** True when the browser supports SVG-filter references in backdrop-filter. */
function supportsSvgBackdrop(): boolean {
  if (typeof window === 'undefined') return false
  const ua = window.navigator.userAgent
  const isSafari = /^((?!chrome|android|crios|fxios).)*safari/i.test(ua)
  // Firefox parses url() in backdrop-filter but does not render SVG filter
  // references there (bugzilla #1738191) — CSS.supports only checks syntax,
  // so Firefox must be excluded explicitly to reach the blur fallback.
  const isFirefox = /firefox|fxios/i.test(ua)
  if (isSafari || isFirefox) return false
  return (
    typeof CSS !== 'undefined' &&
    (CSS.supports?.('backdrop-filter', 'url(#f) blur(1px)') ?? false)
  )
}

// ---------------------------------------------------------------------------
// Kyant0 7-tap spectral weights (RoundedRectRefractionWithDispersionShader):
//   red    +1  → R 1/3.5                     A 1/7
//   orange +2/3 → R 1/3.5, G 1/7              A 1/7
//   yellow +1/3 → R 1/3.5, G 1/3.5            A 1/7
//   green   0  →              G 1/3.5         A 1/7
//   cyan  -1/3 →              G 1/3.5, B 1/3 A 1/7
//   blue  -2/3 →                         B 1/3 A 1/7
//   purple -1  → R 1/7,              B 1/3    A 1/7
// Each column sums to 1, so the arithmetic accumulation needs no clamp.
// ---------------------------------------------------------------------------
const W_35 = 1 / 3.5
const W_3 = 1 / 3
const W_7 = 1 / 7

/** Row-major feColorMatrix values: keep only the weighted channels of a tap. */
function tapMatrix(wr: number, wg: number, wb: number): string {
  return [
    wr.toFixed(8), '0', '0', '0', '0',
    '0', wg.toFixed(8), '0', '0', '0',
    '0', '0', wb.toFixed(8), '0', '0',
    '0', '0', '0', W_7.toFixed(8), '0',
  ].join(' ')
}

const TAP_MATRIX_RED = tapMatrix(W_35, 0, 0)
const TAP_MATRIX_ORANGE = tapMatrix(W_35, W_7, 0)
const TAP_MATRIX_YELLOW = tapMatrix(W_35, W_35, 0)
const TAP_MATRIX_GREEN = tapMatrix(0, W_35, 0)
const TAP_MATRIX_CYAN = tapMatrix(0, W_35, W_3)
const TAP_MATRIX_BLUE = tapMatrix(0, 0, W_3)
const TAP_MATRIX_PURPLE = tapMatrix(W_7, 0, W_3)

/** The 7 spectral tap offsets, in the upstream order. */
const SPECTRAL_TAPS = [
  { key: 'Red', t: 1, matrix: TAP_MATRIX_RED },
  { key: 'Orange', t: 2 / 3, matrix: TAP_MATRIX_ORANGE },
  { key: 'Yellow', t: 1 / 3, matrix: TAP_MATRIX_YELLOW },
  { key: 'Green', t: 0, matrix: TAP_MATRIX_GREEN },
  { key: 'Cyan', t: -1 / 3, matrix: TAP_MATRIX_CYAN },
  { key: 'Blue', t: -2 / 3, matrix: TAP_MATRIX_BLUE },
  { key: 'Purple', t: -1, matrix: TAP_MATRIX_PURPLE },
] as const

function LiquidGlassImpl({
  config,
  children,
  className,
  style,
  mapScale = 2,
  disabled = false,
}: LiquidGlassProps) {
  const rawId = useId().replace(/[^a-zA-Z0-9]/g, '')
  const filterId = `lg-${rawId}`
  const mapId = `m-${rawId}`
  const quadId = `q-${rawId}`
  const satId = `st-${rawId}`
  const noiseId = `nz-${rawId}`

  const hostRef = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ w: 0, h: 0 })
  const [mapUrl, setMapUrl] = useState('')
  const [quadUrl, setQuadUrl] = useState('')
  const [svgOk, setSvgOk] = useState(true)

  useEffect(() => {
    const raf = requestAnimationFrame(() => setSvgOk(supportsSvgBackdrop()))
    return () => cancelAnimationFrame(raf)
  }, [])

  // Observe the element size so the displacement map always matches.
  useEffect(() => {
    // ResizeObserver fires once when observation starts, so the initial
    // measurement lands through the same async callback.
    const el = hostRef.current
    if (!el) return
    const update = () => {
      const rect = el.getBoundingClientRect()
      setSize(prev =>
        Math.abs(prev.w - rect.width) > 0.5 || Math.abs(prev.h - rect.height) > 0.5
          ? { w: rect.width, h: rect.height }
          : prev
      )
    }
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // Bake the Kyant0 displacement vector fields (rAF-debounced): the base
  // refraction map and the quadrupolar spectral map, in one loop pass.
  useEffect(() => {
    let raf = 0
    let cancelled = false
    const bake = () => {
      raf = 0
      if (size.w < 4 || size.h < 4 || disabled) {
        setMapUrl('')
        setQuadUrl('')
        return
      }
      const maps = renderDisplacementMaps({
        width: size.w,
        height: size.h,
        cornerRadius: config.cornerRadius,
        refractionHeight: config.height,
        refractionAmount: config.refraction,
        depthEffect: config.depthEffect,
        scale: mapScale,
      })
      if (!cancelled) {
        setMapUrl(maps.base)
        setQuadUrl(maps.quad)
      }
    }
    raf = requestAnimationFrame(bake)
    return () => {
      cancelled = true
      if (raf) cancelAnimationFrame(raf)
    }
  }, [
    size.w,
    size.h,
    config.cornerRadius,
    config.height,
    config.refraction,
    config.depthEffect,
    mapScale,
    disabled,
  ])

  // ---- Phase 13 M2: global motion tempo ----
  // Every animation period divides by it (1 = authored speed). Clamped
  // 0.25..2 to match the API/slider. Declared before the wobble block
  // (radiusStyle needs it for the jelly period).
  const motionSpeed = Math.max(0.25, Math.min(2, config.motionSpeed ?? 1))

  const radiusPx = useMemo(
    () =>
      config.cornerRadius >= 999
        ? 9999
        : Math.max(0, Math.min(config.cornerRadius, Math.min(size.w, size.h) / 2 || 0)),
    [config.cornerRadius, size.w, size.h]
  )

  // ---- Phase 14 M3: jelly wobble ----
  // Every layer reads the inherited custom properties off the host, so the
  // whole stack (backdrop, tint, textures, rim, content clip) morphs in
  // lockstep. Period divides by motionSpeed like every other animation.
  const wobble = Math.max(0, Math.min(1, config.wobble ?? 0))
  const wobbleAnimated = wobble > 0.01
  const wobblePeriod = ((5.5 - 3.5 * wobble) / motionSpeed).toFixed(1)
  // #106: the jelly morph composes with every per-layer animation channel
  // (border-radius vs opacity / background-position / custom properties),
  // so layers with their own motion append it as a comma-list entry instead
  // of letting a later `animation` key overwrite the radiusStyle injection.
  const jellyAnim = wobbleAnimated
    ? `glass-jelly ${wobblePeriod}s ease-in-out infinite`
    : ''
  const combo = (...anims: string[]) =>
    anims.filter(Boolean).join(', ') || undefined

  const radiusStyle = useCallback(
    (extra?: number): React.CSSProperties => ({
      borderRadius: config.cornerRadius >= 999 ? 9999 : `${Math.max(0, radiusPx - (extra ?? 0))}px`,
      // Keyframe values override the inline border-radius while animating
      // (animations beat normal declarations), so the morph applies cleanly.
      ...(wobbleAnimated
        ? { animation: `glass-jelly ${wobblePeriod}s ease-in-out infinite` }
        : {}),
    }),
    [config.cornerRadius, radiusPx, wobbleAnimated, wobblePeriod]
  )

  // ---------- SVG filter chain ----------
  const scale = Math.max(0.001, config.refraction * 2)
  // Spectral tap scale magnitude: scale · k reproduces the full-strength
  // quadrupolar spread of upstream's chromaticAberration=1 shader.
  const k = Math.max(0, Math.min(1, config.dispersion))
  const useDispersion = k > 0.01
  const spectralScale = Math.max(0.001, config.refraction * 2) * k
  const blurReady = mapUrl !== '' && size.w > 4
  const active = !disabled && svgOk && blurReady

  const backdropFilter = active
    ? `url(#${filterId})`
    : `blur(${Math.max(config.blur, 8)}px) saturate(${config.saturation}%)`

  const tintRgba = useMemo(() => withAlpha(config.tint, config.tintOpacity), [
    config.tint,
    config.tintOpacity,
  ])

  // Fresnel rim highlight — Kyant0 HighlightStyle.Default (plus-blend).
  // Phase 2: direction is user-controlled via `lightAngle`; overLight rotates
  // 90° to keep the rim readable against bright backdrops.
  // Phase 8: the rim color is user-controlled via `highlightColor` (mirrors
  // the colored DefaultHighlight shader shipped to the Android twin, PR #364).
  const highlight = Math.max(0, Math.min(1, config.highlight))
  const highlightColor =
    typeof config.highlightColor === 'string' && config.highlightColor.trim()
      ? config.highlightColor
      : '#ffffff'
  const ringPad = 1.5

  const overLight = config.overLight
  const lightAngleDeg =
    ((Math.round(Number.isFinite(config.lightAngle) ? config.lightAngle : 45) % 360) + 360) % 360
  const rimAngle = overLight ? (lightAngleDeg + 90) % 360 : lightAngleDeg

  // ---- Phase 5 layered effects ----
  const frost = Math.max(0, Math.min(1, config.frost ?? 0))
  const edgeBlur = Math.max(0, Math.min(1, config.edgeBlur ?? 0))
  const vignette = Math.max(0, Math.min(1, config.vignette ?? 0))
  // ---- Phase 9 M2: texture layers (intensity baked into the data-URIs) ----
  const brushed = Math.max(0, Math.min(1, config.brushed ?? 0))
  const bubbles = Math.max(0, Math.min(1, config.bubbles ?? 0))
  // Phase 10 M1/M2: parametric textures — direction, scale, count, motion.
  const brushedAngle = Math.max(0, Math.min(360, config.brushedAngle ?? 0))
  // Phase 11 M2: brushedFollow keeps the streaks perpendicular to the light
  // (metal highlights run across the grain of the light direction).
  const effectiveBrushedAngle = config.brushedFollow
    ? (lightAngleDeg + 90) % 360
    : brushedAngle
  const bubbleSize = Math.max(0.4, Math.min(2.2, config.bubbleSize ?? 1))
  const bubbleDensity = Math.max(0.3, Math.min(2.5, config.bubbleDensity ?? 1))
  const bubbleRise = Math.max(0, Math.min(1, config.bubbleRise ?? 0))
  // Phase 13 M1: horizontal drift (0 = off) — sway amplitude via the
  // registered --glass-drift-amp property consumed by the shared keyframes.
  const bubbleDrift = Math.max(0, Math.min(1, config.bubbleDrift ?? 0))
  // ---- Phase 9 M1: glow system ----
  // Multiplier semantics: final alpha = glow's own embedded alpha × glowOpacity.
  // Default 1 keeps every pre-Phase-9 preset visually identical.
  const glowOpacity = Math.max(0, Math.min(1, config.glowOpacity ?? 1))
  const glowSpread = Math.max(0, Math.min(60, config.glowSpread ?? 24))
  const glowColor =
    config.glow && config.glow !== 'transparent'
      ? scaleColorAlpha(config.glow, glowOpacity)
      : null
  // ---- Phase 11 M1: directional cast shadow ----
  // The rim gradient (linear-gradient θ, bright 0%) puts its bright edge
  // opposite the θ direction; the shadow therefore falls *along* θ:
  //   dx = sin(θ)·distance, dy = -cos(θ)·distance   (CSS y grows downward)
  // Shadow direction tracks lightAngle in real time — including when M2's
  // lightFollow rotates the light with the pointer.
  const shadowIntensity = Math.max(0, Math.min(1, config.shadowIntensity ?? 0))
  const shadowDistance = Math.max(0, Math.min(40, config.shadowDistance ?? 14))
  const shadowSoftness = Math.max(0, Math.min(60, config.shadowSoftness ?? 28))
  // Phase 12 M2: shadow tint — #0f172a reproduces the Phase 11 hardcoded
  // slate byte-for-byte (withAlpha emits the same rgba() string).
  const shadowColor =
    typeof config.shadowColor === 'string' && config.shadowColor.trim()
      ? config.shadowColor
      : '#0f172a'
  const shadowRad = (lightAngleDeg * Math.PI) / 180
  const shadowDx = Math.sin(shadowRad) * shadowDistance
  const shadowDy = -Math.cos(shadowRad) * shadowDistance
  const castShadow =
    shadowIntensity > 0.01
      ? `${shadowDx.toFixed(1)}px ${shadowDy.toFixed(1)}px ${shadowSoftness.toFixed(1)}px ${withAlpha(
          shadowColor,
          0.5 * shadowIntensity
        )}`
      : ''
  // ---- Phase 9 M3: motion system ----
  // Glow breathing: the shadow moves to a dedicated layer whose opacity
  // oscillates (animating the backdrop layer would fade the refraction).
  // Rim flow: the fresnel angle sweeps 360° via a registered <angle> var.
  // prefers-reduced-motion disables both through [data-glass-animated].
  const glowPulse = Math.max(0, Math.min(1, config.glowPulse ?? 0))
  const rimFlow = Math.max(0, Math.min(1, config.rimFlow ?? 0))
  // Phase 13 M2: periods divide by motionSpeed (tempo ×2 = half periods).
  const glowPulsePeriod = ((3.6 - 3.0 * glowPulse) / motionSpeed).toFixed(1)
  const rimFlowPeriod = ((6 - 4.5 * rimFlow) / motionSpeed).toFixed(1)
  const bubbleRisePeriod = Number(bubbleRisePeriodSec(bubbleRise)) / motionSpeed
  const bubbleDriftPeriod =
    Number(bubbleDriftPeriodSec(bubbleDrift, bubbleRise)) / motionSpeed
  const driftAmp = bubbleDriftAmpPx(bubbleDrift)
  // Phase 14 M2: sparkle twinkle — two layers on coprime-ish periods with a
  // half-phase delay on the second, so the constellations alternate.
  const sparkle = Math.max(0, Math.min(1, config.sparkle ?? 0))
  const sparkleSize = Math.max(0.5, Math.min(2, config.sparkleSize ?? 1))
  const sparkleTwinkle = Math.max(0, Math.min(1, config.sparkleTwinkle ?? 0))
  const sparkleAnimated = sparkle > 0.01 && sparkleTwinkle > 0.01
  const twinklePeriodA =
    Number(sparkleTwinklePeriodSec(sparkleTwinkle)) / motionSpeed
  const twinklePeriodB = twinklePeriodA * 1.618
  // Phase 14 M1: thin-film iridescence — a spectral conic sheen on the edge
  // band, anchored to the light (rotates with lightFollow in real time).
  const iridescence = Math.max(0, Math.min(1, config.iridescence ?? 0))
  const iridescenceWidth = Math.max(2, Math.min(12, config.iridescenceWidth ?? 5))
  const glowAnimated = glowPulse > 0.01 && !!glowColor
  const rimAnimated = rimFlow > 0.01
  // Frosted grain: feTurbulence -> white grain w/ noise-derived alpha.
  // Pure SVG-filter overlay, so unlike the refraction path it also works
  // on Safari/Firefox (no backdrop url() needed).
  const edgeBand = Math.round(6 + edgeBlur * 22)
  const edgeBlurPx = (edgeBlur * 26).toFixed(1)

  return (
    <div
      ref={hostRef}
      data-glass-jelly={wobbleAnimated ? '' : undefined}
      className={`relative ${className ?? ''}`}
      style={{
        ...style,
        // Phase 14 M3: jelly vars live on the host and inherit down to every
        // layer — one declaration, whole-stack morph in lockstep.
        ...(wobbleAnimated
          ? ({
              '--glass-jelly-r': `${radiusPx}px`,
              '--glass-jelly-amp': wobble.toFixed(3),
            } as React.CSSProperties)
          : {}),
      }}
    >
      {/* Filter defs — must stay mounted for backdrop-filter url() refs */}
      <svg
        aria-hidden
        focusable="false"
        width={0}
        height={0}
        style={{ position: 'absolute', pointerEvents: 'none' }}
      >
        <defs>
          {frost > 0.01 && (
            <filter id={noiseId} x="0" y="0" width="100%" height="100%">
              <feTurbulence
                type="fractalNoise"
                baseFrequency="0.82"
                numOctaves={2}
                stitchTiles="stitch"
                result="turb"
              />
              {/* White grain whose alpha follows the noise luminance. */}
              <feColorMatrix
                in="turb"
                type="matrix"
                values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0.34 0.34 0.34 0 0"
              />
            </filter>
          )}
          <filter
            id={filterId}
            x="0"
            y="0"
            width="100%"
            height="100%"
            colorInterpolationFilters="sRGB"
          >
            {blurReady && (
              <>
                <feImage
                  id={mapId}
                  href={mapUrl}
                  x={0}
                  y={0}
                  width={size.w}
                  height={size.h}
                  result="map"
                  preserveAspectRatio="none"
                />
                {useDispersion && (
                  <feImage
                    id={quadId}
                    href={quadUrl}
                    x={0}
                    y={0}
                    width={size.w}
                    height={size.h}
                    result="quad"
                    preserveAspectRatio="none"
                  />
                )}
              </>
            )}

            {active && !useDispersion && (
              <>
                <feDisplacementMap
                  in="SourceGraphic"
                  in2="map"
                  scale={scale}
                  xChannelSelector="R"
                  yChannelSelector="G"
                  result="disp"
                />
                <feGaussianBlur
                  in="disp"
                  stdDeviation={config.blur}
                  result="soft"
                />
                <feColorMatrix
                  id={satId}
                  in="soft"
                  type="saturate"
                  values={`${config.saturation / 100}`}
                />
              </>
            )}

            {active && useDispersion && (
              <>
                {/*
                  Kyant0 7-tap spectral dispersion:
                  base refraction once, then each wavelength samples the
                    result offset along the quadrupolar field by t·k, and
                    contributes its channel weights; arithmetic adds the
                    taps (each channel's weights sum to 1).
                */}
                <feDisplacementMap
                  in="SourceGraphic"
                  in2="map"
                  scale={scale}
                  xChannelSelector="R"
                  yChannelSelector="G"
                  result="base"
                />
                {/* The green tap (t=0) needs no spectral offset — its color
                    matrix reads the shared base refraction directly. */}
                {SPECTRAL_TAPS.map(tap =>
                  tap.t === 0 ? null : (
                    <feDisplacementMap
                      key={tap.key}
                      in="base"
                      in2="quad"
                      scale={spectralScale * tap.t}
                      xChannelSelector="R"
                      yChannelSelector="G"
                      result={`d${tap.key}`}
                    />
                  )
                )}
                {SPECTRAL_TAPS.map(tap => (
                  <feColorMatrix
                    key={tap.key}
                    in={tap.t === 0 ? 'base' : `d${tap.key}`}
                    type="matrix"
                    values={tap.matrix}
                    result={`w${tap.key}`}
                  />
                ))}
                {SPECTRAL_TAPS.map((tap, ti) =>
                  ti === 0 ? null : (
                    <feComposite
                      key={tap.key}
                      in={ti === 1 ? 'wRed' : `acc${ti - 1}`}
                      in2={`w${tap.key}`}
                      operator="arithmetic"
                      k1={0}
                      k2={1}
                      k3={1}
                      k4={0}
                      result={`acc${ti}`}
                    />
                  )
                )}
                <feGaussianBlur
                  in="acc6"
                  stdDeviation={config.blur}
                  result="soft"
                />
                <feColorMatrix
                  id={satId}
                  in="soft"
                  type="saturate"
                  values={`${config.saturation / 100}`}
                />
              </>
            )}
          </filter>
        </defs>
      </svg>

      {/* Refracting backdrop */}
      <div
        aria-hidden
        className="absolute inset-0"
        style={{
          ...radiusStyle(),
          backdropFilter,
          WebkitBackdropFilter: `blur(${Math.max(config.blur, 8)}px) saturate(${config.saturation}%)`,
          willChange: 'backdrop-filter',
          // Outer glow via box-shadow (a host-level `filter` would turn the
          // host into a backdrop root and break the refraction sampling).
          // Phase 9: radius/spread and intensity are independent params; with
          // glowPulse on, the shadow moves to its own breathing layer below.
          // Phase 11: directional cast shadow stacks behind the glow — the
          // shadow tracks lightAngle (opposite the fresnel bright edge).
          boxShadow: !glowAnimated && (glowColor || castShadow)
            ? [
                castShadow || undefined,
                glowColor
                  ? `0 0 ${glowSpread}px ${(glowSpread / 12).toFixed(1)}px ${glowColor}`
                  : undefined,
              ]
                .filter(Boolean)
                .join(', ')
            : undefined,
        }}
      />

      {/* Phase 9 M3: breathing glow — dedicated shadow-only layer whose
          opacity oscillates; box-shadow follows the synced border-radius.
          Phase 11: the static cast shadow stays on the backdrop layer above
          (it must not breathe with the glow). */}
      {glowAnimated && (
        <div
          aria-hidden
          data-glass-animated=""
          className="pointer-events-none absolute inset-0"
          style={{
            ...radiusStyle(),
            boxShadow: `0 0 ${glowSpread}px ${(glowSpread / 12).toFixed(1)}px ${glowColor}`,
            // #106: glow breathing (opacity) + jelly morph (border-radius)
            // compose as a comma list — the breathing layer follows the blob.
            animation: combo(
              jellyAnim,
              `glass-glow-pulse ${glowPulsePeriod}s ease-in-out infinite alternate`
            ),
          }}
        />
      )}

      {/* Phase 11 M1: cast-shadow fallback — when glow breathing owns the
          animated layer, the directional shadow still needs a home. */}
      {glowAnimated && castShadow && (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            ...radiusStyle(),
            boxShadow: castShadow,
          }}
        />
      )}

      {/* Tint */}
      {config.tintOpacity > 0 && (
        <div
          aria-hidden
          className="absolute inset-0"
          style={{
            ...radiusStyle(),
            background: overLight
              ? `rgba(15, 18, 25, ${Math.max(0.35, config.tintOpacity)})`
              : tintRgba,
          }}
        />
      )}

      {/* Phase 5: vignette — radial corner darkening */}
      {vignette > 0.01 && (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            ...radiusStyle(),
            background: `radial-gradient(ellipse at center, transparent 52%, rgba(0,0,0,${(
              0.55 * vignette
            ).toFixed(3)}) 100%)`,
          }}
        />
      )}

      {/* Phase 5: progressive gaussian edge blur — a backdrop-blur ring
          masked to the outer band (layered blur, center stays crisp). */}
      {edgeBlur > 0.01 && (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            ...radiusStyle(),
            padding: edgeBand,
            backdropFilter: `blur(${edgeBlurPx}px)`,
            WebkitBackdropFilter: `blur(${edgeBlurPx}px)`,
            WebkitMask:
              'linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)',
            WebkitMaskComposite: 'xor',
            mask: 'linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)',
            maskComposite: 'exclude',
          }}
        />
      )}

      {/* Phase 5: frosted grain overlay */}
      {frost > 0.01 && (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            ...radiusStyle(),
            filter: `url(#${noiseId})`,
            opacity: (frost * 0.5).toFixed(3),
          }}
        />
      )}

      {/* Phase 9 M2: brushed-metal streaks — anisotropic feTurbulence
          data-URI tiling (zero-JS, Safari/Firefox-safe, export-identical).
          Phase 10 M1: brushedAngle rotates the tiling grid in-pattern.
          Phase 11 M2: brushedFollow derives the angle from the light. */}
      {brushed > 0.01 && (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            ...radiusStyle(),
            backgroundImage: `url("${brushedDataUri(brushed * 0.4, effectiveBrushedAngle)}")`,
            backgroundSize: '240px 240px',
          }}
        />
      )}

      {/* Phase 9 M2: gas bubbles — radial-gradient spheres, seamless tile.
          Phase 10 M2: size/density scale the tile; bubbleRise loops the
          seamless 200px tile upward via a background-position animation
          (reduced-motion disables it through [data-glass-animated]).
          Phase 13 M1: bubbleDrift adds a sine-like horizontal sway — with
          rise it traces a spiral, alone the tile sways in place. The two
          animations compose on one element (rise owns background-position-y
          through the shorthand, drift owns -x through the longhand). */}
      {bubbles > 0.01 && (
        <div
          aria-hidden
          data-glass-animated={bubbleRise > 0.01 || bubbleDrift > 0.01 ? '' : undefined}
          className="pointer-events-none absolute inset-0"
          style={{
            ...radiusStyle(),
            backgroundImage: `url("${bubblesDataUri(bubbles * 0.55, bubbleSize, bubbleDensity)}")`,
            backgroundSize: '200px 200px',
            ...(bubbleDrift > 0.01
              ? ({ '--glass-drift-amp': `${driftAmp}px` } as React.CSSProperties)
              : {}),
            animation:
              bubbleRise > 0.01 || bubbleDrift > 0.01 || wobbleAnimated
                ? [
                    jellyAnim,
                    bubbleRise > 0.01
                      ? `glass-bubble-rise ${bubbleRisePeriod.toFixed(1)}s linear infinite`
                      : '',
                    bubbleDrift > 0.01
                      ? `glass-bubble-drift ${bubbleDriftPeriod.toFixed(1)}s ease-in-out infinite alternate`
                      : '',
                  ]
                    .filter(Boolean)
                    .join(', ') || undefined
                : undefined,
          }}
        />
      )}

      {/* Phase 14 M2: sparkle glints — two seed constellations twinkling
          on independent clocks (a half-phase delay keeps them alternating).
          Twinkle is engine-only: the CSS export bakes both layers statically
          (per-layer opacity cannot animate on a shared background stack). */}
      {sparkle > 0.01 &&
        ([11, 47] as const).map((seed, i) => (
          <div
            key={seed}
            aria-hidden
            data-glass-animated={sparkleAnimated ? '' : undefined}
            className="pointer-events-none absolute inset-0"
            style={{
              ...radiusStyle(),
              backgroundImage: `url("${sparkleDataUri(sparkle * 0.9, sparkleSize, seed)}")`,
              backgroundSize: '220px 220px',
              ...(sparkleAnimated
                ? {
                    animation: combo(
                      jellyAnim,
                      `glass-sparkle ${(
                        i === 0 ? twinklePeriodA : twinklePeriodB
                      ).toFixed(1)}s ease-in-out infinite alternate`
                    ),
                    // The delay list maps per-animation: jelly parks at 0s,
                    // seed B's twinkle keeps its half-phase offset (#106).
                    animationDelay:
                      i === 1
                        ? wobbleAnimated
                          ? `0s, -${(twinklePeriodB / 2).toFixed(1)}s`
                          : `-${(twinklePeriodB / 2).toFixed(1)}s`
                        : undefined,
                  }
                : {}),
            }}
          />
        ))}

      {/* Phase 14 M1: thin-film iridescence — a spectral conic sheen masked
          to the edge band, anchored to the light angle (rotates live with
          lightFollow). A hair of blur softens the band edges. */}
      {iridescence > 0.01 && (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            ...radiusStyle(),
            padding: iridescenceWidth,
            filter: 'blur(0.5px)',
            background: `conic-gradient(from ${lightAngleDeg}deg,
              rgba(255, 130, 130, ${(0.5 * iridescence).toFixed(3)}) 0deg,
              rgba(255, 200, 100, ${(0.55 * iridescence).toFixed(3)}) 45deg,
              rgba(255, 240, 140, ${(0.5 * iridescence).toFixed(3)}) 90deg,
              rgba(150, 240, 150, ${(0.55 * iridescence).toFixed(3)}) 135deg,
              rgba(120, 225, 255, ${(0.6 * iridescence).toFixed(3)}) 180deg,
              rgba(150, 165, 255, ${(0.55 * iridescence).toFixed(3)}) 225deg,
              rgba(220, 145, 255, ${(0.5 * iridescence).toFixed(3)}) 270deg,
              rgba(255, 130, 200, ${(0.45 * iridescence).toFixed(3)}) 315deg,
              rgba(255, 130, 130, ${(0.5 * iridescence).toFixed(3)}) 360deg)`,
            WebkitMask:
              'linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)',
            WebkitMaskComposite: 'xor',
            mask: 'linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)',
            maskComposite: 'exclude',
          }}
        />
      )}

      {/* Fresnel rim highlight (gradient ring via mask composite).
          Phase 9 M3: rimFlow sweeps the gradient angle through a registered
          <angle> custom property — smooth in modern browsers, static elsewhere. */}
      {highlight > 0.01 && (
        <div
          aria-hidden
          data-glass-animated={rimAnimated ? '' : undefined}
          className="pointer-events-none absolute inset-0"
          style={{
            ...radiusStyle(),
            padding: ringPad,
            ...(rimAnimated
              ? ({
                  '--glass-rim-start': `${rimAngle}deg`,
                  '--glass-rim-angle': `${rimAngle}deg`,
                  // #106: rim flow (<angle> var) + jelly morph (border-radius)
                  // compose as a comma list.
                  animation: combo(
                    jellyAnim,
                    `glass-rim-flow ${rimFlowPeriod}s linear infinite`
                  ),
                } as React.CSSProperties)
              : {}),
            background: `linear-gradient(${
              rimAnimated ? 'var(--glass-rim-angle)' : `${rimAngle}deg`
            },
              ${withAlpha(highlightColor, 0.75 * highlight)} 0%,
              ${withAlpha(highlightColor, 0.18 * highlight)} 28%,
              ${withAlpha(highlightColor, 0.02 * highlight)} 50%,
              ${withAlpha(highlightColor, 0.1 * highlight)} 72%,
              ${withAlpha(highlightColor, 0.45 * highlight)} 100%)`,
            WebkitMask:
              'linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)',
            WebkitMaskComposite: 'xor',
            mask: 'linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)',
            maskComposite: 'exclude',
            // NOTE: no mix-blend-mode here — a blended sibling would make the
            // host an isolated backdrop root and blank out the refraction.
          }}
        />
      )}

      {/* Inner soft shadow for depth (overLight mode) */}
      {overLight && (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            ...radiusStyle(),
            boxShadow:
              'inset 0 1px 0 rgba(255,255,255,0.28), inset 0 -1px 0 rgba(0,0,0,0.35), 0 18px 40px rgba(0,0,0,0.35)',
          }}
        />
      )}

      {/* Content — normal flow so the host gains intrinsic height */}
      <div
        className="relative overflow-hidden"
        style={radiusStyle()}
      >
        {children}
      </div>
    </div>
  )
}

export const LiquidGlass = memo(LiquidGlassImpl)
