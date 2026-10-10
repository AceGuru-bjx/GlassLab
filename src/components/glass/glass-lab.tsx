'use client'

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react'
import { motion, useReducedMotion, useSpring } from 'framer-motion'
import { signIn, signOut, useSession } from 'next-auth/react'
import {
  Backpack,
  Check,
  Copy,
  GitCompare,
  FileDown,
  FileUp,
  ImageDown,
  GripHorizontal,
  GripVertical,
  Import,
  Keyboard,
  LayoutGrid,
  Loader2,
  Lock,
  LockOpen,
  LogIn,
  LogOut,
  MousePointer2,
  Palette,
  Pencil,
  RotateCcw,
  Rows3,
  Save,
  Search,
  Settings2,
  Share2,
  Sparkles,
  Star,
  Trash2,
  Undo2,
  Upload,
  Wand2,
  X,
  Redo2,
  Dices,
  Eye,
} from 'lucide-react'
import { toast } from '@/hooks/use-toast'
import { cn } from '@/lib/utils'

import { AuthDialog } from '@/components/glass/auth-dialog'
import { generateGlassCover, type CoverBackgroundSpec } from '@/lib/glass/cover'
import { generateGlassSnapshot, type SnapshotBackgroundSpec } from '@/lib/glass/snapshot'

import {
  configToCss,
  configToReact,
  configToJson,
  decodeConfig,
  hashPayload,
  shareUrl,
  validateConfigObject,
} from '@/lib/glass/export'

import { Slider } from '@/components/ui/slider'
import { Switch } from '@/components/ui/switch'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { GlassDemoCard, GlassPill } from '@/components/glass/glass-demo-card'
import { MotionBadge, PresetGallery } from '@/components/glass/preset-gallery'
import { isDarkColor, toHexColor, withAlpha } from '@/lib/glass/color'
import {
  CATEGORIES,
  DEFAULT_CONFIG,
  PRESETS,
  isMotionConfig,
  type CategoryFilter,
  type GlassCategory,
  type GlassConfig,
  type GlassPreset,
} from '@/lib/glass/presets'

interface BackgroundOption {
  id: string
  name: string
  /** dark-ish backdrop → light text for overlays that lack their own control */
  dark?: boolean
  /** css background for the stage */
  css?: string
  /** image url for the stage */
  url?: string
  /** css background for the thumbnail */
  thumb: string
  /** custom upload (deletable, owned via /api/backgrounds) */
  custom?: boolean
  /** canvas gradient colors for cover snapshots of css-gradient stages */
  coverGradient?: { colors: string[]; angle: number }
}

interface SavedPreset {
  id: string
  name: string
  config: GlassConfig
  cover?: string | null
  favorite: boolean
  /** Phase 6 M2: ownership badge — true when the row belongs to the session user. */
  mine: boolean
  createdAt: string
}

/** Phase 4 M1: server-side sort orders understood by GET /api/presets. */
type PresetSort = 'recent' | 'name' | 'favorites'

/** Phase 6 M2: visibility slice understood by GET /api/presets. */
type PresetView = 'all' | 'mine' | 'public'

const BACKGROUNDS: BackgroundOption[] = [
  {
    id: 'mesh',
    name: '色域网格',
    css: 'radial-gradient(at 20% 30%, #fda4af 0px, transparent 55%), radial-gradient(at 80% 20%, #67e8f9 0px, transparent 50%), radial-gradient(at 70% 80%, #fdba74 0px, transparent 50%), radial-gradient(at 15% 85%, #c4b5fd 0px, transparent 55%), linear-gradient(120deg, #f8fafc, #eef2ff)',
    thumb:
      'radial-gradient(at 20% 30%, #fda4af 0px, transparent 55%), radial-gradient(at 80% 20%, #67e8f9 0px, transparent 50%), linear-gradient(120deg,#f8fafc,#eef2ff)',
    coverGradient: {
      colors: ['#fda4af', '#67e8f9', '#fdba74', '#c4b5fd'],
      angle: 120,
    },
  },
  {
    id: 'aurora',
    name: '极光',
    dark: true,
    url: '/backgrounds/aurora.png',
    thumb: 'linear-gradient(135deg,#134e4a,#10b981,#7c3aed)',
  },
  {
    id: 'fluid',
    name: '流彩',
    dark: true,
    url: '/backgrounds/fluid.png',
    thumb: 'linear-gradient(135deg,#fb923c,#ec4899,#14b8a6)',
  },
  {
    id: 'sunset',
    name: '落日',
    dark: true,
    url: '/backgrounds/sunset.png',
    thumb: 'linear-gradient(135deg,#f59e0b,#f43f5e,#38bdf8)',
  },
  {
    id: 'neoncity',
    name: '霓虹',
    dark: true,
    url: '/backgrounds/neoncity.png',
    thumb: 'linear-gradient(135deg,#312e81,#db2777,#06b6d4)',
  },
  {
    id: 'dark',
    name: '暗夜',
    dark: true,
    css: 'radial-gradient(at 30% 20%, #1e3a5f 0px, transparent 60%), radial-gradient(at 75% 70%, #3b0764 0px, transparent 55%), linear-gradient(160deg, #020617, #0f172a)',
    thumb: 'linear-gradient(135deg,#0f172a,#1e3a5f,#3b0764)',
    coverGradient: { colors: ['#1e3a5f', '#3b0764', '#020617'], angle: 160 },
  },
]

type NumericKey = keyof Pick<
  GlassConfig,
  | 'refraction'
  | 'height'
  | 'dispersion'
  | 'blur'
  | 'saturation'
  | 'cornerRadius'
  | 'highlight'
  | 'lightAngle'
  | 'tintOpacity'
  | 'elasticity'
  | 'frost'
  | 'brushed'
  | 'brushedAngle'
  | 'bubbles'
  | 'bubbleSize'
  | 'bubbleDensity'
  | 'bubbleRise'
  | 'bubbleDrift'
  | 'shadowIntensity'
  | 'shadowDistance'
  | 'shadowSoftness'
  | 'lightSmoothing'
  | 'edgeBlur'
  | 'vignette'
  | 'glowOpacity'
  | 'glowSpread'
  | 'glowPulse'
  | 'rimFlow'
  | 'motionSpeed'
  | 'iridescence'
  | 'iridescenceWidth'
  | 'iriFlow'
  | 'sparkle'
  | 'sparkleSize'
  | 'sparkleTwinkle'
  | 'wobble'
  | 'dragBounce'
  | 'dragSquash'
  | 'droplets'
  | 'dropletSize'
  | 'glareAngle'
  | 'glare'
>

const PARAM_ROWS: {
  key: NumericKey
  label: string
  min: number
  max: number
  step: number
  fmt: (v: number) => string
}[] = [
  { key: 'refraction', label: '折射强度', min: 0, max: 80, step: 1, fmt: v => `${v}px` },
  { key: 'height', label: '玻璃厚度', min: 4, max: 90, step: 1, fmt: v => `${v}px` },
  { key: 'dispersion', label: '光谱色散', min: 0, max: 1, step: 0.01, fmt: v => `${Math.round(v * 100)}%` },
  { key: 'blur', label: '背景模糊', min: 0, max: 30, step: 0.5, fmt: v => `${v}px` },
  { key: 'saturation', label: '饱和度', min: 0, max: 220, step: 5, fmt: v => `${v}%` },
  { key: 'cornerRadius', label: '圆角半径', min: 0, max: 64, step: 1, fmt: v => `${v}px` },
  { key: 'highlight', label: '菲涅尔高光', min: 0, max: 1, step: 0.01, fmt: v => `${Math.round(v * 100)}%` },
  { key: 'lightAngle', label: '光源角度', min: 0, max: 360, step: 5, fmt: v => `${v}°` },
  { key: 'tintOpacity', label: '染色浓度', min: 0, max: 1, step: 0.01, fmt: v => `${Math.round(v * 100)}%` },
  { key: 'elasticity', label: '拖拽弹性', min: 0, max: 1, step: 0.05, fmt: v => `${Math.round(v * 100)}%` },
  // ---- Phase 5 layered effects ----
  { key: 'edgeBlur', label: '边缘高斯弥散', min: 0, max: 1, step: 0.05, fmt: v => `${Math.round(v * 100)}%` },
  { key: 'frost', label: '磨砂噪点', min: 0, max: 1, step: 0.05, fmt: v => `${Math.round(v * 100)}%` },
  { key: 'vignette', label: '暗角', min: 0, max: 1, step: 0.05, fmt: v => `${Math.round(v * 100)}%` },
  // ---- Phase 9 M2: texture layers ----
  { key: 'brushed', label: '拉丝纹理', min: 0, max: 1, step: 0.05, fmt: v => `${Math.round(v * 100)}%` },
  { key: 'brushedAngle', label: '拉丝角度', min: 0, max: 360, step: 5, fmt: v => `${v}°` },
  { key: 'bubbles', label: '气泡纹理', min: 0, max: 1, step: 0.05, fmt: v => `${Math.round(v * 100)}%` },
  // ---- Phase 10 M2: bubble dynamics ----
  { key: 'bubbleSize', label: '气泡大小', min: 0.4, max: 2.2, step: 0.05, fmt: v => `${v.toFixed(2)}×` },
  { key: 'bubbleDensity', label: '气泡密度', min: 0.3, max: 2.5, step: 0.05, fmt: v => `${Math.max(1, Math.round(8 * v))} 球` },
  { key: 'bubbleRise', label: '气泡上升', min: 0, max: 1, step: 0.01, fmt: v => (v <= 0.01 ? '关' : `${(8 - 6.5 * v).toFixed(1)}s`) },
  // ---- Phase 13 M1: horizontal drift (with rise → spiral; alone → sway) ----
  { key: 'bubbleDrift', label: '气泡漂移', min: 0, max: 1, step: 0.01, fmt: v => (v <= 0.01 ? '关' : `±${Math.round(v * 60)}px`) },
  // ---- Phase 11 M1: directional cast shadow (direction derives from
  //      lightAngle — rotate the light to swing the shadow around) ----
  { key: 'shadowIntensity', label: '投影强度', min: 0, max: 1, step: 0.05, fmt: v => (v <= 0.01 ? '关' : `${Math.round(v * 100)}%`) },
  { key: 'shadowDistance', label: '投影距离', min: 0, max: 40, step: 1, fmt: v => `${v}px` },
  { key: 'shadowSoftness', label: '投影羽化', min: 0, max: 60, step: 1, fmt: v => `${v}px` },
  // ---- Phase 12 M1: light-follow inertia (0 = instant snap like Phase 11,
  //      0.35 default tail ≈ 210ms, 1 = a slow weighty 600ms trailing) ----
  { key: 'lightSmoothing', label: '光源惯性', min: 0, max: 1, step: 0.05, fmt: v => (v <= 0.01 ? '关' : `${Math.round(v * 600)}ms`) },
  // ---- Phase 9 M1: glow system ----
  { key: 'glowOpacity', label: '辉光强度', min: 0, max: 1, step: 0.01, fmt: v => `${Math.round(v * 100)}%` },
  { key: 'glowSpread', label: '辉光范围', min: 0, max: 60, step: 1, fmt: v => `${v}px` },
  // ---- Phase 9 M3: motion system (fmt shows the actual period) ----
  { key: 'glowPulse', label: '辉光呼吸', min: 0, max: 1, step: 0.01, fmt: v => (v <= 0.01 ? '关' : `${(3.6 - 3.0 * v).toFixed(1)}s`) },
  { key: 'rimFlow', label: '高光流动', min: 0, max: 1, step: 0.01, fmt: v => (v <= 0.01 ? '关' : `${(6 - 4.5 * v).toFixed(1)}s`) },
  // ---- Phase 13 M2: global motion tempo (divides every animation period) ----
  { key: 'motionSpeed', label: '动效速度', min: 0.25, max: 2, step: 0.05, fmt: v => `${v.toFixed(2)}×` },
  // ---- Phase 14 M1: thin-film iridescence (spectral edge sheen,
  //      anchored to the light angle — rotate the light to swing it) ----
  { key: 'iridescence', label: '薄膜虹彩', min: 0, max: 1, step: 0.01, fmt: v => (v <= 0.01 ? '关' : `${Math.round(v * 100)}%`) },
  { key: 'iridescenceWidth', label: '虹彩宽度', min: 2, max: 12, step: 1, fmt: v => `${v}px` },
  // ---- Phase 15 M1: iridescent flow (spectral band sweeps the edge) ----
  { key: 'iriFlow', label: '虹彩流动', min: 0, max: 1, step: 0.01, fmt: v => (v <= 0.01 ? '关' : `${(7 - 5 * v).toFixed(1)}s`) },
  // ---- Phase 14 M2: sparkle glints (two twinkling constellations) ----
  { key: 'sparkle', label: '星芒粒子', min: 0, max: 1, step: 0.01, fmt: v => (v <= 0.01 ? '关' : `${Math.round(v * 100)}%`) },
  { key: 'sparkleSize', label: '星芒大小', min: 0.5, max: 2, step: 0.05, fmt: v => `${v.toFixed(2)}×` },
  { key: 'sparkleTwinkle', label: '星芒闪烁', min: 0, max: 1, step: 0.01, fmt: v => (v <= 0.01 ? '静态' : `${(3.4 - 2.6 * v).toFixed(1)}s`) },
  // ---- Phase 14 M3: jelly wobble (border-radius blob breathing) ----
  { key: 'wobble', label: '果冻形变', min: 0, max: 1, step: 0.01, fmt: v => (v <= 0.01 ? '关' : `${Math.round(v * 100)}%`) },
  // ---- Phase 15 M3: drag-release bounce (interaction feel, opt-in) ----
  { key: 'dragBounce', label: '拖拽回弹', min: 0, max: 1, step: 0.01, fmt: v => (v <= 0.01 ? '关' : `${Math.round(v * 100)}%`) },
  // ---- Phase 16 M1: direction-aware squash & stretch (interaction feel) ----
  { key: 'dragSquash', label: '拖拽形变', min: 0, max: 1, step: 0.01, fmt: v => (v <= 0.01 ? '关' : `${Math.round(v * 100)}%`) },
  // ---- Phase 17 M1: condensation droplets (edge-gathered water beads) ----
  { key: 'droplets', label: '凝雾水珠', min: 0, max: 1, step: 0.01, fmt: v => (v <= 0.01 ? '关' : `${Math.round(v * 100)}%`) },
  { key: 'dropletSize', label: '水珠尺度', min: 0.5, max: 2, step: 0.05, fmt: v => `${v.toFixed(2)}×` },
  // ---- Phase 16 M3: glare sweep (period shortens with intensity) ----
  { key: 'glare', label: '反光扫掠', min: 0, max: 1, step: 0.01, fmt: v => (v <= 0.01 ? '关' : `${(9 - 7 * v).toFixed(1)}s`) },
  // ---- Phase 17 M2: glare band direction (115° = the Phase 16 default) ----
  { key: 'glareAngle', label: '光带角度', min: 0, max: 360, step: 5, fmt: v => `${v}°` },
]

