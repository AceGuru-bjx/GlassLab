/*
 * Displacement map generator — TypeScript port of Kyant0/AndroidLiquidGlass.
 *
 * Source: https://github.com/Kyant0/AndroidLiquidGlass (android branch)
 * Files:  backdrop/src/main/java/com/kyant/backdrop/Shaders.kt
 * License: Apache-2.0, Copyright 2025 Kyant
 *
 * The original AGSL shader computes, for every pixel of a rounded rect:
 *   sd      = signed distance to the rounded-rect boundary (negative inside)
 *   d       = circleMap(1 - (-sd / refractionHeight)) * refractionAmount
 *   grad    = normalize(gradSdRoundedRect(...) + depthEffect * normalize(centeredCoord))
 *   refract = coord + d * grad
 *
 * The dispersion variant (RoundedRectRefractionWithDispersionShaderString)
 * adds a quadrupolar spectral offset sampled at 7 wavelengths:
 *   quad    = (centeredCoord.x * centeredCoord.y) / (halfSize.x * halfSize.y)
 *   spread  = chromaticAberration * quad
 *   taps    = refract + t * d * grad * spread,  t ∈ {+1, +2/3, +1/3, 0, -1/3, -2/3, -1}
 *
 * For the web we bake the two vector fields into 8-bit PNG displacement maps
 * consumed by SVG feDisplacementMap, so the exact same optical profile runs
 * in the browser:
 *   - `base`: R = d·grad.x, G = d·grad.y          (shared refraction vector)
 *   - `quad`: R = quad·d·grad.x, G = quad·d·grad.y (spectral spread vector)
 *
 * Encoding: byte = (displacement / refractionAmount) * 0.5 + 0.5, per axis,
 * so an feDisplacementMap with scale = 2 * refractionAmount reproduces the
 * base field, and scale = 2 * refractionAmount * k * t reproduces the t-th
 * spectral tap of an aberration strength k.
 *
 * Both maps are baked in a single loop pass; alpha stays 255 in each PNG so
 * premultiplied decode paths can never distort the encoded channels.
 */

export interface DisplacementMapOptions {
  /** Glass element width in CSS px */
  width: number
  /** Glass element height in CSS px */
  height: number
  /** Corner radius in px (may exceed half of the min side; clamped) */
  cornerRadius: number
  /** Thickness of the refracting rim band, in px (Kyant0: refractionHeight) */
  refractionHeight: number
  /** Maximum displacement magnitude at the rim, in px (Kyant0: refractionAmount) */
  refractionAmount: number
  /** Add radial "depth" pull towards the center (Kyant0: depthEffect) */
  depthEffect: boolean
  /** Render scale for extra crispness (1 = CSS px resolution) */
  scale?: number
}

export interface DisplacementMaps {
  /** Base refraction vector field — R = x, G = y */
  base: string
  /** Quadrupolar spectral vector field — R = quad·x, G = quad·y */
  quad: string
}

/** Kyant0 SDF: distance to a rounded rect, negative inside. */
export function sdRoundedRect(
  cx: number,
  cy: number,
  hx: number,
  hy: number,
  radius: number
): number {
  const qx = Math.abs(cx) - (hx - radius)
  const qy = Math.abs(cy) - (hy - radius)
  const outside = Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) - radius
  const inside = Math.min(Math.max(qx, qy), 0)
  return outside + inside
}

/** Kyant0 analytic SDF gradient (points outwards, unit length). */
export function gradSdRoundedRect(
  cx: number,
  cy: number,
  hx: number,
  hy: number,
  radius: number
): [number, number] {
  const qx = Math.abs(cx) - (hx - radius)
  const qy = Math.abs(cy) - (hy - radius)
  let gx: number
  let gy: number
  if (qx >= 0 || qy >= 0) {
    const mx = Math.max(qx, 0)
    const my = Math.max(qy, 0)
    const len = Math.hypot(mx, my) || 1
    gx = mx / len
    gy = my / len
  } else {
    // GLSL: gradX = step(cornerCoord.y, cornerCoord.x)
    gx = qx >= qy ? 1 : 0
    gy = 1 - gx
  }
  return [Math.sign(cx) * gx, Math.sign(cy) * gy]
}

