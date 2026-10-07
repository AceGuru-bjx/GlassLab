/**
 * Glass Lab style presets.
 * Every preset feeds the LiquidGlass component ported from
 * Kyant0/AndroidLiquidGlass (Apache-2.0).
 */

export interface GlassConfig {
  /** Rim refraction strength — max displacement in px (Kyant0: refractionAmount) */
  refraction: number
  /** Refracting rim thickness in px (Kyant0: refractionHeight) */
  height: number
  /** Spectral dispersion / chromatic aberration, 0..1 */
  dispersion: number
  /** Extra gaussian blur of the backdrop in px */
  blur: number
  /** Backdrop saturation, % */
  saturation: number
  /** Corner radius in px; use 999 for a pill shape */
  cornerRadius: number
  /** Radial depth pull (Kyant0: depthEffect) */
  depthEffect: boolean
  /** Fresnel rim highlight intensity, 0..1 */
  highlight: number
  /** Tint color applied over the glass */
  tint: string
  /** Tint opacity, 0..1 */
  tintOpacity: number
  /** Dark glass mode for bright backgrounds */
  overLight: boolean
  /** Drag elasticity of the demo card, 0..1 */
  elasticity: number
  /** Optional colored glow outside the glass */
  glow: string
}

export interface GlassPreset {
  id: string
  name: string
  /** Small hint shown under the name */
  desc: string
  /** css gradient used for the preset thumbnail */
  swatch: string
  config: GlassConfig
}

export const DEFAULT_CONFIG: GlassConfig = {
  refraction: 28,
  height: 42,
  dispersion: 0.35,
  blur: 2,
  saturation: 120,
  cornerRadius: 26,
  depthEffect: false,
  highlight: 0.85,
  tint: '#ffffff',
  tintOpacity: 0.08,
  overLight: false,
  elasticity: 0.55,
  glow: 'transparent',
}