/** #92/#115 root-cause fix: the phase label lives in ONE place — the header
 *  badge and the footer text both derive from it, so a new phase can never
 *  leave one of the two stale again. */
const PHASE_LABEL = 'Phase 17 · 凝雾与光带'
const PHASE_FOOTER =
  '第十七阶段 · 凝雾与光带 / 凝雾水珠 · 光带角度 · 导出实时预览'

/** Map a stage background option to the canvas cover generator spec. */
function coverSpec(b: BackgroundOption): CoverBackgroundSpec {
  return {
    imageUrl: b.url,
    gradientColors: b.coverGradient?.colors,
    gradientAngle: b.coverGradient?.angle,
  }
}

/** Map a stage background option to the full-size PNG snapshot spec. */
function snapshotSpec(b: BackgroundOption): SnapshotBackgroundSpec {
  return {
    imageUrl: b.url,
    gradientColors: b.coverGradient?.colors,
    gradientAngle: b.coverGradient?.angle,
  }
}

const MAX_UPLOAD_BYTES = 5 * 1024 * 1024

/** Phase 4 M3: aesthetic random ranges — deliberately well inside both the
 *  API zod bounds and the UI slider ranges (PARAM_ROWS min/max), so random
 *  results always look reasonable and always save successfully. */
const RANDOM_RANGES: Record<NumericKey, [number, number]> = {
  refraction: [20, 70],
  height: [10, 70],
  // The 7-tap quadrupolar dispersion is corner-localized (axes stay clean),
  // so strong values remain tasteful — upstream runs it at full strength.
  dispersion: [0, 0.85],
  blur: [2, 20],
  saturation: [70, 200],
  cornerRadius: [8, 48],
  highlight: [0.1, 0.8],
  lightAngle: [0, 360],
  tintOpacity: [0.05, 0.35],
  elasticity: [0.1, 0.9],
  frost: [0, 0.4],
  brushed: [0, 0.45],
  brushedAngle: [0, 360],
  bubbles: [0, 0.5],
  bubbleSize: [0.6, 1.6],
  bubbleDensity: [0.5, 1.8],
  // Phase 11: cast shadow randomizes tastefully — distance/softness keep
  // the card grounded rather than flinging it off the stage.
  shadowIntensity: [0, 0.5],
  shadowDistance: [8, 26],
  shadowSoftness: [18, 42],
  edgeBlur: [0, 0.5],
  vignette: [0, 0.35],
  glowOpacity: [0.5, 1],
  glowSpread: [12, 40],
  // Motion params deliberately never randomize — animations are opt-in.
  glowPulse: [0, 0],
  rimFlow: [0, 0],
  bubbleRise: [0, 0],
  // Phase 13: interaction feel & motion params are opt-in too.
  lightSmoothing: [0, 0],
  bubbleDrift: [0, 0],
  motionSpeed: [1, 1],
  // Phase 14: iridescence/sparkle intensities randomize tastefully; their
  // motion (twinkle, wobble) is opt-in like every animation.
  iridescence: [0, 0.6],
  iridescenceWidth: [3, 8],
  sparkle: [0, 0.55],
  sparkleSize: [0.6, 1.4],
  sparkleTwinkle: [0, 0],
  wobble: [0, 0],
  // Phase 15: flow & interaction feel are opt-in like every animation.
  iriFlow: [0, 0],
  dragBounce: [0, 0],
  // Phase 16: drag squash is an interaction feel — opt-in, never random.
  dragSquash: [0, 0],
  // The glare sweep is visible motion — opt-in like every animation.
  glare: [0, 0],
  // Phase 17: condensation is a texture state (not motion) — randomizes
  // tastefully like frost/brushed; the glare band direction follows the
  // brushedAngle convention and sweeps the full circle.
  droplets: [0, 0.55],
  dropletSize: [0.6, 1.5],
  glareAngle: [0, 360],
}

/** Phase 4 M3: variant jitter amplitude (±15% of the current value). */
const VARIANT_JITTER = 0.15

// ---- Phase 16 M2: remappable single-key shortcuts ----
// The Ctrl/Cmd+Z family stays browser-native (never remapped); Esc is a
// close-layer universal (never remapped). Redo rides Shift + the undo key,
// so only the base key is stored per action.
const KEYBIND_ACTIONS = [
  { id: 'undo', desc: '撤销上一步参数' },
  { id: 'random', desc: '随机灵感（锁定项不变）' },
  { id: 'view', desc: '列表 ↔ 画廊视图切换' },
  { id: 'compare', desc: '对比模式开关' },
  { id: 'help', desc: '打开/关闭本帮助' },
] as const
type KeybindAction = (typeof KEYBIND_ACTIONS)[number]['id']
type KeybindMap = Record<KeybindAction, string>
const DEFAULT_KEYBINDS: KeybindMap = {
  undo: 'z',
  random: 'r',
  view: 'v',
  compare: 'c',
  help: '?',
}
const KEYBINDS_STORAGE_KEY = 'glasslab-keybindings-v1'
/** Accept single letters and digits only (shift-combos/space stay native). */
const KEYBIND_PATTERN = /^[a-zA-Z0-9]$/
/** Case-insensitive match for letters; symbol bindings match verbatim. */
function keyMatches(pressed: string, binding: string): boolean {
  if (binding.length === 1 && binding.toLowerCase() === binding.toUpperCase()) {
    return pressed === binding
  }
  return pressed.toLowerCase() === binding.toLowerCase()
}

const randInt = (lo: number, hi: number) =>
  Math.floor(Math.random() * (hi - lo + 1)) + lo
const randFloat = (lo: number, hi: number) =>
  Math.round((lo + Math.random() * (hi - lo)) * 100) / 100

/** Value-changing slider keys — the keyboard gesture equivalent of a grab. */
const SLIDER_VALUE_KEYS = new Set([
  'ArrowLeft',
  'ArrowRight',
  'ArrowUp',
  'ArrowDown',
  'Home',
  'End',
  'PageUp',
  'PageDown',
])

