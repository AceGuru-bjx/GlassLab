/*
 * Displacement map generator — TypeScript port of Kyant0/AndroidLiquidGlass.
 *
 * Source: https://github.com/Kyant0/AndroidLiquidGlass (kmp branch)
 * Files:  backdrop/src/commonMain/kotlin/com/kyant/backdrop/internal/Shaders.kt
 * License: Apache-2.0, Copyright 2025 Kyant
 *
 * The original AGSL shader computes, for every pixel of a rounded rect:
 *   sd      = signed distance to the rounded-rect boundary (negative inside)
 *   d       = circleMap(1 - (-sd / refractionHeight)) * refractionAmount
 *   grad    = normalize(gradSdRoundedRect(...) + depthEffect * normalize(centeredCoord))
 *   refract = coord + d * grad
 *
 * For the web we bake the vector field `d * grad` into an 8-bit RG
 * displacement map consumed by SVG feDisplacementMap, so the exact same
 * optical profile runs in the browser.
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
 * Renders the displacement vector field into a PNG data URL.
 *
 * Encoding: byte = (displacement / refractionAmount) * 0.5 + 0.5, per axis,
 * so an feDisplacementMap with scale = 2 * refractionAmount reproduces the
 * original field. R channel -> x displacement, G channel -> y displacement.
 */
export function renderDisplacementMap(opts: DisplacementMapOptions): string {
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

  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  if (!ctx) return ''

  const img = ctx.createImageData(w, h)
  const data = img.data

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

      const i = (y * w + x) * 4
      data[i] = clampByte((dx / amount) * 127.5 + 127.5)
      data[i + 1] = clampByte((dy / amount) * 127.5 + 127.5)
      data[i + 2] = 128
      data[i + 3] = 255
    }
  }

  ctx.putImageData(img, 0, 0)
  return canvas.toDataURL('image/png')
}

function clampByte(v: number): number {
  return Math.max(0, Math.min(255, Math.round(v)))
}