/** Kyant0 circleMap: 1 - sqrt(1 - x*x). */
function circleMap(x: number): number {
  return 1 - Math.sqrt(Math.max(0, 1 - x * x))
}

/**
 * Renders both displacement vector fields into PNG data URLs.
 *
 * Base encoding: byte = (displacement / refractionAmount) * 0.5 + 0.5, per
 * axis, so an feDisplacementMap with scale = 2 * refractionAmount reproduces
 * the original field. R channel -> x displacement, G channel -> y
 * displacement. The quad map uses the same normalization, so the t-th
 * spectral tap (aberration k) is reproduced by scale = 2 * refractionAmount
 * * k * t.
 */
export function renderDisplacementMaps(opts: DisplacementMapOptions): DisplacementMaps {
  const {
    width,
    height,
    cornerRadius,
    refractionHeight,
    refractionAmount,
    depthEffect,
    scale = 1,
  } = opts

  const w = Math.max(2, Math.round(width * scale))
  const h = Math.max(2, Math.round(height * scale))
  const halfW = w / 2
  const halfH = h / 2
  const radius = Math.max(
    0,
    Math.min(cornerRadius * scale, Math.min(halfW, halfH))
  )
  const band = Math.max(0.0001, refractionHeight * scale)
  const amount = Math.max(0.0001, refractionAmount * scale)
  const depth = depthEffect ? 1 : 0

  const canvasBase = document.createElement('canvas')
  canvasBase.width = w
  canvasBase.height = h
  const canvasQuad = document.createElement('canvas')
  canvasQuad.width = w
  canvasQuad.height = h
  const ctxBase = canvasBase.getContext('2d')
  const ctxQuad = canvasQuad.getContext('2d')
  if (!ctxBase || !ctxQuad) return { base: '', quad: '' }

  const imgBase = ctxBase.createImageData(w, h)
  const imgQuad = ctxQuad.createImageData(w, h)
  const dataB = imgBase.data
  const dataQ = imgQuad.data

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      // Sample at pixel center.
      const cx = x + 0.5 - halfW
      const cy = y + 0.5 - halfH

      let dx = 0
      let dy = 0
      const sd = sdRoundedRect(cx, cy, halfW, halfH, radius)
      if (-sd < band) {
        const sdClamped = Math.min(sd, 0)
        // Kyant0 passes refractionAmount as a negative uniform, so d <= 0:
        // the content is sampled towards the interior of the lens.
        const d = circleMap(1 - -sdClamped / band) * -amount
        const gradRadius = Math.min(radius * 1.5, Math.min(halfW, halfH))
        let [gx, gy] = gradSdRoundedRect(cx, cy, halfW, halfH, gradRadius)
        if (depth) {
          const len = Math.hypot(cx, cy) || 1
          const nx = gx + depth * (cx / len)
          const ny = gy + depth * (cy / len)
          const nl = Math.hypot(nx, ny) || 1
          gx = nx / nl
          gy = ny / nl
        }
        dx = d * gx
        dy = d * gy
      }

      // Kyant0 dispersion quadrupole: strongest at the corners, sign flips
      // per quadrant, exactly zero along the axes.
      const quad = (cx * cy) / (halfW * halfH)

      const i = (y * w + x) * 4
      dataB[i] = clampByte((dx / amount) * 127.5 + 127.5)
      dataB[i + 1] = clampByte((dy / amount) * 127.5 + 127.5)
      dataB[i + 2] = 128
      dataB[i + 3] = 255
      dataQ[i] = clampByte(((quad * dx) / amount) * 127.5 + 127.5)
      dataQ[i + 1] = clampByte(((quad * dy) / amount) * 127.5 + 127.5)
      dataQ[i + 2] = 128
      dataQ[i + 3] = 255
    }
  }

  ctxBase.putImageData(imgBase, 0, 0)
  ctxQuad.putImageData(imgQuad, 0, 0)
  return { base: canvasBase.toDataURL('image/png'), quad: canvasQuad.toDataURL('image/png') }
}

function clampByte(v: number): number {
  return Math.max(0, Math.min(255, Math.round(v)))
}
