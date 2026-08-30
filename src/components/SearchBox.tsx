import { useMemo, useRef, useState } from 'react'
import type { Cafe } from '../data/types'
import { normalizeQuery, searchHay } from '../lib/match'
import { UI } from '../data/labels'
import { useI18n } from '../lib/i18n'

interface Props {
  cafes: Cafe[]
  onPick: (id: string) => void
}

const MAX_HITS = 8

export function SearchBox({ cafes, onPick }: Props) {
  const { t } = useI18n()
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(false)
  const [cursor, setCursor] = useState(0)
  const blurTimer = useRef<number | null>(null)

  const hits = useMemo(() => {
    const nq = normalizeQuery(q)
    if (!nq) return []
    const starts: Cafe[] = []
    const contains: Cafe[] = []
    for (const c of cafes) {
      const hay = searchHay(c)
      if (!hay.includes(nq)) continue
      const atStart =
        normalizeQuery(c.name).startsWith(nq) || normalizeQuery(c.nameZh).startsWith(nq)
      ;(atStart ? starts : contains).push(c)
      if (starts.length >= MAX_HITS) break
    }
    return [...starts, ...contains].slice(0, MAX_HITS)
  }, [cafes, q])

  const pick = (id: string) => {
    onPick(id)
    setQ('')
    setOpen(false)
  }

  return (
    <div className="searchbox">
      <input
        type="search"
        value={q}
        placeholder={t(UI.searchPlaceholder)}
        aria-label={t(UI.searchLabel)}
        enterKeyHint="search"
        onChange={(e) => {
          setQ(e.target.value)
          setOpen(true)
          setCursor(0)
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => {
          blurTimer.current = window.setTimeout(() => setOpen(false), 140)
        }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') {
            e.preventDefault()
            setCursor((c) => Math.min(c + 1, hits.length - 1))
          } else if (e.key === 'ArrowUp') {
            e.preventDefault()
            setCursor((c) => Math.max(c - 1, 0))
          } else if (e.key === 'Enter' && hits[cursor]) {
            pick(hits[cursor].id)
          } else if (e.key === 'Escape') {
            setQ('')
            setOpen(false)
          }
        }}
      />
      {open && q.trim() !== '' && (
        <ul className="search-hits" role="listbox">
          {hits.length === 0 && <li className="search-none">{t(UI.searchNoResults)}</li>}
          {hits.map((c, i) => (
            <li key={c.id}>
              <button
                className={i === cursor ? 'on' : ''}
                onPointerDown={(e) => {
                  e.preventDefault()
                  if (blurTimer.current) clearTimeout(blurTimer.current)
                  pick(c.id)
                }}
              >
                <span className="sh-name">
                  {c.name} <span className="zh">{c.nameZh}</span>
                </span>
                <span className="sh-where">
                  {c.street} · {c.hood}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
