'use client'

/*
 * LiquidGlass — web port of Kyant0/AndroidLiquidGlass.
 *
 * Upstream: https://github.com/Kyant0/AndroidLiquidGlass (Apache-2.0)
 * The rounded-rect refraction / dispersion shader (AGSL) is re-expressed as:
 *   1. a canvas-baked displacement map (see lib/glass/displacement-map.ts)
 *   2. an SVG filter chain: feImage -> feDisplacementMap (x3 spectral taps)
 *      -> feGaussianBlur -> feColorMatrix(saturate)
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
import { renderDisplacementMap } from '@/lib/glass/displacement-map'
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
  const blurId = `b-${rawId}`
  const mapId = `m-${rawId}`
  const dispRId = `dr-${rawId}`
  const dispGId = `dg-${rawId}`
  const dispBId = `db-${rawId}`
  const cRId = `cr-${rawId}`
  const cGId = `cg-${rawId}`
  const cBId = `cb-${rawId}`
  const rgId = `rg-${rawId}`
  const satId = `st-${rawId}`

  const hostRef = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ w: 0, h: 0 })
  const [mapUrl, setMapUrl] = useState('')
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

  // Bake the Kyant0 displacement vector field (rAF-debounced).
  useEffect(() => {
    let raf = 0
    let cancelled = false
    const bake = () => {
      raf = 0
      if (size.w < 4 || size.h < 4 || disabled) {
        setMapUrl('')
        return
      }
      const url = renderDisplacementMap({
        width: size.w,
        height: size.h,
        cornerRadius: config.cornerRadius,
        refractionHeight: config.height,
        refractionAmount: config.refraction,
        depthEffect: config.depthEffect,
        scale: mapScale,
      })
      if (!cancelled) setMapUrl(url)
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
  const k = Math.max(0, Math.min(1, config.dispersion))
  const useDispersion = k > 0.01
  const blurReady = mapUrl !== '' && size.w > 4
  const active = !disabled && svgOk && blurReady

  const backdropFilter = active
    ? `url(#${filterId})`
    : `blur(${Math.max(config.blur, 8)}px) saturate(${config.saturation}%)`

  const tintRgba = useMemo(() => hexToRgba(config.tint, config.tintOpacity), [
    config.tint,
    config.tintOpacity,
  ])

  // Fresnel rim highlight — Kyant0 HighlightStyle.Default (plus-blend).
  // Phase 2: direction is user-controlled via `lightAngle`; overLight rotates
  // 90° to keep the rim readable against bright backdrops.
  const highlight = Math.max(0, Math.min(1, config.highlight))
  const ringPad = 1.5

  const overLight = config.overLight
  const lightAngleDeg =
    ((Math.round(Number.isFinite(config.lightAngle) ? config.lightAngle : 45) % 360) + 360) % 360
  const rimAngle = overLight ? (lightAngleDeg + 90) % 360 : lightAngleDeg

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
          <filter
            id={filterId}
            x="0"
            y="0"
            width="100%"
            height="100%"
            colorInterpolationFilters="sRGB"
          >
            {blurReady && (
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
            )}

            {active && !useDispersion && (
              <>
                <feDisplacementMap
                  id={dispGId}
                  in="SourceGraphic"
                  in2="map"
                  scale={scale}
                  xChannelSelector="R"
                  yChannelSelector="G"
                  result="disp"
                />
                <feGaussianBlur
                  id={blurId}
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
                {/* Spectral approximation of Kyant0's 7-tap dispersion:
                    R pulled towards +d, B towards -d, G centered. */}
                <feDisplacementMap
                  id={dispRId}
                  in="SourceGraphic"
                  in2="map"
                  scale={scale * (1 + k * 0.5)}
                  xChannelSelector="R"
                  yChannelSelector="G"
                  result="dispR"
                />
                <feColorMatrix
                  id={cRId}
                  in="dispR"
                  type="matrix"
                  values="1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 0 1"
                  result="cR"
                />
                <feDisplacementMap
                  id={dispGId}
                  in="SourceGraphic"
                  in2="map"
                  scale={scale}
                  xChannelSelector="R"
                  yChannelSelector="G"
                  result="dispG"
                />
                <feColorMatrix
                  id={cGId}
                  in="dispG"
                  type="matrix"
                  values="0 0 0 0 0  0 1 0 0 0  0 0 0 0 0  0 0 0 0 1"
                  result="cG"
                />
                <feDisplacementMap
                  id={dispBId}
                  in="SourceGraphic"
                  in2="map"
                  scale={scale * (1 - k * 0.5)}
                  xChannelSelector="R"
                  yChannelSelector="G"
                  result="dispB"
                />
                <feColorMatrix
                  id={cBId}
                  in="dispB"
                  type="matrix"
                  values="0 0 0 0 0  0 0 0 0 0  0 0 1 0 0  0 0 0 0 1"
                  result="cB"
                />
                <feBlend id={rgId} in="cR" in2="cG" mode="screen" result="rg" />
                <feBlend in="rg" in2="cB" mode="screen" result="disp" />
                <feGaussianBlur
                  in="disp"
                  stdDeviation={config.blur}
                  result="soft"
                />
                <feColorMatrix
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
          boxShadow:
            config.glow && config.glow !== 'transparent'
              ? `0 0 24px 2px ${config.glow}`
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

      {/* Fresnel rim highlight (gradient ring via mask composite) */}
      {highlight > 0.01 && (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            ...radiusStyle(),
            padding: ringPad,
            background: `linear-gradient(${rimAngle}deg,
              rgba(255,255,255,${0.75 * highlight}) 0%,
              rgba(255,255,255,${0.18 * highlight}) 28%,
              rgba(255,255,255,${0.02 * highlight}) 50%,
              rgba(255,255,255,${0.10 * highlight}) 72%,
              rgba(255,255,255,${0.45 * highlight}) 100%)`,
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

function hexToRgba(hex: string, alpha: number): string {
  const m = hex.replace('#', '')
  const full = m.length === 3 ? m.split('').map(c => c + c).join('') : m
  const num = parseInt(full, 16)
  if (Number.isNaN(num)) return hex
  const r = (num >> 16) & 255
  const g = (num >> 8) & 255
  const b = num & 255
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

export const LiquidGlass = memo(LiquidGlassImpl)
