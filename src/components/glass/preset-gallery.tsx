'use client'

/*
 * PresetGallery (Phase 11 M3) — the style library's "gallery" view.
 *
 * Every preset renders a live canvas approximation of itself (the same
 * cover.ts pipeline used for saved-preset covers) over the currently
 * selected stage background — what you see is what applying gives you.
 *
 * Rendering is lazy: an IntersectionObserver generates a cover only when
 * its card scrolls near the viewport, through a serialized promise queue
 * (one canvas at a time, so the gallery never janks the stage).
 * Covers are cached per (background, preset) pair and invalidated when
 * the stage background changes. A failed render silently falls back to
 * the preset's CSS swatch — the gallery can never block or crash.
 *
 * Phase 12 M3: hovering (or keyboard-focusing) a card opens a magnified
 * Popover preview — the same cached cover at full 400×240 resolution
 * plus a row of core-parameter chips (refraction / thickness /
 * dispersion, motion badge when applicable). The 120ms hover-intent
 * timer keeps fast pointer sweeps from strobing popovers; focus opens
 * instantly for keyboard users.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { Sparkles } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { generateGlassCover, type CoverBackgroundSpec } from '@/lib/glass/cover'
import { isMotionConfig, type GlassConfig, type GlassPreset } from '@/lib/glass/presets'

interface PresetGalleryProps {
  presets: GlassPreset[]
  activePreset: string
  onApply: (p: GlassPreset) => void
  /** stage background spec the covers sample from */
  coverSpec: CoverBackgroundSpec
  /** changes when the stage background changes — invalidates the cache */
  bgKey: string
}

/** Motion badge shared by both views (gallery bottom-right / list on swatch). */
export function MotionBadge({ className = '' }: { className?: string }) {
  return (
    <span
      className={`flex items-center gap-0.5 rounded-full bg-black/55 px-1.5 py-0.5 text-[9px] font-medium text-teal-200 backdrop-blur-sm ${className}`}
    >
      <Sparkles className="h-2.5 w-2.5" aria-hidden />
      动效
    </span>
  )
}

/** Core-parameter chip for the magnified preview (tabular for scanability). */
function ParamChip({ label, value }: { label: string; value: string }) {
  return (
    <span className="inline-flex items-baseline gap-1 rounded-md bg-muted/70 px-1.5 py-0.5 text-[10px] leading-none text-muted-foreground">
      <span>{label}</span>
      <span className="font-semibold tabular-nums text-foreground">{value}</span>
    </span>
  )
}

const HOVER_INTENT_MS = 120

function GalleryCard({
  preset,
  active,
  onApply,
  cover,
  registerRef,
}: {
  preset: GlassPreset
  active: boolean
  onApply: (p: GlassPreset) => void
  /** cached cover data URL (undefined until the lazy render reaches it) */
  cover?: string
  registerRef: (el: HTMLButtonElement | null) => void
}) {
  const [open, setOpen] = useState(false)
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(
    () => () => {
      if (hoverTimer.current) clearTimeout(hoverTimer.current)
    },
    []
  )
  const openSoon = () => {
    if (hoverTimer.current) clearTimeout(hoverTimer.current)
    hoverTimer.current = setTimeout(() => setOpen(true), HOVER_INTENT_MS)
  }
  const closeNow = () => {
    if (hoverTimer.current) clearTimeout(hoverTimer.current)
    setOpen(false)
  }

  const cfg = preset.config
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          ref={registerRef}
          data-gallery-id={preset.id}
          data-active={active}
          data-testid={`gallery-${preset.id}`}
          onClick={() => onApply(preset)}
          onMouseEnter={openSoon}
          onMouseLeave={closeNow}
          onFocus={() => setOpen(true)}
          onBlur={closeNow}
          // Focus stays on the trigger (the popover's openAutoFocus is
          // suppressed), which is outside radix's DismissableLayer — so its
          // built-in Escape handling never sees the keystroke. Close here.
          onKeyDown={e => {
            if (e.key === 'Escape' && open) {
              e.stopPropagation()
              closeNow()
            }
          }}
          className="group relative overflow-hidden rounded-xl border text-left transition-all hover:border-teal-500/50 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 data-[active=true]:border-teal-500 data-[active=true]:ring-2 data-[active=true]:ring-teal-500/30"
        >
          <span
            className="relative block aspect-[5/3] w-full overflow-hidden"
            style={{ background: preset.swatch }}
            aria-hidden
          >
            {cover ? (
              <img
                src={cover}
                alt=""
                loading="lazy"
                decoding="async"
                className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.04]"
              />
            ) : (
              <span className="absolute inset-0 animate-pulse bg-white/0" />
            )}
          </span>
          {isMotionConfig(preset.config) && (
            <MotionBadge className="absolute right-1.5 top-1.5" />
          )}
          <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 via-black/35 to-transparent px-2 pb-1.5 pt-5">
            <span className="block truncate text-[11px] font-medium text-white">
              {preset.name}
            </span>
          </span>
        </button>
      </PopoverTrigger>
      <PopoverContent
        // Keep focus on the trigger — stealing it would blur-close the
        // popover the instant focus opens it.
        onOpenAutoFocus={e => e.preventDefault()}
        side="right"
        align="start"
        sideOffset={10}
        collisionPadding={12}
        className="w-[300px] rounded-xl p-2.5 shadow-xl"
        aria-label={`${preset.name} 预览`}
      >
        <div
          className="relative aspect-[5/3] w-full overflow-hidden rounded-lg border-border/60"
          style={{ background: preset.swatch }}
        >
          {cover ? (
            <img
              src={cover}
              alt=""
              decoding="async"
              className="h-full w-full object-cover"
            />
          ) : (
            <span className="absolute inset-0 animate-pulse bg-white/0" />
          )}
          {isMotionConfig(preset.config) && (
            <MotionBadge className="absolute right-2 top-2" />
          )}
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <ParamChip label="折射" value={`${cfg.refraction}px`} />
          <ParamChip label="厚度" value={`${cfg.height}px`} />
          <ParamChip label="色散" value={`${Math.round((cfg.dispersion ?? 0) * 100)}%`} />
        </div>
        <p className="mt-1.5 text-[11px] leading-snug text-muted-foreground">
          <span className="font-medium text-foreground">{preset.name}</span>
          {' · '}
          {preset.desc}
        </p>
      </PopoverContent>
    </Popover>
  )
}

