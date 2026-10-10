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

  const radiusPx = useMemo(
    () =>
      config.cornerRadius >= 999
        ? 9999
        : Math.max(0, Math.min(config.cornerRadius, Math.min(size.w, size.h) / 2 || 0)),
    [config.cornerRadius, size.w, size.h]
  )

  const radiusStyle = useCallback(
    (extra?: number): React.CSSProperties => ({
      borderRadius: config.cornerRadius >= 999 ? 9999 : `${Math.max(0, radiusPx - (extra ?? 0))}px`,
    }),
    [config.cornerRadius, radiusPx]
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
  // ---- Phase 9 M1: glow system ----
  // Multiplier semantics: final alpha = glow's own embedded alpha × glowOpacity.
  // Default 1 keeps every pre-Phase-9 preset visually identical.
  const glowOpacity = Math.max(0, Math.min(1, config.glowOpacity ?? 1))
  const glowSpread = Math.max(0, Math.min(60, config.glowSpread ?? 24))
  const glowColor =
    config.glow && config.glow !== 'transparent'
      ? scaleColorAlpha(config.glow, glowOpacity)
      : null
  // Frosted grain: feTurbulence -> white grain w/ noise-derived alpha.
  // Pure SVG-filter overlay, so unlike the refraction path it also works
  // on Safari/Firefox (no backdrop url() needed).
  const edgeBand = Math.round(6 + edgeBlur * 22)
  const edgeBlurPx = (edgeBlur * 26).toFixed(1)

  return (
    <div
      ref={hostRef}
      className={`relative ${className ?? ''}`}
      style={style}
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
          // Phase 9: radius/spread and intensity are independent params.
          boxShadow: glowColor
            ? `0 0 ${glowSpread}px ${(glowSpread / 12).toFixed(1)}px ${glowColor}`
            : undefined,
        }}
      />

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

      {/* Fresnel rim highlight (gradient ring via mask composite) */}
      {highlight > 0.01 && (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            ...radiusStyle(),
            padding: ringPad,
            background: `linear-gradient(${rimAngle}deg,
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
