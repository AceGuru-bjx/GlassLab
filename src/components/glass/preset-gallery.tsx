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
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { Sparkles } from 'lucide-react'
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
        <button
          key={p.id}
          ref={el => {
            if (el) cardRefs.current.set(p.id, el)
            else cardRefs.current.delete(p.id)
          }}
          data-gallery-id={p.id}
          data-active={activePreset === p.id}
          data-testid={`gallery-${p.id}`}
          onClick={() => onApply(p)}
          className="group relative overflow-hidden rounded-xl border text-left transition-all hover:border-teal-500/50 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 data-[active=true]:border-teal-500 data-[active=true]:ring-2 data-[active=true]:ring-teal-500/30"
        >
          <span
            className="relative block aspect-[5/3] w-full overflow-hidden"
            style={{ background: p.swatch }}
            aria-hidden
          >
            {covers[p.id] ? (
              <img
                src={covers[p.id]}
                alt=""
                loading="lazy"
                decoding="async"
                className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.04]"
              />
            ) : (
              <span className="absolute inset-0 animate-pulse bg-white/0" />
            )}
          </span>
          {isMotionConfig(p.config) && (
            <MotionBadge className="absolute right-1.5 top-1.5" />
          )}
          <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 via-black/35 to-transparent px-2 pb-1.5 pt-5">
            <span className="block truncate text-[11px] font-medium text-white">
              {p.name}
            </span>
          </span>
        </button>
      ))}
    </div>
  )
}
