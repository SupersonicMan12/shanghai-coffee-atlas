import { useCallback, useSyncExternalStore } from 'react'
import type { Axes } from '../data/types'

/**
 * The calibration ledger. Every reader who answers the five questions leaves
 * one vote per café — the newest answer wins, because taste drifts and the
 * atlas should drift with it. Stored locally for now; the VoteStore interface
 * is the seam where a remote backend (Workers KV, Supabase) slots in later
 * without the widget noticing.
 */
export interface Vote {
  cafeId: string
  /** Only the axes the reader actually answered. */
  axes: Partial<Axes>
  /** ISO timestamp of when the vote was cast. */
  at: string
}

export interface VoteAggregate {
  /** Mean per answered axis across all votes for the café. */
  mean: Partial<Axes>
  /** Number of votes behind the mean. */
  n: number
}

export interface VoteStore {
  /** All votes for one café, oldest first. */
  list(cafeId: string): Vote[]
  /** This device's own vote for the café, if any. */
  mine(cafeId: string): Vote | null
  /** Record (or replace) this device's vote. */
  cast(vote: Vote): void
  /** Withdraw this device's vote. */
  retract(cafeId: string): void
  /** Subscribe to changes; returns an unsubscribe. */
  subscribe(fn: () => void): () => void
}

const KEY = 'shca.votes.v1'
const AXIS_KEYS: (keyof Axes)[] = ['focus', 'energy', 'linger', 'adventure', 'spend']

function sanitize(raw: unknown): Vote[] {
  if (!Array.isArray(raw)) return []
  const out: Vote[] = []
  for (const v of raw) {
    if (!v || typeof v !== 'object') continue
    const cand = v as Record<string, unknown>
    if (typeof cand.cafeId !== 'string' || typeof cand.at !== 'string') continue
    const axesRaw = cand.axes
    if (!axesRaw || typeof axesRaw !== 'object') continue
    const axes: Partial<Axes> = {}
    for (const k of AXIS_KEYS) {
      const n = (axesRaw as Record<string, unknown>)[k]
      if (typeof n === 'number' && Number.isFinite(n) && n >= 0 && n <= 100) axes[k] = n
    }
    if (Object.keys(axes).length === 0) continue
    out.push({ cafeId: cand.cafeId, axes, at: cand.at })
  }
  return out
}

function readAll(): Vote[] {
  if (typeof localStorage === 'undefined') return []
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? sanitize(JSON.parse(raw)) : []
  } catch {
    return []
  }
}

class LocalVoteStore implements VoteStore {
  private votes: Vote[] = readAll()
  private listeners = new Set<() => void>()

  private persist() {
    try {
      localStorage.setItem(KEY, JSON.stringify(this.votes))
    } catch {
      // private browsing, quota — the atlas still works, it just forgets
    }
    for (const fn of this.listeners) fn()
  }

  list(cafeId: string): Vote[] {
    return this.votes.filter((v) => v.cafeId === cafeId)
  }

  mine(cafeId: string): Vote | null {
    // Local store: one device, one vote per café.
    return this.votes.find((v) => v.cafeId === cafeId) ?? null
  }

  cast(vote: Vote): void {
    this.votes = [...this.votes.filter((v) => v.cafeId !== vote.cafeId), vote]
    this.persist()
  }

  retract(cafeId: string): void {
    this.votes = this.votes.filter((v) => v.cafeId !== cafeId)
    this.persist()
  }

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn)
    return () => this.listeners.delete(fn)
  }
}

export const voteStore: VoteStore = new LocalVoteStore()

/**
 * Aggregate for the scoring blend: mean per answered axis plus vote count.
 * Matches the `votes` input shape the scoring engine expects.
 */
export function votesFor(cafeId: string, store: VoteStore = voteStore): VoteAggregate {
  const votes = store.list(cafeId)
  const mean: Partial<Axes> = {}
  for (const k of AXIS_KEYS) {
    const vals = votes.map((v) => v.axes[k]).filter((n): n is number => typeof n === 'number')
    if (vals.length) mean[k] = Math.round(vals.reduce((a, b) => a + b, 0) / vals.length)
  }
  return { mean, n: votes.length }
}

/** React binding: this device's vote for a café, live. */
export function useMyVote(cafeId: string) {
  const subscribe = useCallback((fn: () => void) => voteStore.subscribe(fn), [])
  const getSnapshot = useCallback(() => voteStore.mine(cafeId), [cafeId])
  const mine = useSyncExternalStore(subscribe, getSnapshot)
  const cast = useCallback(
    (axes: Partial<Axes>) =>
      voteStore.cast({ cafeId, axes, at: new Date().toISOString() }),
    [cafeId],
  )
  const retract = useCallback(() => voteStore.retract(cafeId), [cafeId])
  return { mine, cast, retract, count: voteStore.list(cafeId).length }
}
