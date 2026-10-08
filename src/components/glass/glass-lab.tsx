'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import {
  Backpack,
  Copy,
  Loader2,
  MousePointer2,
  Palette,
  Save,
  Settings2,
  Sparkles,
  Trash2,
} from 'lucide-react'
import { toast } from '@/hooks/use-toast'

import { Slider } from '@/components/ui/slider'
import { Switch } from '@/components/ui/switch'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { GlassDemoCard, GlassPill } from '@/components/glass/glass-demo-card'
import {
  DEFAULT_CONFIG,
  PRESETS,
  type GlassConfig,
  type GlassPreset,
} from '@/lib/glass/presets'

interface BackgroundOption {
  id: string
  name: string
  /** css background for the stage */
  css?: string
  /** image url for the stage */
  url?: string
  /** css background for the thumbnail */
  thumb: string
}

interface SavedPreset {
  id: string
  name: string
  config: GlassConfig
  createdAt: string
}

const BACKGROUNDS: BackgroundOption[] = [
  {
    id: 'mesh',
    name: '色域网格',
    css: 'radial-gradient(at 20% 30%, #fda4af 0px, transparent 55%), radial-gradient(at 80% 20%, #67e8f9 0px, transparent 50%), radial-gradient(at 70% 80%, #fdba74 0px, transparent 50%), radial-gradient(at 15% 85%, #c4b5fd 0px, transparent 55%), linear-gradient(120deg, #f8fafc, #eef2ff)',
    thumb:
      'radial-gradient(at 20% 30%, #fda4af 0px, transparent 55%), radial-gradient(at 80% 20%, #67e8f9 0px, transparent 50%), linear-gradient(120deg,#f8fafc,#eef2ff)',
  },
  {
    id: 'aurora',
    name: '极光',
    url: '/backgrounds/aurora.png',
    thumb: 'linear-gradient(135deg,#134e4a,#10b981,#7c3aed)',
  },
  {
    id: 'fluid',
    name: '流彩',
    url: '/backgrounds/fluid.png',
    thumb: 'linear-gradient(135deg,#fb923c,#ec4899,#14b8a6)',
  },
  {
    id: 'sunset',
    name: '落日',
    url: '/backgrounds/sunset.png',
    thumb: 'linear-gradient(135deg,#f59e0b,#f43f5e,#38bdf8)',
  },
  {
    id: 'neoncity',
    name: '霓虹',
    url: '/backgrounds/neoncity.png',
    thumb: 'linear-gradient(135deg,#312e81,#db2777,#06b6d4)',
  },
  {
    id: 'dark',
    name: '暗夜',
    css: 'radial-gradient(at 30% 20%, #1e3a5f 0px, transparent 60%), radial-gradient(at 75% 70%, #3b0764 0px, transparent 55%), linear-gradient(160deg, #020617, #0f172a)',
    thumb: 'linear-gradient(135deg,#0f172a,#1e3a5f,#3b0764)',
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
  | 'elasticity'
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
  { key: 'elasticity', label: '拖拽弹性', min: 0, max: 1, step: 0.05, fmt: v => `${Math.round(v * 100)}%` },
]

function isDarkTint(hex: string): boolean {
  const m = hex.replace('#', '')
  if (m.length < 6) return false
  const num = parseInt(m.slice(0, 6), 16)
  const r = (num >> 16) & 255
  const g = (num >> 8) & 255
  const b = num & 255
  return (r * 299 + g * 587 + b * 114) / 1000 < 128
}

function ConfigPanel({
  config,
  onChange,
  darkContent,
  onDarkContentChange,
}: {
  config: GlassConfig
  onChange: (patch: Partial<GlassConfig>) => void
  darkContent: boolean
  onDarkContentChange: (v: boolean) => void
}) {
  return (
    <div className="space-y-5" data-testid="config-panel">
      {PARAM_ROWS.map(r => (
        <div key={r.key} className="space-y-2">
          <div className="flex items-center justify-between">
            <Label className="text-xs text-muted-foreground">{r.label}</Label>
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
            onValueChange={([v]) => onChange({ [r.key]: v } as Partial<GlassConfig>)}
          />
        </div>
      ))}

      <Separator />

      <div className="flex items-center justify-between">
        <div>
          <Label className="text-xs">深度形变</Label>
          <p className="text-[11px] text-muted-foreground">Kyant0 depthEffect 径向拉扯</p>
        </div>
        <Switch
          checked={config.depthEffect}
          aria-label="深度形变"
          onCheckedChange={v => onChange({ depthEffect: v })}
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
          onCheckedChange={v => onChange({ overLight: v })}
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

export function GlassLab() {
  const [config, setConfig] = useState<GlassConfig>(DEFAULT_CONFIG)
  const [activePreset, setActivePreset] = useState<string>('ios-clear')
  const [bg, setBg] = useState<BackgroundOption>(BACKGROUNDS[0])
  const [darkContent, setDarkContent] = useState(false)
  const [presetName, setPresetName] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState<SavedPreset[]>([])
  const [loadingSaved, setLoadingSaved] = useState(true)

  const stageRef = useRef<HTMLDivElement>(null)

  const patch = useCallback((p: Partial<GlassConfig>) => {
    setConfig(c => ({ ...c, ...p }))
    setActivePreset('')
  }, [])

  const applyPreset = useCallback((p: GlassPreset) => {
    setConfig({ ...p.config })
    setActivePreset(p.id)
    setDarkContent(p.config.tintOpacity > 0.3 && isDarkTint(p.config.tint))
  }, [])

  // ---- saved presets (API) ----
  const fetchSaved = useCallback(async () => {
    try {
      setLoadingSaved(true)
      const res = await fetch('/api/presets')
      if (!res.ok) throw new Error('加载失败')
      const data = (await res.json()) as SavedPreset[]
      setSaved(data)
    } catch {
      toast({ title: '预设加载失败', description: '请稍后重试' })
    } finally {
      setLoadingSaved(false)
    }
  }, [])

  useEffect(() => {
    fetchSaved()
  }, [fetchSaved])

  const savePreset = useCallback(async () => {
    const name =
      presetName.trim() ||
      `我的玻璃 ${new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}`
    setSaving(true)
    try {
      const res = await fetch('/api/presets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, config }),
      })
      if (!res.ok) throw new Error('保存失败')
      setPresetName('')
      toast({ title: '预设已保存', description: name })
      fetchSaved()
    } catch {
      toast({ title: '保存失败', description: '请检查网络后重试' })
    } finally {
      setSaving(false)
    }
  }, [config, presetName, fetchSaved])

  const deletePreset = useCallback(
    async (id: string) => {
      try {
        const res = await fetch(`/api/presets/${id}`, { method: 'DELETE' })
        if (!res.ok) throw new Error()
        setSaved(list => list.filter(p => p.id !== id))
        toast({ title: '已删除预设' })
      } catch {
        toast({ title: '删除失败' })
      }
    },
    []
  )

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
          <span className="hidden rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-[10px] font-medium text-emerald-600 sm:inline-block dark:text-emerald-400">
            Phase 1 · 检查 2/5 进行中
          </span>
        </div>
      </header>

      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-5">
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-[260px_minmax(0,1fr)_320px]">
          {/* ---------- Left: style presets ---------- */}
          <aside className="order-2 min-w-0 lg:order-1">
            <CardShell icon={<Palette className="h-3.5 w-3.5" />} title="玻璃样式库" hint="12 款">
              <div className="grid max-h-[520px] grid-cols-2 gap-2 overflow-y-auto pr-1 sm:grid-cols-3 lg:grid-cols-2 glass-scroll">
                {PRESETS.map(p => (
                  <button
                    key={p.id}
                    onClick={() => applyPreset(p)}
                    data-active={activePreset === p.id}
                    data-testid={`preset-${p.id}`}
                    className="group flex flex-col items-start gap-2 rounded-xl border p-2 text-left transition-all hover:border-teal-500/50 hover:shadow-md data-[active=true]:border-teal-500 data-[active=true]:ring-2 data-[active=true]:ring-teal-500/30"
                  >
                    <span
                      className="h-10 w-full rounded-lg shadow-inner"
                      style={{ background: p.swatch }}
                      aria-hidden
                    />
                    <span className="w-full">
                      <span className="block text-xs font-medium">{p.name}</span>
                      <span className="block truncate text-[10px] text-muted-foreground">
                        {p.desc}
                      </span>
                    </span>
                  </button>
                ))}
              </div>
            </CardShell>
          </aside>

          {/* ---------- Center: stage ---------- */}
          <section className="order-1 min-w-0 lg:order-2">
            <CardShell
              icon={<MousePointer2 className="h-3.5 w-3.5" />}
              title="实验舞台"
              hint="拖动玻璃卡片 · 缩略图切换背景"
              className="flex flex-col"
            >
              {/* background switcher */}
              <div className="mb-3 flex gap-2 overflow-x-auto pb-1">
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
              </div>

              {/* stage */}
              <div
                ref={stageRef}
                data-testid="glass-stage"
                className="relative min-h-[560px] flex-1 overflow-hidden rounded-2xl border shadow-inner"
                style={
                  bg.css
                    ? { background: bg.css }
                    : {
                        backgroundImage: `url(${bg.url})`,
                        backgroundSize: 'cover',
                        backgroundPosition: 'center',
                      }
                }
              >
                {/* draggable demo card */}
                <motion.div
                  drag
                  dragConstraints={stageRef}
                  dragElastic={config.elasticity}
                  dragMomentum={false}
                  whileDrag={{ scale: 1.03 }}
                  className="absolute left-1/2 top-1/2 z-10 -ml-[160px] -mt-[180px] cursor-grab active:cursor-grabbing"
                  data-testid="draggable-card"
                >
                  <GlassDemoCard config={config} dark={darkContent || config.overLight} />
                </motion.div>

                {/* floating pills */}
                <motion.div
                  drag
                  dragConstraints={stageRef}
                  dragElastic={config.elasticity}
                  className="absolute left-6 top-6 z-10 cursor-grab active:cursor-grabbing"
                >
                  <GlassPill config={config} label="液态玻璃 · live" />
                </motion.div>
                <motion.div
                  drag
                  dragConstraints={stageRef}
                  dragElastic={config.elasticity}
                  className="absolute bottom-6 right-6 z-10 cursor-grab active:cursor-grabbing"
                >
                  <GlassPill config={config} label="拖我试试 ↕" />
                </motion.div>

                {/* corner hint */}
                <div className="absolute bottom-3 left-3 rounded-md bg-black/35 px-2 py-1 text-[10px] text-white backdrop-blur-sm">
                  {bg.name} · 位移贴图 {config.refraction}px · 色散{' '}
                  {Math.round(config.dispersion * 100)}%
                </div>
              </div>
            </CardShell>
          </section>

          {/* ---------- Right: controls + saved ---------- */}
          <aside className="order-3 min-w-0">
            <CardShell icon={<Settings2 className="h-3.5 w-3.5" />} title="参数控制台">
              <Tabs defaultValue="params">
                <TabsList className="mb-4 grid w-full grid-cols-2">
                  <TabsTrigger value="params" className="text-xs">
                    参数
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
                  />
                  <Separator className="my-4" />
                  <div className="flex items-center gap-2">
                    <Input
                      value={presetName}
                      onChange={e => setPresetName(e.target.value)}
                      placeholder="预设名称…"
                      className="h-9 text-xs"
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
                <TabsContent value="saved">
                  <div className="max-h-96 space-y-2 overflow-y-auto pr-1 glass-scroll">
                    {loadingSaved ? (
                      <div className="flex items-center justify-center py-10 text-xs text-muted-foreground">
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" /> 加载中…
                      </div>
                    ) : saved.length === 0 ? (
                      <div className="flex flex-col items-center gap-2 py-10 text-center text-xs text-muted-foreground">
                        <Backpack className="h-8 w-8 opacity-40" />
                        还没有保存的预设
                        <span className="text-[10px]">调好参数后点「保存」试试</span>
                      </div>
                    ) : (
                      saved.map(p => (
                        <div
                          key={p.id}
                          className="flex items-center gap-2 rounded-xl border p-2 transition-colors hover:bg-muted/40"
                        >
                          <button
                            onClick={() => {
                              setConfig(p.config)
                              setActivePreset('')
                              setDarkContent(
                                p.config.tintOpacity > 0.3 && isDarkTint(p.config.tint)
                              )
                            }}
                            className="flex min-w-0 flex-1 items-center gap-2 text-left"
                            data-testid="apply-saved"
                          >
                            <span
                              className="h-8 w-8 shrink-0 rounded-lg"
                              style={{
                                background: `linear-gradient(135deg, ${p.config.tint}, ${p.config.glow !== 'transparent' ? p.config.glow : '#94a3b8'})`,
                              }}
                              aria-hidden
                            />
                            <span className="min-w-0">
                              <span className="block truncate text-xs font-medium">{p.name}</span>
                              <span className="block text-[10px] text-muted-foreground">
                                折射 {p.config.refraction}px · 模糊 {p.config.blur}px
                              </span>
                            </span>
                          </button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 shrink-0"
                            aria-label={`复制 ${p.name}`}
                            onClick={() => {
                              setConfig(p.config)
                              toast({ title: '已载入参数', description: p.name })
                            }}
                          >
                            <Copy className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 shrink-0 text-destructive"
                            aria-label={`删除 ${p.name}`}
                            data-testid="delete-saved"
                            onClick={() => deletePreset(p.id)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      ))
                    )}
                  </div>
                </TabsContent>
              </Tabs>
            </CardShell>
          </aside>
        </div>
      </main>

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
          <span>第一阶段全面深度检查 · 2/5 全局样式与布局层</span>
        </div>
      </footer>
    </div>
  )
}