function ConfigPanel({
  config,
  onChange,
  darkContent,
  onDarkContentChange,
  onHistoryCheckpoint,
  lockedParams,
  onToggleLock,
}: {
  config: GlassConfig
  onChange: (patch: Partial<GlassConfig>) => void
  darkContent: boolean
  onDarkContentChange: (v: boolean) => void
  /** Phase 4 M2: called when an interaction *begins* (slider grab, switch
   *  flip) so the pre-interaction state lands on the undo stack exactly once
   *  per gesture — continuous slider onChange must NOT push. */
  onHistoryCheckpoint?: () => void
  /** Phase 4 M3: locked numeric keys keep their values on randomize. */
  lockedParams: Set<NumericKey>
  onToggleLock: (key: NumericKey) => void
}) {
  // #62: keyboard nudges are the a11y path to sliders — without a checkpoint
  // they bypass undo entirely AND get silently absorbed as the baseline of the
  // next pointer checkpoint. Capture phase fires before radix applies the
  // value change, so the checkpoint snapshots the pre-change state; a 600 ms
  // window coalesces held-key auto-repeat (~30/s) into one burst checkpoint,
  // matching the one-checkpoint-per-gesture semantics of the pointer path.
  const keyboardCheckpointRef = useRef(0)
  const onSliderKeyDownCapture = (e: ReactKeyboardEvent) => {
    if (!SLIDER_VALUE_KEYS.has(e.key)) return
    const now = Date.now()
    if (now - keyboardCheckpointRef.current < 600) return
    keyboardCheckpointRef.current = now
    onHistoryCheckpoint?.()
  }
  return (
    <div className="space-y-5" data-testid="config-panel">
      {PARAM_ROWS.map(r => {
        const locked = lockedParams.has(r.key)
        return (
          <div key={r.key} className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1">
                <Label className="text-xs text-muted-foreground">{r.label}</Label>
                <button
                  type="button"
                  onClick={() => onToggleLock(r.key)}
                  aria-label={locked ? `解锁 ${r.label}` : `锁定 ${r.label}`}
                  aria-pressed={locked}
                  title={locked ? '随机时保持该参数' : '锁定该参数'}
                  data-testid={`lock-${r.key}`}
                  className={cn(
                    'rounded p-0.5 transition-colors',
                    locked
                      ? 'text-amber-500 hover:text-amber-400'
                      : 'text-muted-foreground/35 hover:text-muted-foreground'
                  )}
                >
                  {locked ? <Lock className="h-3 w-3" /> : <LockOpen className="h-3 w-3" />}
                </button>
              </span>
              <span className="rounded-md bg-muted px-1.5 py-0.5 text-[11px] tabular-nums text-muted-foreground">
                {r.fmt(config[r.key])}
              </span>
            </div>
            <Slider
              value={[config[r.key]]}
              min={r.min}
              max={r.max}
              step={r.step}
              aria-label={r.label}
              onPointerDown={onHistoryCheckpoint}
              onKeyDownCapture={onSliderKeyDownCapture}
              onValueChange={([v]) => onChange({ [r.key]: v } as Partial<GlassConfig>)}
            />
          </div>
        )
      })}

      <Separator />

      <div className="flex items-center justify-between">
        <div>
          <Label className="text-xs">深度形变</Label>
          <p className="text-[11px] text-muted-foreground">Kyant0 depthEffect 径向拉扯</p>
        </div>
        <Switch
          checked={config.depthEffect}
          aria-label="深度形变"
          onCheckedChange={v => {
            onHistoryCheckpoint?.()
            onChange({ depthEffect: v })
          }}
        />
      </div>
      <div className="flex items-center justify-between">
        <div>
          <Label className="text-xs">深色玻璃</Label>
          <p className="text-[11px] text-muted-foreground">overLight 亮背景自适应</p>
        </div>
        <Switch
          checked={config.overLight}
          aria-label="深色玻璃"
          onCheckedChange={v => {
            onHistoryCheckpoint?.()
            onChange({ overLight: v })
          }}
        />
      </div>
      <div className="flex items-center justify-between">
        <div>
          <Label className="text-xs">暗色内容</Label>
          <p className="text-[11px] text-muted-foreground">卡内文字切换为浅色</p>
        </div>
        <Switch
          checked={darkContent}
          aria-label="暗色内容"
          onCheckedChange={onDarkContentChange}
        />
      </div>

      <div className="flex items-center justify-between">
        <div>
          <Label className="text-xs">光源跟随光标</Label>
          <p className="text-[11px] text-muted-foreground">
            光标即光源，rim 与投影同步旋转
          </p>
        </div>
        <Switch
          checked={config.lightFollow}
          aria-label="光源跟随光标"
          onCheckedChange={v => {
            onHistoryCheckpoint?.()
            onChange({ lightFollow: v })
          }}
        />
      </div>
      <div className="flex items-center justify-between">
        <div>
          <Label className="text-xs">拉丝垂直光源</Label>
          <p className="text-[11px] text-muted-foreground">
            拉丝方向 = 光源角度 + 90°，金属高光物理一致
          </p>
        </div>
        <Switch
          checked={config.brushedFollow}
          aria-label="拉丝垂直光源"
          onCheckedChange={v => {
            onHistoryCheckpoint?.()
            onChange({ brushedFollow: v })
          }}
        />
      </div>

      <Separator />

      {/* ---- Phase 8 M2: color & light studio ---- */}
      <div className="space-y-2.5" data-testid="color-panel">
        <div>
          <Label className="text-xs">色彩与光效</Label>
          <p className="text-[10px] text-muted-foreground">
            染色 / 高光 / 辉光 / 投影实时取色
          </p>
        </div>
        <div className="grid grid-cols-4 gap-2">
          {(
            [
              {
                key: 'tint',
                label: '染色',
                testid: 'tint-color',
                value: toHexColor(config.tint),
                pick: (hex: string) => onChange({ tint: hex }),
              },
              {
                key: 'highlightColor',
                label: '高光',
                testid: 'highlight-color',
                value: toHexColor(config.highlightColor),
                pick: (hex: string) => onChange({ highlightColor: hex }),
              },
              {
                key: 'glow',
                label: '辉光',
                testid: 'glow-color',
                value: toHexColor(config.glow),
                pick: (hex: string) => onChange({ glow: withAlpha(hex, 0.32) }),
              },
              {
                key: 'shadowColor',
                label: '投影',
                testid: 'shadow-color',
                value: toHexColor(config.shadowColor),
                pick: (hex: string) => onChange({ shadowColor: hex }),
              },
            ] as const
          ).map(f => (
            <label
              key={f.key}
              className="group flex cursor-pointer flex-col items-center gap-1 rounded-lg border p-1.5 transition-colors hover:border-teal-500/50"
              title={f.label}
            >
              <span className="sr-only">{f.label}色板</span>
              <input
                type="color"
                value={f.value}
                onPointerDown={onHistoryCheckpoint}
                onChange={e => f.pick(e.target.value)}
                aria-label={`${f.label}色`}
                data-testid={f.testid}
                className="h-9 w-full cursor-pointer rounded-md border-none bg-transparent p-0"
              />
              <span className="text-[10px] leading-none text-muted-foreground group-hover:text-foreground">
                {f.label}
              </span>
            </label>
          ))}
        </div>
        <button
          type="button"
          onClick={() => {
            onHistoryCheckpoint?.()
            onChange({ glow: 'transparent' })
          }}
          aria-pressed={config.glow === 'transparent'}
          data-testid="glow-clear"
          className={`w-full rounded-full border px-2 py-1 text-[11px] font-medium transition-colors ${
            config.glow === 'transparent'
              ? 'border-teal-500 bg-teal-500/10 text-teal-600'
              : 'text-muted-foreground hover:border-teal-500/40 hover:text-foreground'
          }`}
        >
          {config.glow === 'transparent' ? '辉光已关闭' : '关闭辉光'}
        </button>

        {/* Phase 15 M2: sparkle color mode — tints the star field at bake
            time (white stays the Phase 14 default; gold gilds; rainbow
            rotates per-star hues through the golden angle). */}
        <div>
          <Label className="text-xs">星芒颜色</Label>
          <div
            className="mt-1.5 flex gap-1.5"
            role="radiogroup"
            aria-label="星芒颜色模式"
          >
            {(
              [
                { key: 'white', label: '星白', dot: '#ffffff' },
                { key: 'gold', label: '鎏金', dot: '#ffd05a' },
                { key: 'rainbow', label: '彩虹', dot: 'conic-gradient(#ff6b6b,#ffd93d,#6bff8f,#6bd5ff,#a06bff,#ff6bd5,#ff6b6b)' },
              ] as const
            ).map(m => (
              <button
                key={m.key}
                type="button"
                role="radio"
                aria-checked={config.sparkleColor === m.key}
                data-testid={`sparkle-color-${m.key}`}
                onClick={() => {
                  onHistoryCheckpoint?.()
                  onChange({ sparkleColor: m.key })
                }}
                className={`flex flex-1 items-center justify-center gap-1.5 rounded-full border px-2 py-1 text-[11px] font-medium transition-colors ${
                  config.sparkleColor === m.key
                    ? 'border-teal-500 bg-teal-500/10 text-teal-600'
                    : 'text-muted-foreground hover:border-teal-500/40 hover:text-foreground'
                }`}
              >
                <span
                  aria-hidden
                  className="h-2.5 w-2.5 rounded-full border border-black/10"
                  style={{ background: m.dot }}
                />
                {m.label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

/** Card shell with consistent padding & header. */
function CardShell({
  icon,
  title,
  hint,
  children,
  className,
}: {
  icon: React.ReactNode
  title: string
  hint?: string
  children: React.ReactNode
  className?: string
}) {
  return (
    <div className={`rounded-2xl border bg-card/90 p-4 shadow-sm ${className ?? ''}`}>
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
          {icon}
          {title}
        </h2>
        {hint && <span className="text-[10px] text-muted-foreground/70">{hint}</span>}
      </div>
      {children}
    </div>
  )
}

const EXPORT_FORMATS = [
  { id: 'css', label: 'CSS', gen: configToCss },
  { id: 'react', label: 'React', gen: configToReact },
  { id: 'json', label: 'JSON', gen: configToJson },
] as const

type ExportFormatId = (typeof EXPORT_FORMATS)[number]['id']

/** Phase 2 M2: code export + share-link panel; Phase 6 adds PNG snapshot & file I/O. */
function ExportPanel({
  config,
  bg,
  onImportConfig,
}: {
  config: GlassConfig
  bg: BackgroundOption
  onImportConfig: (cfg: GlassConfig, fileName: string) => void
}) {
  const [format, setFormat] = useState<ExportFormatId>('css')
  const [copied, setCopied] = useState<string | null>(null)
  const [snapBusy, setSnapBusy] = useState(false)
  const [previewOpen, setPreviewOpen] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const current = EXPORT_FORMATS.find(f => f.id === format) ?? EXPORT_FORMATS[0]
  const code = useMemo(() => current.gen(config), [current, config])
  const link = useMemo(() => shareUrl(config), [config])

  const handleDownloadJson = useCallback(() => {
    try {
      const blob = new Blob([configToJson(config)], {
        type: 'application/json',
      })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `glasslab-config-${Date.now()}.glass.json`
      document.body.appendChild(a)
      a.click()
      a.remove()
      setTimeout(() => URL.revokeObjectURL(url), 4000)
      toast({ title: '配置文件已下载', description: 'glasslab-config-*.glass.json' })
    } catch {
      toast({ title: '文件导出失败', description: '请稍后重试', variant: 'destructive' })
    }
  }, [config])

  const handleImportFile = useCallback(
    (file: File) => {
      const reader = new FileReader()
      reader.onload = () => {
        try {
          const raw: unknown = JSON.parse(String(reader.result))
          const cfg = validateConfigObject(raw)
          if (!cfg) throw new Error('invalid')
          onImportConfig(cfg, file.name)
        } catch {
          toast({
            title: '导入失败',
            description: '文件不是有效的玻璃配置 JSON',
            variant: 'destructive',
          })
        }
      }
      reader.onerror = () => {
        toast({ title: '文件读取失败', variant: 'destructive' })
      }
      reader.readAsText(file)
    },
    [onImportConfig]
  )

  const handleSnapshot = useCallback(async () => {
    setSnapBusy(true)
    try {
      const blob = await generateGlassSnapshot(snapshotSpec(bg), config)
      if (!blob) throw new Error()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `glasslab-snapshot-${Date.now()}.png`
      document.body.appendChild(a)
      a.click()
      a.remove()
      // Give the browser a moment to start the download before revoking.
      setTimeout(() => URL.revokeObjectURL(url), 4000)
      toast({ title: 'PNG 快照已下载', description: '1600×1000 · 含背景与玻璃卡片' })
    } catch {
      toast({ title: '快照生成失败', description: '请稍后重试', variant: 'destructive' })
    } finally {
      setSnapBusy(false)
    }
  }, [config, bg])

  /** Phase 17 M3: the live-preview document — the REAL exported CSS rendered
   *  inside a sandboxed (script-less) iframe, so what the user sees is
   *  byte-for-byte what they will paste. The stage mirrors the lab's current
   *  background (image stages resolve against the page origin — srcdoc has
   *  no base URL, so relative paths would 404). Built lazily, only while the
   *  dialog is open — `window` is touched for the image URL resolution and
   *  the panel must stay SSR-safe. */
  const buildPreviewDoc = useCallback(() => {
    const css = configToCss(config)
    const stageBg = bg.url
      ? typeof window !== 'undefined'
        ? `url("${new URL(bg.url, window.location.origin).href}")`
        : bg.thumb
      : bg.css ?? bg.thumb
    const ink = bg.dark ? '#f8fafc' : '#0f172a'
    const muted = bg.dark ? 'rgba(248,250,252,0.78)' : 'rgba(15,23,42,0.72)'
    const chipBorder = bg.dark ? 'rgba(248,250,252,0.35)' : 'rgba(15,23,42,0.25)'
    return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><style>
${css}
html,body{margin:0;padding:0;min-height:100vh;overflow:hidden;}
.stage{position:fixed;inset:0;display:flex;align-items:center;justify-content:center;background:${stageBg};background-size:cover;background-position:center;font-family:ui-sans-serif,system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;}
.card{width:min(380px,84vw);padding:30px 34px;}
.card h3{margin:0 0 10px;font-size:17px;font-weight:600;color:${ink};letter-spacing:.01em;}
.card p{margin:0;font-size:12.5px;line-height:1.7;color:${muted};}
.card code{font-family:ui-monospace,monospace;font-size:11px;padding:1px 5px;border-radius:5px;background:${bg.dark ? 'rgba(248,250,252,0.14)' : 'rgba(15,23,42,0.08)'};}
.chips{display:flex;gap:8px;margin-top:18px;flex-wrap:wrap;}
.chip{font-size:10.5px;padding:3px 10px;border-radius:999px;border:1px solid ${chipBorder};color:${ink};}
</style></head><body><div class="stage"><div class="liquid-glass"><div class="card">
<h3>导出 CSS 实时预览</h3>
<p>这张卡片完全由当前导出的 <code>.liquid-glass</code> 渲染——backdrop 模糊、纹理叠层、辉光投影与全部动画（扫掠 / 上升 / 果冻形变）都在 iframe 沙箱里活体运行。边缘位移折射是 JS 引擎专属能力，导出说明注释中已注明。</p>
<div class="chips"><span class="chip">backdrop-filter</span><span class="chip">textures</span><span class="chip">animations</span></div>
</div></div></div></body></html>`
  }, [config, bg])

  const copyText = useCallback(
    async (text: string, tag: string, label: string) => {
      // navigator.clipboard needs a secure context + permission; fall back to
      // the legacy execCommand path for restricted environments.
      const ok = await (async () => {
        try {
          await navigator.clipboard.writeText(text)
          return true
        } catch {
          try {
            const ta = document.createElement('textarea')
            ta.value = text
            ta.style.position = 'fixed'
            ta.style.opacity = '0'
            document.body.appendChild(ta)
            ta.select()
            const done = document.execCommand('copy')
            document.body.removeChild(ta)
            return done
          } catch {
            return false
          }
        }
      })()
      if (ok) {
        setCopied(tag)
        toast({ title: '已复制到剪贴板', description: label })
        setTimeout(() => setCopied(c => (c === tag ? null : c)), 1600)
      } else {
        toast({ title: '复制失败', description: '请手动选择文本复制', variant: 'destructive' })
      }
    },
    []
  )

  return (
    <div className="space-y-4" data-testid="export-panel">
      <div className="flex gap-1.5" role="tablist" aria-label="导出格式">
        {EXPORT_FORMATS.map(f => (
          <button
            key={f.id}
            role="tab"
            aria-selected={format === f.id}
            onClick={() => setFormat(f.id)}
            data-testid={`export-${f.id}`}
            className={`shrink-0 rounded-full border px-2.5 py-1 text-[11px] font-medium transition-all ${
              format === f.id
                ? 'border-teal-500 bg-teal-500/10 text-teal-600'
                : 'text-muted-foreground hover:border-teal-500/40 hover:text-foreground'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      <pre
        data-testid="export-code"
        className="glass-scroll max-h-72 overflow-y-auto rounded-lg bg-muted/60 p-3 font-mono text-[11px] leading-relaxed whitespace-pre-wrap break-words"
      >
        {code}
      </pre>

      <Button
        size="sm"
        variant="outline"
        className="w-full gap-1.5"
        onClick={() => copyText(code, 'code', `${current.label} 代码`)}
        data-testid="copy-code"
      >
        {copied === 'code' ? (
          <Check className="h-3.5 w-3.5 text-teal-600" />
        ) : (
          <Copy className="h-3.5 w-3.5" />
        )}
        复制 {current.label} 代码
      </Button>

      {/* Phase 17 M3: live preview — the exported CSS rendered in a
          script-less sandboxed iframe, byte-identical to the copy above. */}
      <Button
        size="sm"
        variant="outline"
        className="w-full gap-1.5"
        onClick={() => setPreviewOpen(true)}
        data-testid="preview-export"
      >
        <Eye className="h-3.5 w-3.5" />
        预览导出效果
      </Button>

      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-1.5 text-sm">
              <Eye className="h-4 w-4" aria-hidden />
              导出实时预览
            </DialogTitle>
            <DialogDescription className="text-xs">
              沙箱 iframe 内以当前导出 CSS 渲染的
              <code className="mx-1 rounded bg-muted px-1 py-0.5 font-mono text-[10px]">.liquid-glass</code>
              卡片——与复制到剪贴板的代码逐字节一致；动画活体运行。
            </DialogDescription>
          </DialogHeader>
          <div className="overflow-hidden rounded-xl border border-border shadow-inner">
            <iframe
              title="导出 CSS 实时预览"
              sandbox=""
              srcDoc={previewOpen ? buildPreviewDoc() : undefined}
              className="block h-[440px] w-full bg-black"
              data-testid="preview-iframe"
            />
          </div>
        </DialogContent>
      </Dialog>

      <Separator />

      <div>
        <Label className="text-xs">分享链接</Label>
        <p className="mt-0.5 text-[11px] text-muted-foreground">
          打开链接自动载入当前玻璃配置
        </p>
        <div className="mt-2 flex items-center gap-2">
          <Input
            readOnly
            value={link}
            aria-label="分享链接"
            onFocus={e => e.currentTarget.select()}
            className="h-9 font-mono text-[11px]"
          />
          <Button
            size="sm"
            className="h-9 shrink-0 gap-1 text-xs"
            onClick={() => copyText(link, 'link', '分享链接')}
            data-testid="copy-link"
          >
            {copied === 'link' ? (
              <Check className="h-3.5 w-3.5" />
            ) : (
              <Share2 className="h-3.5 w-3.5" />
            )}
            复制
          </Button>
        </div>
      </div>

      <Separator />

      {/* Phase 6 M1: full-size PNG snapshot of the stage */}
      <div>
        <Label className="text-xs">PNG 快照</Label>
        <p className="mt-0.5 text-[11px] text-muted-foreground">
          当前背景与玻璃卡片合成为 1600×1000 图片并下载
        </p>
        <Button
          size="sm"
          variant="outline"
          className="mt-2 w-full gap-1.5"
          onClick={handleSnapshot}
          disabled={snapBusy}
          data-testid="download-png"
        >
          {snapBusy ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <ImageDown className="h-3.5 w-3.5" />
          )}
          下载 PNG 快照
        </Button>
      </div>

      <Separator />

      {/* Phase 6 M3: .glass.json file export & import */}
      <div>
        <Label className="text-xs">配置文件</Label>
        <p className="mt-0.5 text-[11px] text-muted-foreground">
          以 .glass.json 文件存档当前配置，或从文件导入
        </p>
        <div className="mt-2 grid grid-cols-2 gap-2">
          <Button
            size="sm"
            variant="outline"
            className="gap-1.5"
            onClick={handleDownloadJson}
            data-testid="download-json"
          >
            <FileDown className="h-3.5 w-3.5" />
            导出文件
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="gap-1.5"
            onClick={() => fileInputRef.current?.click()}
            data-testid="import-json"
          >
            <FileUp className="h-3.5 w-3.5" />
            导入文件
          </Button>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept=".json,application/json"
          className="hidden"
          aria-label="导入配置文件"
          data-testid="import-json-input"
          onChange={e => {
            const f = e.target.files?.[0]
            if (f) handleImportFile(f)
            // Reset so re-selecting the same file re-triggers onChange.
            e.target.value = ''
          }}
        />
      </div>
    </div>
  )
}

export function GlassLab() {
  const [config, setConfig] = useState<GlassConfig>(DEFAULT_CONFIG)
  const [activePreset, setActivePreset] = useState<string>('ios-clear')
  const [category, setCategory] = useState<CategoryFilter>('全部')
  // Phase 11 M3: library view mode (list ↔ gallery), persisted locally.
  // Starts as 'list' on BOTH server and client (a lazy localStorage read
  // here would hydrate-mismatch when the stored value is 'gallery'); the
  // stored preference is applied right after mount instead.
  const [presetView, setPresetView] = useState<'list' | 'gallery'>('list')
  useEffect(() => {
    if (window.localStorage.getItem('glasslab:preset-view') === 'gallery') {
      setPresetView('gallery')
    }
  }, [])
  const [bg, setBg] = useState<BackgroundOption>(BACKGROUNDS[0])
  const [darkContent, setDarkContent] = useState(false)
  const [presetName, setPresetName] = useState('')
  const [saving, setSaving] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [saved, setSaved] = useState<SavedPreset[]>([])
  const [loadingSaved, setLoadingSaved] = useState(true)
  // ---- Phase 4 M1: favorite / search / sort ----
  const [presetQuery, setPresetQuery] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')
  const [sortMode, setSortMode] = useState<PresetSort>('recent')
  // Phase 6 M2: visibility slice (only rendered for signed-in users)
  const [viewMode, setViewMode] = useState<PresetView>('all')
  const [totalSaved, setTotalSaved] = useState(0)
  const [togglingFavId, setTogglingFavId] = useState<string | null>(null)
  const [authOpen, setAuthOpen] = useState(false)
  const { data: session, status: sessionStatus } = useSession()

  // ---- Phase 3 M1: custom background uploads ----
  const [customBgs, setCustomBgs] = useState<BackgroundOption[]>([])
  const [uploading, setUploading] = useState(false)
  const [deletingBgId, setDeletingBgId] = useState<string | null>(null)

  // ---- Phase 3 M3: A/B compare mode ----
  const [compareOn, setCompareOn] = useState(false)
  const [compareSplit, setCompareSplit] = useState(50)
  const [compareTargetId, setCompareTargetId] = useState('style:vision-panel')
  const [compareAxis, setCompareAxis] = useState<'x' | 'y'>('x')
  const compareDraggingRef = useRef(false)

  const stageRef = useRef<HTMLDivElement>(null)

  // ---- Phase 4 M2: undo/redo history ----
  // Refs mirror the latest config/activePreset so checkpoints never read a
  // stale closure; the stack itself lives in a ref (not state) to keep
  // slider drags allocation-cheap, with a depth snapshot for the UI.
  const HISTORY_LIMIT = 50
  const configRef = useRef(config)
  configRef.current = config
  const activePresetRef = useRef(activePreset)
  activePresetRef.current = activePreset
  const historyRef = useRef<{ past: { config: GlassConfig; activePreset: string }[]; future: { config: GlassConfig; activePreset: string }[] }>({
    past: [],
    future: [],
  })
  const [historyDepth, setHistoryDepth] = useState({ undo: 0, redo: 0 })

  const pushHistory = useCallback(() => {
    const h = historyRef.current
    const entry = {
      config: { ...configRef.current },
      activePreset: activePresetRef.current,
    }
    // Skip no-op checkpoints (e.g. a click that grabs but never drags).
    const last = h.past[h.past.length - 1]
    if (last && JSON.stringify(last) === JSON.stringify(entry)) return
    h.past.push(entry)
    if (h.past.length > HISTORY_LIMIT) h.past.shift()
    // A new branch invalidates the redo tail.
    h.future.length = 0
    setHistoryDepth({ undo: h.past.length, redo: h.future.length })
  }, [])

  const restoreEntry = useCallback((entry: { config: GlassConfig; activePreset: string }) => {
    setConfig(entry.config)
    setActivePreset(entry.activePreset)
    setDarkContent(
      entry.config.tintOpacity > 0.3 && isDarkColor(entry.config.tint)
    )
  }, [])

  const undo = useCallback(() => {
    const h = historyRef.current
    const prev = h.past.pop()
    if (!prev) return
    h.future.push({
      config: { ...configRef.current },
      activePreset: activePresetRef.current,
    })
    restoreEntry(prev)
    setHistoryDepth({ undo: h.past.length, redo: h.future.length })
  }, [restoreEntry])

  const redo = useCallback(() => {
    const h = historyRef.current
    const next = h.future.pop()
    if (!next) return
    h.past.push({
      config: { ...configRef.current },
      activePreset: activePresetRef.current,
    })
    restoreEntry(next)
    setHistoryDepth({ undo: h.past.length, redo: h.future.length })
  }, [restoreEntry])


  // ---- Phase 4 M3: inspiration generator ----
  const [lockedParams, setLockedParams] = useState<Set<NumericKey>>(() => new Set())
  // Phase 11 M2: light-follow — the draggable card element whose centre is
  // the pivot for the pointer→light angle.
  const dragCardRef = useRef<HTMLDivElement>(null)
  const lightFollowRaf = useRef(0)
  // Phase 15 M3: drag-release bounce — an underdamped spring on the
  // whileDrag scale so releasing the card settles through
  // 1.03→0.97→1.01→1 like a jelly landing on the table. dragBounce 0 keeps
  // framer's default critically-damped settle (existing presets unchanged);
  // reduced-motion snaps instead of oscillating. transform channel is
  // disjoint from the jelly morph's border-radius, so both compose.
  const reduceMotion = useReducedMotion()
  const dragBounce = Math.max(0, Math.min(1, config.dragBounce ?? 0))
  const dragBounceTransition =
    dragBounce > 0.01 && !reduceMotion
      ? {
          scale: {
            type: 'spring' as const,
            stiffness: 300,
            damping: Math.max(5, 22 - 18 * dragBounce),
            mass: 0.85,
          },
        }
      : undefined
  // Phase 16 M1: direction-aware squash & stretch. A spring pair carries the
  // anisotropic scale; during drag the framer onDrag info's velocity vector
  // sets targets (stretch along the motion axis, 0.6-weighted squash
  // perpendicular — volume-ish preservation), release springs back to 1.
  // The values live on an inner wrapper div, so the outer motion.div keeps
  // its drag position + whileDrag scale + bounce spring untouched; at
  // dragSquash 0 the values never leave 1 → framer emits no transform
  // (byte-identical resting render). reduced-motion skips deformation.
  const dragSquash = Math.max(0, Math.min(1, config.dragSquash ?? 0))
  const squashX = useSpring(1, { stiffness: 420, damping: 26, mass: 0.9 })
  const squashY = useSpring(1, { stiffness: 420, damping: 26, mass: 0.9 })
  const squashActive = dragSquash > 0.01 && !reduceMotion
  const configRefForSquash = useRef(config)
  configRefForSquash.current = config
  const onSquashDrag = useCallback(
    (_: unknown, info: { velocity: { x: number; y: number } }) => {
      const s = configRefForSquash.current.dragSquash ?? 0
      if (s <= 0.01) return
      const vx = info.velocity.x
      const vy = info.velocity.y
      const speed = Math.hypot(vx, vy)
      // ~2600 px/s saturates the effect; amplitude caps at 22% × dragSquash.
      const k = Math.min(speed / 2600, 1) * 0.22 * s
      if (k < 0.002) return
      // Axis-aligned split: cos²/sin² weights stretch to the dominant axis
      // (pure horizontal → scaleX only; diagonal → even split). Content
      // stays upright — no rotation on the glass card itself.
      const ang = Math.atan2(vy, vx)
      const c2 = Math.cos(ang) ** 2
      const s2 = Math.sin(ang) ** 2
      squashX.set(1 + k * c2 - 0.6 * k * s2)
      squashY.set(1 + k * s2 - 0.6 * k * c2)
    },
    [squashX, squashY]
  )
  const onSquashDragEnd = useCallback(() => {
    squashX.set(1)
    squashY.set(1)
  }, [squashX, squashY])
  // Phase 12 M1: inertial tracking — the pointer publishes a target bearing
  // here; the smoothing loop eases the rendered angle toward it.
  const lightTargetRef = useRef<number | null>(null)
  const lightTrackRaf = useRef(0)
  const compareOnRef = useRef(compareOn)
  compareOnRef.current = compareOn

  // Phase 12 M1: inertial light tracking. The pointer publishes a target
  // bearing; an rAF loop eases the live angle toward it along the shortest
  // arc with a frame-rate-independent exponential step — τ maps
  // lightSmoothing 0→~0ms (instant snap, byte-identical to Phase 11) and
  // 1→600ms (a slow, weighty tail). The loop parks itself once the angle
  // converges so an idle stage costs zero frames; follow updates keep their
  // Phase 11 contract of never touching the undo stack.
  const startLightTracking = useCallback(() => {
    let last = performance.now()
    const step = (now: number) => {
      lightTrackRaf.current = 0
      const target = lightTargetRef.current
      if (target == null || !configRef.current.lightFollow || compareOnRef.current) {
        lightTargetRef.current = null
        return
      }
      const smoothing = Math.min(1, Math.max(0, configRef.current.lightSmoothing ?? 0.35))
      const dt = Math.max(1, now - last)
      last = now
      const current = configRef.current.lightAngle ?? 0
      // Shortest-arc delta, normalised to −180..180 so the easing never
      // sweeps the long way round (350°→10° crosses 0°, not 180°).
      const delta = ((((target - current) % 360) + 540) % 360) - 180
      const tau = smoothing * 600 + 0.01
      const k = 1 - Math.exp(-dt / tau)
      let next = current + delta * k
      if (Math.abs(delta) < 0.4 || k >= 1) next = target
      next = ((Math.round(next) % 360) + 360) % 360
      if (next !== Math.round(current)) {
        setConfig(c =>
          Math.round(c.lightAngle ?? 0) === next ? c : { ...c, lightAngle: next }
        )
        setActivePreset('')
      }
      if (next !== target) lightTrackRaf.current = requestAnimationFrame(step)
    }
    lightTrackRaf.current = requestAnimationFrame(step)
  }, [])

  // Pointer-as-light: on every stage pointer move (lightFollow on, compare
  // off), the light angle becomes the bearing from the card centre to the
  // pointer (0° = above the card, clockwise). rAF-throttled and rounded to
  // whole degrees — lightAngle is style-only (never rebakes the displacement
  // map), so this stays cheap while rotating rim + cast shadow in real time.
  // Continuous follow updates deliberately never push onto the undo stack;
  // the enabling toggle itself is the single checkpoint per gesture.
  const onStagePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!configRef.current.lightFollow || compareOn) return
      const px = e.clientX
      const py = e.clientY
      if (lightFollowRaf.current) return
      lightFollowRaf.current = requestAnimationFrame(() => {
        lightFollowRaf.current = 0
        const card = dragCardRef.current
        if (!card) return
        const rect = card.getBoundingClientRect()
        const cx = rect.left + rect.width / 2
        const cy = rect.top + rect.height / 2
        const dx = px - cx
        const dy = cy - py
        if (Math.abs(dx) < 2 && Math.abs(dy) < 2) return
        let deg = Math.round((Math.atan2(dx, dy) * 180) / Math.PI) % 360
        if (deg < 0) deg += 360
        if (Math.round(configRef.current.lightAngle) === deg) return
        // Phase 12 M1: publish the target; the inertial loop eases toward it.
        lightTargetRef.current = deg
        if (!lightTrackRaf.current) startLightTracking()
      })
    },
    [compareOn, startLightTracking]
  )
  // Release any in-flight follow/tracking frames on unmount — the tracking
  // loop also self-parks when compare mode engages or follow turns off.
  useEffect(
    () => () => {
      if (lightFollowRaf.current) cancelAnimationFrame(lightFollowRaf.current)
      if (lightTrackRaf.current) cancelAnimationFrame(lightTrackRaf.current)
    },
    []
  )
  const toggleLock = useCallback((key: NumericKey) => {
    setLockedParams(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }, [])

  const randomizeConfig = useCallback(() => {
    pushHistory()
    setConfig(c => {
      const next: GlassConfig = { ...c }
      for (const r of PARAM_ROWS) {
        if (lockedParams.has(r.key)) continue
        const [lo, hi] = RANDOM_RANGES[r.key]
        // integer steps for px/% params, two decimals for 0..1 ratios
        next[r.key] = (r.step >= 1 ? randInt(lo, hi) : randFloat(lo, hi)) as GlassConfig[NumericKey]
      }
      next.depthEffect = Math.random() < 0.5
      next.overLight = Math.random() < 0.5
      return next
    })
    setActivePreset('')
    toast({ title: '已生成随机灵感', description: '锁定项保持不变' })
  }, [lockedParams, pushHistory])

  const variantConfig = useCallback(() => {
    pushHistory()
    setConfig(c => {
      const next: GlassConfig = { ...c }
      for (const r of PARAM_ROWS) {
        if (lockedParams.has(r.key)) continue
        const jittered = c[r.key] * (1 + (Math.random() * 2 - 1) * VARIANT_JITTER)
        // clamp into the UI slider range (variants start from the current
        // value, not the aesthetic random range)
        const clamped = Math.min(r.max, Math.max(r.min, jittered))
        next[r.key] = (r.step >= 1 ? Math.round(clamped) : Math.round(clamped * 100) / 100) as GlassConfig[NumericKey]
      }
      return next
    })
    setActivePreset('')
    toast({ title: '已生成变体', description: '基于当前参数 ±15% 微调' })
  }, [lockedParams, pushHistory])

  // ---- Phase 13 M3: keyboard shortcuts + help dialog ----
  const [helpOpen, setHelpOpen] = useState(false)

  // ---- Phase 16 M2: remappable single-key bindings ----
  // State starts at defaults; stored preferences load AFTER mount (Phase 11
  // hydration lesson — lazy localStorage restore, SSR markup stays stable).
  // The live keydown handler reads through keybindsRef so remapping never
  // re-binds the window listener; persistence writes on every change.
  const [keybinds, setKeybinds] = useState<KeybindMap>(DEFAULT_KEYBINDS)
  const [remapping, setRemapping] = useState<KeybindAction | null>(null)
  const keybindsRef = useRef(keybinds)
  keybindsRef.current = keybinds
  const remappingRef = useRef<KeybindAction | null>(null)
  remappingRef.current = remapping
  useEffect(() => {
    try {
      const raw = localStorage.getItem(KEYBINDS_STORAGE_KEY)
      if (!raw) return
      const parsed = JSON.parse(raw) as Partial<KeybindMap>
      const next = { ...DEFAULT_KEYBINDS }
      for (const a of KEYBIND_ACTIONS) {
        const v = parsed[a.id]
        if (typeof v === 'string' && KEYBIND_PATTERN.test(v)) next[a.id] = v.toLowerCase()
      }
      setKeybinds(next)
    } catch {
      // Corrupted storage falls back to defaults silently.
    }
  }, [])
  const applyKeybind = useCallback(
    (action: KeybindAction, key: string) => {
      const k = key.toLowerCase()
      const next = { ...keybindsRef.current, [action]: k }
      setKeybinds(next)
      try {
        localStorage.setItem(KEYBINDS_STORAGE_KEY, JSON.stringify(next))
      } catch {
        // Storage full/blocked — the session binding still applies.
      }
      return next
    },
    []
  )
  const resetKeybinds = useCallback(() => {
    setKeybinds(DEFAULT_KEYBINDS)
    setRemapping(null)
    try {
      localStorage.removeItem(KEYBINDS_STORAGE_KEY)
    } catch {
      /* best-effort */
    }
    toast({ title: '快捷键已恢复默认', description: 'Z / R / V / C / ?' })
  }, [])
  // Capture-phase listener while a remap is armed: swallows the key before
  // the global shortcut layer (both live on window; capture fires first and
  // stopPropagation keeps the bubble listener blind). Escape cancels, valid
  // single keys commit (conflict-checked), anything else is rejected.
  useEffect(() => {
    if (!remapping) return
    const onRemapKey = (e: KeyboardEvent) => {
      e.preventDefault()
      e.stopImmediatePropagation()
      if (e.key === 'Escape') {
        setRemapping(null)
        return
      }
      if (!KEYBIND_PATTERN.test(e.key)) {
        toast({
          title: '无法绑定该按键',
          description: '仅支持单个字母或数字（Esc 取消）',
          variant: 'destructive',
        })
        return
      }
      const newKey = e.key.toLowerCase()
      const owner = KEYBIND_ACTIONS.find(
        a => a.id !== remapping && keybindsRef.current[a.id] === newKey
      )
      if (owner) {
        toast({
          title: '按键冲突',
          description: `「${newKey.toUpperCase()}」已绑定「${owner.desc}」`,
          variant: 'destructive',
        })
        return
      }
      setRemapping(null)
      applyKeybind(remapping, newKey)
      const actedDesc = KEYBIND_ACTIONS.find(a => a.id === remapping)?.desc ?? '快捷键'
      toast({ title: '快捷键已更新', description: `「${actedDesc}」→ ${newKey.toUpperCase()}` })
    }
    window.addEventListener('keydown', onRemapKey, { capture: true })
    return () => window.removeEventListener('keydown', onRemapKey, { capture: true })
  }, [remapping, applyKeybind])

  // Keyboard shortcuts: Ctrl/Cmd+Z undo, Ctrl+Shift+Z / Ctrl+Y redo.
  // Phase 13 M3 single-key layer: Z undo / Shift+Z redo / R random
  // inspiration / V list↔gallery view / C compare / ? help. Skipped while
  // typing (native text editing owns those keys), while a native modifier
  // combination is held (browser shortcuts win), and undo/redo are also
  // gated while compare mode is on — compare panes hold their own configs,
  // not the stack. View/compare/help stay available everywhere.
  // Phase 16 M2: the single-key layer consults keybindsRef (remappable).
  const randomizeConfigRef = useRef(randomizeConfig)
  randomizeConfigRef.current = randomizeConfig
  const undoRef = useRef(undo)
  undoRef.current = undo
  const redoRef = useRef(redo)
  redoRef.current = redo
  const presetViewRef = useRef(presetView)
  presetViewRef.current = presetView
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (remappingRef.current) return
      const t = e.target as HTMLElement | null
      if (
        t &&
        (t.tagName === 'INPUT' ||
          t.tagName === 'TEXTAREA' ||
          t.tagName === 'SELECT' ||
          t.isContentEditable)
      )
        return
      // Modifier combinations belong to the browser (Ctrl+T, Cmd+R…);
      // the single-key layer only fires on bare keys.
      if (e.metaKey || e.ctrlKey || e.altKey) {
        const key = e.key.toLowerCase()
        if (key === 'z' && !compareOn) {
          e.preventDefault()
          if (e.shiftKey) redoRef.current()
          else undoRef.current()
        } else if (key === 'y' && !compareOn) {
          e.preventDefault()
          redoRef.current()
        }
        return
      }
      const k = e.key
      const kb = keybindsRef.current
      if (keyMatches(k, kb.undo)) {
        e.preventDefault()
        if (e.shiftKey) redoRef.current()
        else undoRef.current()
      } else if (keyMatches(k, kb.random)) {
        e.preventDefault()
        randomizeConfigRef.current()
      } else if (keyMatches(k, kb.view)) {
        e.preventDefault()
        setPresetView(v => (v === 'list' ? 'gallery' : 'list'))
      } else if (keyMatches(k, kb.compare)) {
        e.preventDefault()
        setCompareOn(v => !v)
      } else if (keyMatches(k, kb.help) || (k === '/' && e.shiftKey && kb.help === '?')) {
        e.preventDefault()
        setHelpOpen(v => !v)
      } else if (k === 'Escape') {
        setHelpOpen(false)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [compareOn])

  const patch = useCallback((p: Partial<GlassConfig>) => {
    setConfig(c => ({ ...c, ...p }))
    setActivePreset('')
  }, [])

  const applyPreset = useCallback((p: GlassPreset) => {
    pushHistory()
    setConfig({ ...p.config })
    setActivePreset(p.id)
    setDarkContent(p.config.tintOpacity > 0.3 && isDarkColor(p.config.tint))
  }, [pushHistory])

  // ---- saved presets (API) ----
  // Response-order guard (#56): only the newest request may land state —
  // a slower in-flight response from a previous sort/search must not
  // overwrite the list the user is currently looking at.
  const savedFetchSeq = useRef(0)
  const fetchSaved = useCallback(async () => {
    const seq = ++savedFetchSeq.current
    try {
      setLoadingSaved(true)
      const params = new URLSearchParams()
      if (debouncedQuery) params.set('q', debouncedQuery)
      if (sortMode !== 'recent') params.set('sort', sortMode)
      if (viewMode !== 'all') params.set('view', viewMode)
      const qs = params.toString()
      const res = await fetch(`/api/presets${qs ? `?${qs}` : ''}`)
      if (!res.ok) throw new Error('加载失败')
      const data = (await res.json()) as {
        presets: SavedPreset[]
        total: number
        limit: number
      }
      if (seq !== savedFetchSeq.current) return
      setSaved(data.presets)
      setTotalSaved(data.total)
    } catch {
      if (seq === savedFetchSeq.current)
        toast({ title: '预设加载失败', description: '请稍后重试' })
    } finally {
      if (seq === savedFetchSeq.current) setLoadingSaved(false)
    }
  }, [debouncedQuery, sortMode, viewMode])

  // Phase 4 M1: debounce the search box so typing doesn't hammer the API.
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(presetQuery.trim()), 300)
    return () => clearTimeout(t)
  }, [presetQuery])

  // Phase 11 M3: persist the library view mode.
  useEffect(() => {
    try {
      window.localStorage.setItem('glasslab:preset-view', presetView)
    } catch {
      /* private mode etc. — persistence is best-effort */
    }
  }, [presetView])

  useEffect(() => {
    // Re-fetch on session transitions (login/logout change the visible set:
    // private presets vs public ones) or when search/sort changes — skip the
    // initial 'loading' phase so each mount resolves with exactly one fetch
    // per settled status.
    if (sessionStatus === 'loading') return
    fetchSaved()
  }, [fetchSaved, sessionStatus])

  // ---- Phase 4 M1: favorite toggle (optimistic with rollback) ----
  const toggleFavorite = useCallback(
    async (preset: SavedPreset) => {
      const next = !preset.favorite
      setSaved(list =>
        list.map(p => (p.id === preset.id ? { ...p, favorite: next } : p))
      )
      setTogglingFavId(preset.id)
      try {
        const res = await fetch(`/api/presets/${preset.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ favorite: next }),
        })
        if (!res.ok) throw new Error()
        if (sortMode === 'favorites') {
          // While "favorites first" sorting is active the row must move to
          // its server-sorted position — a plain local flip would leave it
          // stale, so re-fetch the sorted order.
          fetchSaved()
        } else {
          setSaved(list =>
            list.map(p =>
              p.id === preset.id ? { ...p, favorite: next } : p
            )
          )
        }
      } catch {
        // Roll back the optimistic flip.
        setSaved(list =>
          list.map(p =>
            p.id === preset.id ? { ...p, favorite: preset.favorite } : p
          )
        )
        toast({ title: '收藏状态更新失败', variant: 'destructive' })
      } finally {
        setTogglingFavId(null)
      }
    },
    [sortMode, fetchSaved]
  )

  // ---- custom backgrounds (API, Phase 3 M1) ----
  const fetchCustomBgs = useCallback(async () => {
    try {
      const res = await fetch('/api/backgrounds')
      if (!res.ok) return
      const data = (await res.json()) as {
        id: string
        name: string
        url: string
      }[]
      setCustomBgs(
        data.map(r => ({
          id: r.id,
          name: r.name,
          url: r.url,
          custom: true,
          thumb: `url(${r.url}) center / cover no-repeat`,
        }))
      )
    } catch {
      // Custom backgrounds are an enhancement — never block the lab.
    }
  }, [])

  useEffect(() => {
    if (sessionStatus === 'loading') return
    fetchCustomBgs()
  }, [fetchCustomBgs, sessionStatus])

  const handleUploadBg = useCallback(
    async (file: File) => {
      if (file.size > MAX_UPLOAD_BYTES) {
        toast({
          title: '图片过大',
          description: '最大 5MB，请压缩后重试',
          variant: 'destructive',
        })
        return
      }
      setUploading(true)
      try {
        const fd = new FormData()
        fd.append('file', file)
        const res = await fetch('/api/backgrounds', {
          method: 'POST',
          body: fd,
        })
        if (!res.ok) {
          let msg = '请重试'
          if (res.status === 413) msg = '图片过大，最大 5MB'
          else if (res.status === 400) {
            try {
              msg = (await res.json()).error ?? msg
            } catch {}
          }
          throw new Error(msg)
        }
        const row = (await res.json()) as {
          id: string
          name: string
          url: string
        }
        const opt: BackgroundOption = {
          id: row.id,
          name: row.name,
          url: row.url,
          custom: true,
          thumb: `url(${row.url}) center / cover no-repeat`,
        }
        setCustomBgs(list => [opt, ...list])
        setBg(opt)
        toast({ title: '背景已上传', description: row.name })
      } catch (e) {
        toast({
          title: '上传失败',
          description: e instanceof Error ? e.message : '请重试',
          variant: 'destructive',
        })
      } finally {
        setUploading(false)
      }
    },
    []
  )

  const handleDeleteBg = useCallback(async (id: string) => {
    setDeletingBgId(id)
    try {
      const res = await fetch(`/api/backgrounds/${id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error()
      setCustomBgs(list => list.filter(b => b.id !== id))
      // If the deleted upload was on stage, fall back to the default bg.
      setBg(cur => (cur.id === id ? BACKGROUNDS[0] : cur))
      toast({ title: '已删除自定义背景' })
    } catch {
      toast({ title: '删除失败', variant: 'destructive' })
    } finally {
      setDeletingBgId(null)
    }
  }, [])

  // ---- share-link deep load (#g=<payload>) ----
  // rAF-deferred: keeps the effect free of synchronous state writes.
  useEffect(() => {
    const raf = requestAnimationFrame(() => {
      const payload = hashPayload(window.location.hash)
      if (!payload) return
      const cfg = decodeConfig(payload)
      if (!cfg) {
        toast({ title: '分享链接无效', description: '已忽略' })
        return
      }
      pushHistory()
      setConfig(cfg)
      setActivePreset('')
      setDarkContent(cfg.tintOpacity > 0.3 && isDarkColor(cfg.tint))
      toast({ title: '已载入分享的玻璃配置' })
    })
    return () => cancelAnimationFrame(raf)
    // pushHistory is a stable []-dependency callback — declaring it is
    // unnecessary and exhaustive-deps stays silent.
  }, [pushHistory])

  const handleImportConfig = useCallback(
    (cfg: GlassConfig, fileName: string) => {
      pushHistory()
      setConfig(cfg)
      setActivePreset('')
      setDarkContent(cfg.tintOpacity > 0.3 && isDarkColor(cfg.tint))
      toast({ title: '已从文件载入配置', description: fileName })
    },
    [pushHistory]
  )

  const savePreset = useCallback(async () => {
    const name =
      presetName.trim() ||
      `我的玻璃 ${new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}`
    setSaving(true)
    try {
      // Phase 3 M2: snapshot a cover first — failure is non-fatal (null),
      // the preset still saves with the gradient-swatch fallback.
      const cover = await generateGlassCover(coverSpec(bg), config)
      const res = await fetch('/api/presets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, config, cover }),
      })
      if (!res.ok) {
        throw new Error(res.status === 400 ? '名称或参数不合法' : '请检查网络后重试')
      }
      setPresetName('')
      toast({ title: '预设已保存', description: name })
      fetchSaved()
    } catch (e) {
      toast({
        title: '保存失败',
        description: e instanceof Error ? e.message : '请检查网络后重试',
      })
    } finally {
      setSaving(false)
    }
  }, [config, presetName, fetchSaved, bg])

  const deletePreset = useCallback(
    async (id: string) => {
      setDeletingId(id)
      try {
        const res = await fetch(`/api/presets/${id}`, { method: 'DELETE' })
        if (!res.ok) throw new Error()
        setSaved(list => list.filter(p => p.id !== id))
        setTotalSaved(t => Math.max(0, t - 1))
        toast({ title: '已删除预设' })
      } catch {
        toast({ title: '删除失败' })
      } finally {
        setDeletingId(null)
      }
    },
    []
  )

  // ---- Phase 3 M3: compare mode helpers ----
  // Narrow viewports split the stage top/bottom so the 320px demo card fits;
  // wide viewports split left/right. rAF deferral keeps lint's
  // set-state-in-effect rule happy, mirroring the share-link effect below.
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 639px)')
    const raf = requestAnimationFrame(() => setCompareAxis(mq.matches ? 'y' : 'x'))
    const onChange = (e: MediaQueryListEvent) =>
      setCompareAxis(e.matches ? 'y' : 'x')
    mq.addEventListener('change', onChange)
    return () => {
      cancelAnimationFrame(raf)
      mq.removeEventListener('change', onChange)
    }
  }, [])

  const compareB = useMemo<{ name: string; config: GlassConfig }>(() => {
    const sep = compareTargetId.indexOf(':')
    const kind = compareTargetId.slice(0, sep)
    const id = compareTargetId.slice(sep + 1)
    if (kind === 'saved') {
      const s = saved.find(p => p.id === id)
      if (s) return { name: s.name, config: { ...DEFAULT_CONFIG, ...s.config } }
    } else if (kind === 'style') {
      const p = PRESETS.find(x => x.id === id)
      if (p) return { name: p.name, config: { ...DEFAULT_CONFIG, ...p.config } }
    }
    // Target disappeared (deleted preset, stale id) → fall back gracefully.
    return { name: PRESETS[0].name, config: { ...DEFAULT_CONFIG, ...PRESETS[0].config } }
  }, [compareTargetId, saved])

  const onDividerPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault()
    compareDraggingRef.current = true
    e.currentTarget.setPointerCapture(e.pointerId)
  }, [])

  const onDividerPointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!compareDraggingRef.current) return
      const el = stageRef.current
      if (!el) return
      const rect = el.getBoundingClientRect()
      const pct =
        compareAxis === 'x'
          ? ((e.clientX - rect.left) / rect.width) * 100
          : ((e.clientY - rect.top) / rect.height) * 100
      setCompareSplit(Math.min(95, Math.max(5, pct)))
    },
    [compareAxis]
  )

  const onDividerDragEnd = useCallback(() => {
    compareDraggingRef.current = false
  }, [])

  const onDividerKeyDown = useCallback((e: React.KeyboardEvent) => {
    const step = e.shiftKey ? 10 : 2
    if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
      e.preventDefault()
      setCompareSplit(s => Math.max(5, s - step))
    } else if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
      e.preventDefault()
      setCompareSplit(s => Math.min(95, s + step))
    } else if (e.key === 'Home') {
      e.preventDefault()
      setCompareSplit(5)
    } else if (e.key === 'End') {
      e.preventDefault()
      setCompareSplit(95)
    }
  }, [])

  const clipA =
    compareAxis === 'x'
      ? `inset(0 ${100 - compareSplit}% 0 0)`
      : `inset(0 0 ${100 - compareSplit}% 0)`
  const clipB =
    compareAxis === 'x'
      ? `inset(0 0 0 ${compareSplit}%)`
      : `inset(${compareSplit}% 0 0 0)`

  const bgStyle: React.CSSProperties = bg.css
    ? { background: bg.css }
    : {
        backgroundImage: `url(${bg.url})`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
      }

  return (
    <div className="min-h-screen flex flex-col">
      {/* ---------- Header ---------- */}
      <header className="sticky top-0 z-40 border-b border-white/10 bg-background/70 backdrop-blur-xl">
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between gap-3 px-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-teal-300 via-sky-400 to-violet-400 shadow-md">
              <Sparkles className="h-4 w-4 text-white" />
            </div>
            <div>
              <h1 className="text-sm font-semibold leading-tight">玻璃实验室</h1>
              <p className="text-[10px] leading-tight text-muted-foreground">
                Liquid Glass Lab · Kyant0 算法移植
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="hidden rounded-full border border-teal-500/30 bg-teal-500/10 px-2.5 py-1 text-[10px] font-medium text-teal-600 sm:inline-block">
              {PHASE_LABEL}
            </span>
            {sessionStatus === 'loading' ? (
              <div className="h-8 w-20 animate-pulse rounded-lg bg-muted" aria-hidden />
            ) : session?.user ? (
              <div className="flex items-center gap-1.5" data-testid="user-area">
                <span
                  className="flex h-8 items-center gap-1.5 rounded-full border bg-card/80 px-2.5 text-xs font-medium"
                  title={session.user.email ?? ''}
                >
                  <span
                    aria-hidden
                    className="flex h-5 w-5 items-center justify-center rounded-full bg-gradient-to-br from-teal-400 to-violet-400 text-[10px] font-bold text-white"
                  >
                    {(session.user.name ?? session.user.email ?? '?').slice(0, 1).toUpperCase()}
                  </span>
                  <span className="max-w-[96px] truncate">
                    {session.user.name ?? session.user.email}
                  </span>
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 gap-1 px-2 text-xs"
                  onClick={() => signOut({ callbackUrl: '/' })}
                  data-testid="signout"
                >
                  <LogOut className="h-3.5 w-3.5" />
                  登出
                </Button>
              </div>
            ) : (
              <Button
                size="sm"
                className="h-8 gap-1 px-3 text-xs"
                onClick={() => setAuthOpen(true)}
                data-testid="login-button"
              >
                <LogIn className="h-3.5 w-3.5" />
                登录
              </Button>
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-5">
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-[260px_minmax(0,1fr)_320px]">
          {/* ---------- Left: style presets ---------- */}
          <aside className="order-2 min-w-0 lg:order-1">
            <CardShell
              icon={<Palette className="h-3.5 w-3.5" />}
              title="玻璃样式库"
              hint={`${PRESETS.length} 款`}
            >
              {/* category filter chips + view toggle (Phase 11 M3: 「动效」
                  cross-cutting filter + list ↔ gallery switch) */}
              <div className="mb-3 flex items-start gap-2">
                <div
                  className="flex min-w-0 flex-1 gap-1.5 overflow-x-auto pb-1"
                  role="tablist"
                  aria-label="样式分类筛选"
                >
                  {(['全部', ...CATEGORIES, '动效'] as const).map(c => (
                    <button
                      key={c}
                      role="tab"
                      id={`category-tab-${c}`}
                      aria-selected={category === c}
                      aria-controls="preset-grid"
                      onClick={() => setCategory(c)}
                      data-testid={`category-${c}`}
                      className={`shrink-0 rounded-full border px-2.5 py-1 text-[11px] font-medium transition-all ${
                        category === c
                          ? 'border-teal-500 bg-teal-500/10 text-teal-600'
                          : 'text-muted-foreground hover:border-teal-500/40 hover:text-foreground'
                      } ${c === '动效' ? 'border-dashed' : ''}`}
                    >
                      {c}
                    </button>
                  ))}
                </div>
                <div
                  className="flex shrink-0 gap-0.5 rounded-lg border bg-muted/40 p-0.5"
                  role="group"
                  aria-label="样式库视图切换"
                >
                  <button
                    onClick={() => setPresetView('list')}
                    aria-label="列表视图"
                    aria-pressed={presetView === 'list'}
                    data-testid="view-list"
                    title="列表视图"
                    className={`flex h-6 w-6 items-center justify-center rounded-md transition-colors ${
                      presetView === 'list'
                        ? 'bg-background text-foreground shadow-sm'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    <Rows3 className="h-3.5 w-3.5" aria-hidden />
                  </button>
                  <button
                    onClick={() => setPresetView('gallery')}
                    aria-label="画廊视图"
                    aria-pressed={presetView === 'gallery'}
                    data-testid="view-gallery"
                    title="画廊视图（实时渲染封面）"
                    className={`flex h-6 w-6 items-center justify-center rounded-md transition-colors ${
                      presetView === 'gallery'
                        ? 'bg-background text-foreground shadow-sm'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    <LayoutGrid className="h-3.5 w-3.5" aria-hidden />
                  </button>
                </div>
              </div>
              <div
                id="preset-grid"
                role="tabpanel"
                aria-label="玻璃预设列表"
                className="max-h-[520px] overflow-y-auto pr-1 glass-scroll"
              >
                {presetView === 'gallery' ? (
                  <PresetGallery
                    presets={
                      category === '全部'
                        ? PRESETS
                        : category === '动效'
                          ? PRESETS.filter(p => isMotionConfig(p.config))
                          : PRESETS.filter(p => p.category === category)
                    }
                    activePreset={activePreset}
                    onApply={applyPreset}
                    coverSpec={coverSpec(bg)}
                    bgKey={bg.id}
                  />
                ) : (
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-2">
                    {(category === '全部'
                      ? PRESETS
                      : category === '动效'
                        ? PRESETS.filter(p => isMotionConfig(p.config))
                        : PRESETS.filter(p => p.category === category)
                    ).map(p => (
                      <button
                        key={p.id}
                        onClick={() => applyPreset(p)}
                        data-active={activePreset === p.id}
                        data-testid={`preset-${p.id}`}
                        className="group flex flex-col items-start gap-2 rounded-xl border p-2 text-left transition-all hover:border-teal-500/50 hover:shadow-md data-[active=true]:border-teal-500 data-[active=true]:ring-2 data-[active=true]:ring-teal-500/30"
                      >
                        <span
                          className="relative block h-10 w-full overflow-hidden rounded-lg shadow-inner"
                          style={{ background: p.swatch }}
                          aria-hidden
                        >
                          {isMotionConfig(p.config) && (
                            <MotionBadge className="absolute right-1 top-1" />
                          )}
                        </span>
                        <span className="w-full">
                          <span className="block text-xs font-medium">{p.name}</span>
                          <span className="block truncate text-[10px] text-muted-foreground">
                            {p.desc}
                          </span>
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </CardShell>
          </aside>

          {/* ---------- Center: stage ---------- */}
          <section className="order-1 min-w-0 lg:order-2">
            <CardShell
              icon={<MousePointer2 className="h-3.5 w-3.5" />}
              title="实验舞台"
              hint="拖动卡片 · 缩略图切背景 · 对比模式 A/B"
              className="flex flex-col"
            >
              {/* background switcher + upload + compare toggle */}
              <div className="mb-3 flex items-center gap-2">
                <div className="flex min-w-0 flex-1 items-center gap-2 overflow-x-auto pb-1">
                  {BACKGROUNDS.map(b => (
                    <button
                      key={b.id}
                      onClick={() => setBg(b)}
                      data-active={bg.id === b.id}
                      aria-label={`背景 ${b.name}`}
                      title={b.name}
                      className="h-9 w-14 shrink-0 rounded-lg border transition-all hover:scale-105 data-[active=true]:border-teal-500 data-[active=true]:ring-2 data-[active=true]:ring-teal-500/40"
                      style={{ background: b.thumb }}
                    />
                  ))}
                  {customBgs.map(b => (
                    <div
                      key={b.id}
                      className="group relative h-9 w-14 shrink-0"
                      data-testid="custom-bg-item"
                    >
                      <button
                        onClick={() => setBg(b)}
                        data-active={bg.id === b.id}
                        aria-label={`背景 ${b.name}`}
                        title={b.name}
                        data-testid="custom-bg-thumb"
                        className="h-9 w-14 rounded-lg border transition-all hover:scale-105 data-[active=true]:border-teal-500 data-[active=true]:ring-2 data-[active=true]:ring-teal-500/40"
                        style={{ background: b.thumb }}
                      />
                      <button
                        onClick={() => handleDeleteBg(b.id)}
                        aria-label={`删除背景 ${b.name}`}
                        data-testid="delete-custom-bg"
                        disabled={deletingBgId === b.id}
                        className="absolute right-0.5 top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-black/55 text-white opacity-80 transition-colors hover:bg-destructive sm:opacity-0 sm:group-focus-within:opacity-100 sm:group-hover:opacity-100"
                      >
                        {deletingBgId === b.id ? (
                          <Loader2 className="h-2.5 w-2.5 animate-spin" />
                        ) : (
                          <X className="h-2.5 w-2.5" aria-hidden />
                        )}
                      </button>
                    </div>
                  ))}
                  <label
                    className={`relative flex h-9 w-14 shrink-0 cursor-pointer items-center justify-center rounded-lg border border-dashed transition-colors hover:border-teal-500/60 hover:bg-teal-500/5 ${
                      uploading ? 'pointer-events-none opacity-60' : ''
                    }`}
                    title="上传自定义背景"
                    data-testid="bg-upload-tile"
                  >
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/webp,image/gif"
                      className="sr-only"
                      aria-label="上传自定义背景图片"
                      disabled={uploading}
                      onChange={e => {
                        const f = e.target.files?.[0]
                        e.target.value = ''
                        if (f) handleUploadBg(f)
                      }}
                    />
                    {uploading ? (
                      <Loader2 className="h-4 w-4 animate-spin text-teal-600" />
                    ) : (
                      <Upload className="h-4 w-4 text-muted-foreground" />
                    )}
                  </label>
                </div>
                <Button
                  variant={compareOn ? 'default' : 'outline'}
                  size="sm"
                  className="h-9 shrink-0 gap-1.5 px-2.5 text-xs"
                  onClick={() => setCompareOn(v => !v)}
                  aria-pressed={compareOn}
                  data-testid="compare-toggle"
                >
                  <GitCompare className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">对比</span>
                </Button>
              </div>

              {/* compare mode target picker (Phase 3 M3) */}
              {compareOn && (
                <div
                  className="mb-3 flex items-center gap-2 rounded-xl border bg-muted/40 px-2.5 py-1.5"
                  data-testid="compare-bar"
                >
                  <span
                    aria-hidden
                    className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-teal-500/15 text-[10px] font-bold text-teal-600"
                  >
                    A
                  </span>
                  <span className="shrink-0 text-[11px] text-muted-foreground">当前配置</span>
                  <GitCompare className="h-3.5 w-3.5 shrink-0 text-muted-foreground/60" aria-hidden />
                  <span
                    aria-hidden
                    className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-violet-500/15 text-[10px] font-bold text-violet-600"
                  >
                    B
                  </span>
                  <Select value={compareTargetId} onValueChange={setCompareTargetId}>
                    <SelectTrigger
                      className="h-7 min-w-0 flex-1 border-0 bg-transparent text-[11px] shadow-none focus:ring-0"
                      aria-label="对比目标"
                      data-testid="compare-select"
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        <SelectLabel className="text-[10px]">我的预设</SelectLabel>
                        {saved.length === 0 ? (
                          <p className="px-2 py-1 text-[10px] text-muted-foreground">（空）</p>
                        ) : (
                          saved.map(p => (
                            <SelectItem
                              key={`saved:${p.id}`}
                              value={`saved:${p.id}`}
                              className="text-xs"
                            >
                              {p.name}
                            </SelectItem>
                          ))
                        )}
                      </SelectGroup>
                      {CATEGORIES.map(cat => (
                        <SelectGroup key={cat}>
                          <SelectLabel className="text-[10px]">{cat}样式</SelectLabel>
                          {PRESETS.filter(p => p.category === cat).map(p => (
                            <SelectItem
                              key={`style:${p.id}`}
                              value={`style:${p.id}`}
                              className="text-xs"
                            >
                              {p.name}
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 shrink-0 px-2 text-[11px]"
                    onClick={() => setCompareOn(false)}
                    data-testid="compare-close"
                  >
                    关闭
                  </Button>
                </div>
              )}

              {/* stage */}
              <div
                ref={stageRef}
                data-testid="glass-stage"
                className="relative min-h-[560px] flex-1 overflow-hidden rounded-2xl border shadow-inner"
                style={bgStyle}
                onPointerMove={onStagePointerMove}
              >
                {compareOn ? (
                  <>
                    {/* A pane — current live config */}
                    <div
                      data-testid="compare-pane-a"
                      className="absolute inset-0"
                      style={{ ...bgStyle, clipPath: clipA }}
                    >
                      <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                        <GlassDemoCard
                          config={config}
                          dark={darkContent || config.overLight}
                        />
                      </div>
                      <div className="absolute left-3 top-3 rounded-md bg-black/45 px-2 py-1 text-[10px] font-medium text-white backdrop-blur-sm">
                        A · 当前配置
                      </div>
                    </div>

                    {/* B pane — compare target (independent bg copy: each
                        pane's backdrop-filter samples only its own layer) */}
                    <div
                      data-testid="compare-pane-b"
                      className="absolute inset-0"
                      style={{ ...bgStyle, clipPath: clipB }}
                    >
                      <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                        <GlassDemoCard
                          config={compareB.config}
                          dark={darkContent || compareB.config.overLight}
                        />
                      </div>
                      <div
                        className="absolute rounded-md bg-black/45 px-2 py-1 text-[10px] font-medium text-white backdrop-blur-sm"
                        style={
                          compareAxis === 'x'
                            ? { right: 12, top: 12 }
                            : { bottom: 12, right: 12 }
                        }
                      >
                        B · {compareB.name}
                      </div>
                    </div>

                    {/* draggable divider (pointer + keyboard, 5%..95%) */}
                    <div
                      role="slider"
                      tabIndex={0}
                      data-testid="compare-divider"
                      aria-label="对比分割位置"
                      aria-orientation={compareAxis === 'x' ? 'horizontal' : 'vertical'}
                      aria-valuemin={5}
                      aria-valuemax={95}
                      aria-valuenow={Math.round(compareSplit)}
                      onPointerDown={onDividerPointerDown}
                      onPointerMove={onDividerPointerMove}
                      onPointerUp={onDividerDragEnd}
                      onPointerCancel={onDividerDragEnd}
                      onKeyDown={onDividerKeyDown}
                      className={`group absolute z-20 flex touch-none items-center justify-center outline-none focus-visible:ring-2 focus-visible:ring-teal-500 ${
                        compareAxis === 'x'
                          ? 'inset-y-0 w-10 -translate-x-1/2 cursor-col-resize'
                          : 'inset-x-0 h-10 -translate-y-1/2 cursor-row-resize'
                      }`}
                      style={
                        compareAxis === 'x'
                          ? { left: `${compareSplit}%` }
                          : { top: `${compareSplit}%` }
                      }
                    >
                      <span
                        aria-hidden
                        className={
                          compareAxis === 'x'
                            ? 'h-full w-[2px] bg-white/70 shadow-[0_0_6px_rgba(0,0,0,0.35)]'
                            : 'h-[2px] w-full bg-white/70 shadow-[0_0_6px_rgba(0,0,0,0.35)]'
                        }
                      />
                      <span
                        aria-hidden
                        className="absolute flex h-9 w-9 items-center justify-center rounded-full bg-white text-slate-700 shadow-xl ring-1 ring-black/10 transition-transform group-active:scale-95"
                      >
                        {compareAxis === 'x' ? (
                          <GripVertical className="h-4 w-4" />
                        ) : (
                          <GripHorizontal className="h-4 w-4" />
                        )}
                      </span>
                    </div>
                  </>
                ) : (
                  <>
                    {/* draggable demo card — flex 居中，不依赖卡高硬编码 */}
                    <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
                      <motion.div
                        ref={dragCardRef}
                        drag
                        dragConstraints={stageRef}
                        dragElastic={config.elasticity}
                        dragMomentum={false}
                        whileDrag={{ scale: 1.03 }}
                        transition={dragBounceTransition}
                        onDrag={onSquashDrag}
                        onDragEnd={onSquashDragEnd}
                        className="pointer-events-auto cursor-grab active:cursor-grabbing"
                        data-testid="draggable-card"
                      >
                        {/* Phase 16 M1: squash wrapper — springs hold the
                            anisotropic scale; identity at rest (no transform) */}
                        <motion.div
                          style={squashActive ? { scaleX: squashX, scaleY: squashY } : undefined}
                        >
                          <GlassDemoCard config={config} dark={darkContent || config.overLight} />
                        </motion.div>
                      </motion.div>
                    </div>

                    {/* floating pills */}
                    <motion.div
                      drag
                      dragConstraints={stageRef}
                      dragElastic={config.elasticity}
                      transition={dragBounceTransition}
                      onDrag={onSquashDrag}
                      onDragEnd={onSquashDragEnd}
                      className="absolute left-6 top-6 z-10 cursor-grab active:cursor-grabbing"
                    >
                      <motion.div
                        style={squashActive ? { scaleX: squashX, scaleY: squashY } : undefined}
                      >
                        <GlassPill config={config} label="液态玻璃 · live" dark={bg.dark} />
                      </motion.div>
                    </motion.div>
                    <motion.div
                      drag
                      dragConstraints={stageRef}
                      dragElastic={config.elasticity}
                      transition={dragBounceTransition}
                      onDrag={onSquashDrag}
                      onDragEnd={onSquashDragEnd}
                      className="absolute bottom-6 right-6 z-10 cursor-grab active:cursor-grabbing"
                    >
                      <motion.div
                        style={squashActive ? { scaleX: squashX, scaleY: squashY } : undefined}
                      >
                        <GlassPill config={config} label="拖我试试 ↕" dark={bg.dark} />
                      </motion.div>
                    </motion.div>

                    {/* corner hint */}
                    <div className="absolute bottom-3 left-3 max-w-[60%] truncate rounded-md bg-black/35 px-2 py-1 text-[10px] text-white backdrop-blur-sm">
                      {bg.name} · 位移贴图 {config.refraction}px · 7-tap 色散{' '}
                      {Math.round(config.dispersion * 100)}%
                    </div>
                  </>
                )}
              </div>
            </CardShell>
          </section>

          {/* ---------- Right: controls + saved ---------- */}
          <aside className="order-3 min-w-0">
            <CardShell icon={<Settings2 className="h-3.5 w-3.5" />} title="参数控制台">
              {/* Phase 4 M2: undo/redo toolbar */}
              <div className="mb-2 flex items-center justify-between gap-2">
                <div className="flex items-center gap-0.5">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    aria-label="撤销"
                    title="撤销 (Z)"
                    data-testid="undo-btn"
                    disabled={historyDepth.undo === 0 || compareOn}
                    onClick={undo}
                  >
                    <Undo2 className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    aria-label="重做"
                    title="重做 (Shift+Z)"
                    data-testid="redo-btn"
                    disabled={historyDepth.redo === 0 || compareOn}
                    onClick={redo}
                  >
                    <Redo2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
                <div className="flex items-center gap-1.5">
                  {historyDepth.undo > 0 && (
                    <span
                      className="text-[10px] tabular-nums text-muted-foreground"
                      data-testid="history-depth"
                    >
                      可撤销 {historyDepth.undo} 步
                    </span>
                  )}
                  {/* Phase 4 M3: inspiration generator */}
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 gap-1 px-2 text-xs"
                    aria-label="从当前参数生成变体"
                    title="变体：基于当前参数 ±15% 微调（锁定项不变）"
                    data-testid="variant-btn"
                    disabled={compareOn}
                    onClick={variantConfig}
                  >
                    <Wand2 className="h-3.5 w-3.5" />
                    变体
                  </Button>
                  <Button
                    size="sm"
                    className="h-7 gap-1 px-2 text-xs"
                    aria-label="随机灵感"
                    title="随机灵感 (R)：在审美区间内随机全部参数（锁定项不变）"
                    data-testid="randomize-btn"
                    disabled={compareOn}
                    onClick={randomizeConfig}
                  >
                    <Dices className="h-3.5 w-3.5" />
                    随机灵感
                  </Button>
                  {/* Phase 13 M3: shortcut help */}
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    aria-label="键盘快捷键 (?)"
                    title="键盘快捷键 (?)"
                    data-testid="help-btn"
                    onClick={() => setHelpOpen(true)}
                  >
                    <Keyboard className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
              <Tabs defaultValue="params">
                <TabsList className="mb-4 grid w-full grid-cols-3">
                  <TabsTrigger value="params" className="text-xs">
                    参数
                  </TabsTrigger>
                  <TabsTrigger value="export" className="text-xs">
                    导出
                  </TabsTrigger>
                  <TabsTrigger value="saved" className="text-xs">
                    我的预设
                  </TabsTrigger>
                </TabsList>
                <TabsContent value="params">
                  <ConfigPanel
                    config={config}
                    onChange={patch}
                    darkContent={darkContent}
                    onDarkContentChange={setDarkContent}
                    onHistoryCheckpoint={pushHistory}
                    lockedParams={lockedParams}
                    onToggleLock={toggleLock}
                  />
                  <Separator className="my-4" />
                  <div className="flex items-center gap-2">
                    <Input
                      value={presetName}
                      onChange={e => setPresetName(e.target.value)}
                      placeholder="预设名称…"
                      className="h-9 text-xs"
                      maxLength={48}
                      aria-label="预设名称"
                    />
                    <Button
                      size="sm"
                      onClick={savePreset}
                      disabled={saving}
                      className="h-9 shrink-0 gap-1 text-xs"
                      data-testid="save-preset"
                    >
                      {saving ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Save className="h-3.5 w-3.5" />
                      )}
                      保存
                    </Button>
                  </div>
                </TabsContent>
                <TabsContent value="export">
                  <ExportPanel config={config} bg={bg} onImportConfig={handleImportConfig} />
                </TabsContent>
                <TabsContent value="saved">
                  {/* Phase 4 M1: search + sort header */}
                  <div className="mb-2 flex items-center gap-2">
                    <div className="relative min-w-0 flex-1">
                      <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        value={presetQuery}
                        onChange={e => setPresetQuery(e.target.value)}
                        placeholder="搜索预设…"
                        className="h-8 pl-8 text-xs"
                        maxLength={48}
                        aria-label="搜索预设"
                        data-testid="preset-search"
                      />
                    </div>
                    <Select
                      value={sortMode}
                      onValueChange={v => setSortMode(v as PresetSort)}
                    >
                      <SelectTrigger
                        className="h-8 w-[104px] shrink-0 text-xs"
                        aria-label="预设排序"
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="recent">最新</SelectItem>
                        <SelectItem value="name">名称</SelectItem>
                        <SelectItem value="favorites">收藏优先</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  {/* Phase 6 M2: visibility slice chips (signed-in only) */}
                  {session?.user && (
                    <div
                      className="mb-2 flex gap-1.5"
                      role="group"
                      aria-label="预设视图筛选"
                      data-testid="view-chips"
                    >
                      {(
                        [
                          { id: 'all', label: '全部' },
                          { id: 'mine', label: '我的' },
                          { id: 'public', label: '公共' },
                        ] as const
                      ).map(v => (
                        <button
                          key={v.id}
                          aria-pressed={viewMode === v.id}
                          onClick={() => setViewMode(v.id)}
                          data-testid={`view-${v.id}`}
                          className={`rounded-full border px-2.5 py-0.5 text-[11px] font-medium transition-colors ${
                            viewMode === v.id
                              ? 'border-teal-500 bg-teal-500/10 text-teal-600'
                              : 'text-muted-foreground hover:border-teal-500/40 hover:text-foreground'
                          }`}
                        >
                          {v.label}
                        </button>
                      ))}
                    </div>
                  )}
                  <div className="max-h-96 space-y-2 overflow-y-auto pr-1 glass-scroll">
                    {loadingSaved ? (
                      <div className="flex items-center justify-center py-10 text-xs text-muted-foreground">
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" /> 加载中…
                      </div>
                    ) : saved.length === 0 ? (
                      <div className="flex flex-col items-center gap-2 py-10 text-center text-xs text-muted-foreground">
                        <Backpack className="h-8 w-8 opacity-40" />
                        {debouncedQuery ? '没有匹配的预设' : '还没有保存的预设'}
                        <span className="text-[10px]">
                          {debouncedQuery
                            ? '换个关键词试试'
                            : '调好参数后点「保存」试试'}
                        </span>
                      </div>
                    ) : (
                      saved.map(p => (
                        <div
                          key={p.id}
                          className="flex items-center gap-2 rounded-xl border p-2 transition-colors hover:bg-muted/40"
                        >
                          <button
                            onClick={() => {
                              pushHistory()
                              setConfig({ ...DEFAULT_CONFIG, ...p.config })
                              setActivePreset('')
                              setDarkContent(
                                p.config.tintOpacity > 0.3 && isDarkColor(p.config.tint)
                              )
                              toast({ title: '已载入预设', description: p.name })
                            }}
                            className="flex min-w-0 flex-1 items-center gap-2 text-left"
                            data-testid="apply-saved"
                          >
                            {p.cover ? (
                              <img
                                src={p.cover}
                                alt={`预设封面：${p.name}`}
                                className="h-8 w-10 shrink-0 rounded-lg border object-cover"
                                loading="lazy"
                                data-testid="preset-cover"
                              />
                            ) : (
                              <span
                                className="h-8 w-10 shrink-0 rounded-lg"
                                style={{
                                  background: `linear-gradient(135deg, ${p.config.tint}, ${p.config.glow !== 'transparent' ? p.config.glow : '#94a3b8'})`,
                                }}
                                aria-hidden
                              />
                            )}
                            <span className="min-w-0">
                              <span className="block truncate text-xs font-medium">{p.name}</span>
                              <span className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                                {/* Phase 6 M2: ownership badge (signed-in only) */}
                                {session?.user && (
                                  <span
                                    className={cn(
                                      'shrink-0 rounded-full border px-1.5 py-px text-[9px] leading-none font-medium',
                                      p.mine
                                        ? 'border-teal-500/40 bg-teal-500/10 text-teal-600'
                                        : 'border-border bg-muted/60 text-muted-foreground'
                                    )}
                                    data-testid="ownership-badge"
                                  >
                                    {p.mine ? '我的' : '公共'}
                                  </span>
                                )}
                                折射 {p.config.refraction}px · 模糊 {p.config.blur}px
                              </span>
                            </span>
                          </button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className={cn(
                              'h-7 w-7 shrink-0',
                              p.favorite
                                ? 'text-amber-500 hover:text-amber-500'
                                : 'text-muted-foreground/60'
                            )}
                            aria-label={p.favorite ? `取消收藏 ${p.name}` : `收藏 ${p.name}`}
                            aria-pressed={p.favorite}
                            title={p.favorite ? '取消收藏' : '收藏'}
                            data-testid="toggle-favorite"
                            disabled={togglingFavId === p.id}
                            onClick={() => toggleFavorite(p)}
                          >
                            {togglingFavId === p.id ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <Star
                                className={cn('h-3.5 w-3.5', p.favorite && 'fill-current')}
                              />
                            )}
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 shrink-0"
                            aria-label={`载入参数 ${p.name}`}
                            title="载入参数"
                            onClick={() => {
                              pushHistory()
                              setConfig({ ...DEFAULT_CONFIG, ...p.config })
                              // Mirror the row's main entry point (#55):
                              // clear the active chip and recompute the
                              // content color for the loaded tint.
                              setActivePreset('')
                              setDarkContent(
                                p.config.tintOpacity > 0.3 && isDarkColor(p.config.tint)
                              )
                              toast({ title: '已载入参数', description: p.name })
                            }}
                          >
                            <Import className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 shrink-0 text-destructive"
                            aria-label={`删除 ${p.name}`}
                            data-testid="delete-saved"
                            disabled={deletingId === p.id}
                            onClick={() => deletePreset(p.id)}
                          >
                            {deletingId === p.id ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <Trash2 className="h-3.5 w-3.5" />
                            )}
                          </Button>
                        </div>
                      ))
                    )}
                  </div>
                  {/* Phase 4 M1: surface silent truncation (take-limit or
                      corrupted rows skipped) instead of hiding it. */}
                  {totalSaved > saved.length && (
                    <p
                      className="pt-2 text-center text-[10px] text-muted-foreground"
                      data-testid="preset-truncated"
                    >
                      共 {totalSaved} 条，当前显示 {saved.length} 条
                    </p>
                  )}
                </TabsContent>
              </Tabs>
            </CardShell>
          </aside>
        </div>
      </main>

      <AuthDialog open={authOpen} onOpenChange={setAuthOpen} />

      {/* ---------- Phase 13 M3: shortcut help dialog (Phase 16 M2: remap) ---------- */}
      {/* #116: closing the dialog by ANY path (outside click, titlebar ✕,
          Esc beyond the remap-capture) must disarm a pending remap — the
          armed capture listener would otherwise silently swallow and bind
          the next single keystroke with no visible UI hint. */}
      <Dialog
        open={helpOpen}
        onOpenChange={open => {
          setHelpOpen(open)
          if (!open) setRemapping(null)
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-1.5 text-sm">
              <Keyboard className="h-4 w-4" aria-hidden />
              键盘快捷键
            </DialogTitle>
            <DialogDescription className="text-xs">
              输入框/色板聚焦时自动让位；带修饰键的组合仍归浏览器（Ctrl+Z 等照常可用）。
              点「换键」后按新键即可重绑（Esc 取消）。
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-1.5">
            {KEYBIND_ACTIONS.map(action => {
              const isRemapping = remapping === action.id
              const isCustom = keybinds[action.id] !== DEFAULT_KEYBINDS[action.id]
              return (
                <div
                  key={action.id}
                  className={`flex items-center justify-between gap-3 rounded-lg border px-2.5 py-1.5 transition-colors ${
                    isRemapping
                      ? 'border-teal-500/60 bg-teal-500/10'
                      : 'border-border/60'
                  }`}
                >
                  <span className="text-xs text-muted-foreground">
                    {action.desc}
                    {isCustom && (
                      <span className="ml-1.5 rounded-full bg-teal-500/15 px-1.5 py-0.5 text-[9px] font-medium text-teal-600 dark:text-teal-400">
                        自定义
                      </span>
                    )}
                  </span>
                  <span className="flex items-center gap-1.5">
                    <kbd
                      className={`rounded-md border border-border bg-muted px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase text-foreground shadow-[inset_0_-1px_0_0_rgba(0,0,0,0.08)] ${
                        isRemapping ? 'animate-pulse border-teal-500/70 text-teal-600 dark:text-teal-400' : ''
                      }`}
                    >
                      {keybinds[action.id]}
                    </kbd>
                    <Button
                      variant="ghost"
                      size="sm"
                      className={`h-6 px-2 text-[10px] ${
                        isRemapping ? 'text-teal-600 dark:text-teal-400' : 'text-muted-foreground'
                      }`}
                      aria-pressed={isRemapping}
                      data-testid={`remap-${action.id}`}
                      onClick={() => setRemapping(isRemapping ? null : action.id)}
                    >
                      {isRemapping ? (
                        <>
                          <Loader2 className="mr-0.5 h-3 w-3 animate-spin" aria-hidden />
                          按新键…
                        </>
                      ) : (
                        <>
                          <Pencil className="mr-0.5 h-3 w-3" aria-hidden />
                          换键
                        </>
                      )}
                    </Button>
                  </span>
                </div>
              )
            })}
            {/* Fixed rows (never remappable) */}
            <div className="flex items-center justify-between gap-3 rounded-lg border border-dashed border-border/50 px-2.5 py-1.5">
              <span className="text-xs text-muted-foreground">
                重做（跟随撤销键）
              </span>
              <span className="flex items-center gap-1">
                <kbd className="rounded-md border border-border bg-muted px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase text-foreground shadow-[inset_0_-1px_0_0_rgba(0,0,0,0.08)]">
                  Shift
                </kbd>
                <kbd className="rounded-md border border-border bg-muted px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase text-foreground shadow-[inset_0_-1px_0_0_rgba(0,0,0,0.08)]">
                  {keybinds.undo}
                </kbd>
              </span>
            </div>
            <div className="flex items-center justify-between gap-3 rounded-lg border border-dashed border-border/50 px-2.5 py-1.5">
              <span className="text-xs text-muted-foreground">关闭弹层/帮助</span>
              <span className="flex items-center gap-1">
                <kbd className="rounded-md border border-border bg-muted px-1.5 py-0.5 font-mono text-[10px] font-semibold text-foreground shadow-[inset_0_-1px_0_0_rgba(0,0,0,0.08)]">
                  Esc
                </kbd>
              </span>
            </div>
          </div>
          <div className="flex items-center justify-between">
            <p className="text-[10px] leading-relaxed text-muted-foreground">
              触屏无键盘？所有功能均有对应的屏幕控件——快捷键只是效率增强，不是唯一路径。
              自定义保存在本机浏览器。
            </p>
            <Button
              variant="outline"
              size="sm"
              className="h-7 shrink-0 px-2.5 text-[10px]"
              data-testid="keybind-reset"
              onClick={resetKeybinds}
            >
              <RotateCcw className="mr-1 h-3 w-3" aria-hidden />
              恢复默认
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ---------- Sticky footer ---------- */}
      <footer className="mt-auto border-t border-white/10 bg-background/70 py-4 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-1.5 px-4 text-[11px] text-muted-foreground sm:flex-row">
          <span>
            玻璃实验室 GlassLab · 液态玻璃算法移植自{' '}
            <a
              className="font-medium underline decoration-dotted underline-offset-2"
              href="https://github.com/Kyant0/AndroidLiquidGlass"
              target="_blank"
              rel="noreferrer"
            >
              Kyant0/AndroidLiquidGlass
            </a>{' '}
            (Apache-2.0)
          </span>
          <span>{PHASE_FOOTER} · 样式库 {PRESETS.length} 款</span>
        </div>
      </footer>
    </div>
  )
}