export function PresetGallery({
  presets,
  activePreset,
  onApply,
  coverSpec,
  bgKey,
}: PresetGalleryProps) {
  const [covers, setCovers] = useState<Record<string, string>>({})
  /** (bgKey:presetId) → data URL — survives category flips within a bg */
  const cacheRef = useRef(new Map<string, string>())
  const cardRefs = useRef(new Map<string, HTMLElement>())
  const pendingRef = useRef(new Set<string>())
  /** serialized generation queue — one canvas at a time */
  const queueRef = useRef<Promise<unknown>>(Promise.resolve())
  const specRef = useRef(coverSpec)
  useEffect(() => {
    specRef.current = coverSpec
  }, [coverSpec])

  const generate = useCallback(
    (id: string, config: GlassConfig) => {
      if (pendingRef.current.has(id)) return
      const key = `${bgKey}:${id}`
      const cached = cacheRef.current.get(key)
      if (cached) {
        setCovers(prev => (prev[id] === cached ? prev : { ...prev, [id]: cached }))
        return
      }
      pendingRef.current.add(id)
      queueRef.current = queueRef.current
        .then(async () => {
          const url = await generateGlassCover(specRef.current, config)
          if (url) {
            cacheRef.current.set(key, url)
            setCovers(prev => (prev[id] === url ? prev : { ...prev, [id]: url }))
          }
        })
        .catch(() => {
          /* covers are optional — a failure just keeps the CSS swatch */
        })
        .finally(() => {
          pendingRef.current.delete(id)
        })
    },
    [bgKey]
  )

  // Background switch: drop the rendered covers (cache stays warm per-bg,
  // so flipping back is instant) — the observer effect below re-fires for
  // every mounted card and regenerates them against the new background.
  // rAF-wrapped per the lab's set-state-in-effect convention.
  useEffect(() => {
    const raf = requestAnimationFrame(() => setCovers({}))
    return () => cancelAnimationFrame(raf)
  }, [bgKey])

  // Lazy generation: observe every card, generate on approach. Re-runs when
  // the filtered preset list or the background changes — a fresh observer
  // delivers an initial isIntersecting notification for each observed card,
  // which is exactly the "regenerate visible cards on bg switch" trigger.
  useEffect(() => {
    const observer = new IntersectionObserver(
      entries => {
        for (const en of entries) {
          const id = (en.target as HTMLElement).dataset.galleryId
          if (!id) continue
          if (!en.isIntersecting) continue
          const preset = presets.find(p => p.id === id)
          if (preset && !cacheRef.current.has(`${bgKey}:${id}`)) {
            generate(id, preset.config)
          }
        }
      },
      { root: null, rootMargin: '200px 0px' }
    )
    for (const el of cardRefs.current.values()) observer.observe(el)
    return () => observer.disconnect()
  }, [presets, bgKey, generate])

  return (
    <div
      className="grid grid-cols-2 gap-2"
      data-testid="preset-gallery"
    >
      {presets.map(p => (
        <GalleryCard
          key={p.id}
          preset={p}
          active={activePreset === p.id}
          onApply={onApply}
          cover={covers[p.id]}
          registerRef={el => {
            if (el) cardRefs.current.set(p.id, el)
            else cardRefs.current.delete(p.id)
          }}
        />
      ))}
    </div>
  )
}
