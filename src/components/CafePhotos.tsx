import { useCallback, useEffect, useState } from 'react'
import type { PhotoKind } from '../data/types'
import { UI } from '../data/labels'
import { useI18n } from '../lib/i18n'

const KIND_LABEL: Record<PhotoKind, { en: string; zh: string }> = {
  storefront: UI.photoStorefront,
  interior: UI.photoInterior,
  seating: UI.photoInterior,
  drink: UI.photoDrink,
  food: UI.photoFood,
  menu: UI.photoMenu,
}

interface Props {
  photos: string[]
  kinds?: PhotoKind[]
  alt: string
}

/**
 * The café as a first-time visitor wants to see it: the storefront large,
 * then the room, the cups and the menu as a thumbnail row. Any photo opens
 * full-screen; broken links disappear rather than leaving a grey box.
 */
export function CafePhotos({ photos, kinds, alt }: Props) {
  const { t } = useI18n()
  const [broken, setBroken] = useState<ReadonlySet<string>>(() => new Set())
  const [open, setOpen] = useState<number | null>(null)
  const shown = photos
    .map((src, i) => ({ src, kind: kinds?.[i] }))
    .filter((p) => !broken.has(p.src))
    .slice(0, 6)

  const step = useCallback(
    (d: number) => setOpen((cur) => (cur === null ? null : (cur + d + shown.length) % shown.length)),
    [shown.length],
  )

  useEffect(() => {
    if (open === null) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(null)
      else if (e.key === 'ArrowRight') step(1)
      else if (e.key === 'ArrowLeft') step(-1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, step])

  if (shown.length === 0) return null
  const [hero, ...rest] = shown
  const current = open !== null ? shown[open] : null

  return (
    <div className="card-photos" aria-label={t(UI.photosLabel)}>
      <figure className="card-photo hero">
        <button type="button" className="photo-btn" onClick={() => setOpen(0)} aria-label={t(UI.photoOpen)}>
          <img
            src={hero.src}
            alt={hero.kind ? `${alt} · ${t(KIND_LABEL[hero.kind])}` : alt}
            loading="lazy"
            decoding="async"
            referrerPolicy="no-referrer"
            onError={() => setBroken((prev) => new Set(prev).add(hero.src))}
          />
        </button>
        {hero.kind && <figcaption className="photo-kind">{t(KIND_LABEL[hero.kind])}</figcaption>}
      </figure>
      {rest.length > 0 && (
        <div className="photo-row">
          {rest.map((p, i) => (
            <figure key={p.src} className="card-photo thumb">
              <button
                type="button"
                className="photo-btn"
                onClick={() => setOpen(i + 1)}
                aria-label={t(UI.photoOpen)}
              >
                <img
                  src={p.src}
                  alt={p.kind ? `${alt} · ${t(KIND_LABEL[p.kind])}` : alt}
                  loading="lazy"
                  decoding="async"
                  referrerPolicy="no-referrer"
                  onError={() => setBroken((prev) => new Set(prev).add(p.src))}
                />
              </button>
              {p.kind && <figcaption className="photo-kind">{t(KIND_LABEL[p.kind])}</figcaption>}
            </figure>
          ))}
        </div>
      )}
      <div className="photo-source">{t(UI.photoSource)}</div>

      {current && (
        <div className="lightbox" role="dialog" aria-modal="true" onClick={() => setOpen(null)}>
          <img src={current.src} alt={alt} referrerPolicy="no-referrer" onClick={(e) => e.stopPropagation()} />
          <div className="lb-caption">
            {current.kind ? t(KIND_LABEL[current.kind]) : ''} · {(open ?? 0) + 1}/{shown.length}
          </div>
          {shown.length > 1 && (
            <>
              <button
                type="button"
                className="lb-nav prev"
                aria-label={t(UI.photoPrev)}
                onClick={(e) => {
                  e.stopPropagation()
                  step(-1)
                }}
              >
                ‹
              </button>
              <button
                type="button"
                className="lb-nav next"
                aria-label={t(UI.photoNext)}
                onClick={(e) => {
                  e.stopPropagation()
                  step(1)
                }}
              >
                ›
              </button>
            </>
          )}
          <button type="button" className="lb-close" aria-label={t(UI.close)} onClick={() => setOpen(null)}>
            ×
          </button>
        </div>
      )}
    </div>
  )
}
