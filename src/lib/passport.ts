import { useCallback, useEffect, useState } from 'react'
import type { Archetype, Cafe, District } from '../data/types'

export interface Stamp {
  cafeId: string
  /** ISO date, day precision — the atlas does not need to know the hour. */
  on: string
  rating: 1 | 2 | 3 | null
}

export interface PassportState {
  stamps: Stamp[]
  saved: string[]
}

const KEY = 'shca.passport.v1'

const EMPTY: PassportState = { stamps: [], saved: [] }

function read(): PassportState {
  if (typeof localStorage === 'undefined') return EMPTY
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return EMPTY
    const parsed = JSON.parse(raw) as Partial<PassportState>
    return {
      stamps: Array.isArray(parsed.stamps) ? parsed.stamps : [],
      saved: Array.isArray(parsed.saved) ? parsed.saved : [],
    }
  } catch {
    return EMPTY
  }
}

export function usePassport() {
  const [state, setState] = useState<PassportState>(read)

  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(state))
    } catch {
      // private browsing, quota, whatever — the atlas still works, it just forgets
    }
  }, [state])

  const stamp = useCallback((cafeId: string, rating: 1 | 2 | 3 | null = null) => {
    setState((s) => {
      const existing = s.stamps.find((x) => x.cafeId === cafeId)
      if (existing) {
        return {
          ...s,
          stamps: s.stamps.map((x) =>
            x.cafeId === cafeId ? { ...x, rating } : x,
          ),
        }
      }
      const on = new Date().toISOString().slice(0, 10)
      return { ...s, stamps: [...s.stamps, { cafeId, on, rating }] }
    })
  }, [])

  const unstamp = useCallback((cafeId: string) => {
    setState((s) => ({ ...s, stamps: s.stamps.filter((x) => x.cafeId !== cafeId) }))
  }, [])

  const toggleSaved = useCallback((cafeId: string) => {
    setState((s) => ({
      ...s,
      saved: s.saved.includes(cafeId)
        ? s.saved.filter((x) => x !== cafeId)
        : [...s.saved, cafeId],
    }))
  }, [])

  const clear = useCallback(() => setState(EMPTY), [])

  return { state, stamp, unstamp, toggleSaved, clear }
}

export interface Badge {
  id: string
  name: string
  nameZh: string
  hint: string
  earned: boolean
  progress: number
  target: number
}

/**
 * Badges reward the kind of exploring the atlas is arguing for: breadth of
 * neighbourhood, breadth of room, and getting out of your own comfort zone.
 */
export function badgesFor(stamps: Stamp[], cafes: Cafe[]): Badge[] {
  const byId = new Map(cafes.map((c) => [c.id, c]))
  const visited = stamps
    .map((s) => byId.get(s.cafeId))
    .filter((c): c is Cafe => Boolean(c))

  const districts = new Set<District>(visited.map((c) => c.district))
  const archetypes = new Set<Archetype>(visited.map((c) => c.archetype))
  const roasters = visited.filter((c) => c.tags.includes('own-roast')).length
  const standing = visited.filter((c) => c.archetype === 'standing-bar').length
  const cheap = visited.filter((c) => c.price === 1).length
  const early = visited.filter((c) => c.opens <= 7.5).length

  const mk = (
    id: string,
    name: string,
    nameZh: string,
    hint: string,
    progress: number,
    target: number,
  ): Badge => ({ id, name, nameZh, hint, progress: Math.min(progress, target), target, earned: progress >= target })

  return [
    mk('first', 'First Cup', '第一杯', 'Stamp any café', visited.length, 1),
    mk('ten', 'Ten Rooms', '十间屋子', 'Ten different cafés', visited.length, 10),
    mk('concession', 'Plane Tree Walker', '梧桐行者', 'Five cafés in Xuhui', visited.filter((c) => c.district === 'Xuhui').length, 5),
    mk('crossriver', 'Crossed the River', '过江', 'Anything in Pudong', visited.filter((c) => c.district === 'Pudong').length, 1),
    mk('districts', 'Seven Districts', '七区', 'One café in every district', districts.size, 7),
    mk('rooms', 'Every Kind of Room', '各式空间', 'Eight different archetypes', archetypes.size, 8),
    mk('roaster', 'Smells Like Roasting', '烘豆味', 'Five cafés that roast on site', roasters, 5),
    mk('standing', 'No Chairs Needed', '不用坐', 'Four standing bars', standing, 4),
    mk('value', 'Fifteen Kuai Club', '十五块俱乐部', 'Six everyday-price cups', cheap, 6),
    mk('early', 'Before the Queue', '赶在排队前', 'Three cafés that open by 07:30', early, 3),
  ]
}