export const PRESETS: GlassPreset[] = [
  {
    id: 'ios-clear',
    name: 'iOS 经典',
    desc: 'Apple 官方透明液态玻璃',
    swatch: 'linear-gradient(135deg,#7dd3fc,#c4b5fd,#fda4af)',
    config: { ...DEFAULT_CONFIG },
  },
  {
    id: 'frosted',
    name: '磨砂玻璃',
    desc: '重雾面，隐私友好',
    swatch: 'linear-gradient(135deg,#e2e8f0,#cbd5e1,#94a3b8)',
    config: {
      ...DEFAULT_CONFIG,
      refraction: 10,
      height: 26,
      dispersion: 0.1,
      blur: 14,
      saturation: 140,
      cornerRadius: 30,
      tintOpacity: 0.16,
      highlight: 0.6,
    },
  },
  {
    id: 'crystal',
    name: '水晶棱镜',
    desc: '强色散，彩虹边缘',
    swatch: 'linear-gradient(135deg,#f0abfc,#a5f3fc,#fde68a)',
    config: {
      ...DEFAULT_CONFIG,
      refraction: 42,
      height: 62,
      dispersion: 0.85,
      blur: 0,
      saturation: 165,
      cornerRadius: 20,
      highlight: 1,
    },
  },
  {
    id: 'aurora',
    name: '极光玻璃',
    desc: '青绿色冷调极光',
    swatch: 'linear-gradient(135deg,#5eead4,#34d399,#a7f3d0)',
    config: {
      ...DEFAULT_CONFIG,
      refraction: 30,
      height: 46,
      dispersion: 0.5,
      blur: 6,
      saturation: 150,
      cornerRadius: 26,
      tint: '#34d399',
      tintOpacity: 0.14,
    },
  },
  {
    id: 'smoked',
    name: '烟熏玻璃',
    desc: '深色低调商务风',
    swatch: 'linear-gradient(135deg,#334155,#1e293b,#0f172a)',
    config: {
      ...DEFAULT_CONFIG,
      refraction: 20,
      height: 32,
      dispersion: 0.15,
      blur: 8,
      saturation: 90,
      cornerRadius: 24,
      tint: '#0f172a',
      tintOpacity: 0.42,
      highlight: 0.5,
    },
  },
  {
    id: 'neon',
    name: '霓虹辉光',
    desc: '赛博朋克霓虹边框',
    swatch: 'linear-gradient(135deg,#f0f,#f0f,#0ff)',
    config: {
      ...DEFAULT_CONFIG,
      refraction: 32,
      height: 50,
      dispersion: 0.7,
      blur: 4,
      saturation: 180,
      cornerRadius: 28,
      tint: '#e879f9',
      tintOpacity: 0.12,
      highlight: 1,
      glow: 'rgba(232,121,249,0.35)',
    },
  },
  {
    id: 'ice',
    name: '冰川玻璃',
    desc: '清透冰蓝，冷静纯净',
    swatch: 'linear-gradient(135deg,#bae6fd,#e0f2fe,#f8fafc)',
    config: {
      ...DEFAULT_CONFIG,
      refraction: 14,
      height: 30,
      dispersion: 0.2,
      blur: 18,
      saturation: 70,
      cornerRadius: 32,
      tint: '#bae6fd',
      tintOpacity: 0.2,
      highlight: 0.75,
    },
  },
  {
    id: 'amber',
    name: '琥珀玻璃',
    desc: '暖调琥珀，复古质感',
    swatch: 'linear-gradient(135deg,#fbbf24,#f59e0b,#b45309)',
    config: {
      ...DEFAULT_CONFIG,
      refraction: 26,
      height: 40,
      dispersion: 0.4,
      blur: 3,
      saturation: 140,
      cornerRadius: 22,
      tint: '#f59e0b',
      tintOpacity: 0.18,
      highlight: 0.9,
    },
  },
  {
    id: 'pill-dock',
    name: '灵动胶囊',
    desc: 'Dynamic Island 药丸形',
    swatch: 'linear-gradient(90deg,#111,#333,#111)',
    config: {
      ...DEFAULT_CONFIG,
      refraction: 34,
      height: 46,
      dispersion: 0.3,
      blur: 2,
      saturation: 130,
      cornerRadius: 999,
      tint: '#000000',
      tintOpacity: 0.2,
      highlight: 0.95,
      glow: 'rgba(255,255,255,0.12)',
    },
  },
  {
    id: 'cloud',
    name: '云雾玻璃',
    desc: '奶白云雾，柔和轻盈',
    swatch: 'linear-gradient(135deg,#fdf2f8,#fce7f3,#fbcfe8)',
    config: {
      ...DEFAULT_CONFIG,
      refraction: 10,
      height: 24,
      dispersion: 0.12,
      blur: 22,
      saturation: 110,
      cornerRadius: 30,
      tint: '#fdf2f8',
      tintOpacity: 0.3,
      highlight: 0.65,
    },
  },
  {
    id: 'prism',
    name: '光学棱镜',
    desc: '极限折射 + 深度形变',
    swatch: 'conic-gradient(#f87171,#fbbf24,#4ade80,#22d3ee,#a78bfa,#f87171)',
    config: {
      ...DEFAULT_CONFIG,
      refraction: 55,
      height: 72,
      dispersion: 1,
      blur: 0,
      saturation: 200,
      cornerRadius: 16,
      depthEffect: true,
      highlight: 1,
    },
  },
  {
    id: 'obsidian',
    name: '黑曜石',
    desc: '深邃黑曜，锋利高光',
    swatch: 'linear-gradient(135deg,#0c0a09,#1c1917,#292524)',
    config: {
      ...DEFAULT_CONFIG,
      refraction: 24,
      height: 36,
      dispersion: 0.22,
      blur: 5,
      saturation: 80,
      cornerRadius: 18,
      tint: '#0c0a09',
      tintOpacity: 0.58,
      highlight: 1,
      glow: 'rgba(255,255,255,0.08)',
    },
  },
]
