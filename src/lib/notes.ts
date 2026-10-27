import { useSyncExternalStore } from 'react'
import { NOTES_COLLECTION, cloud } from './cloud'

/**
 * Visitor notes — one or two sentences a person leaves under a café, signed
 * or anonymous, no account. Notes are born `pending`; a human flips them to
 * `approved` in the CloudBase console (or `rejected`), and only approved notes
 * are shown to everyone. The device that wrote a note always sees its own
 * notes, pending or not, so the writer never wonders where it went.
 *
 * Everything the device wrote is mirrored in localStorage: writes that fail
 * (offline, backend not configured yet) stay queued and are retried on the
 * next load, so a note is never lost between the keyboard and the server.
 */
export type NoteStatus = 'pending' | 'approved' | 'rejected'

export interface CafeNote {
  id: string
  cafeId: string
  /** Display name as typed, or null for anonymous. */
  name: string | null
  text: string
  status: NoteStatus
  /** Epoch ms. */
  at: number
  /** True when this device wrote it. */
  mine: boolean
  /** Written but not yet accepted by the server. */
  queued?: boolean
}

export type CloudState = 'idle' | 'loading' | 'ready' | 'offline'

export const NOTE_MIN = 4
export const NOTE_MAX = 400
export const NAME_MAX = 20
const COOLDOWN_MS = 5 * 60_000
const KEY = 'shca.notes.mine.v1'

interface Stored {
  id: string
  cafeId: string
  name: string | null
  text: string
  status: NoteStatus
  at: number
  queued?: boolean
}

interface RemoteDoc {
  _id?: unknown
  _openid?: unknown
  cafeId?: unknown
  name?: unknown
  text?: unknown
  status?: unknown
  at?: unknown
}

function readMine(): Stored[] {
  if (typeof localStorage === 'undefined') return []
  try {
    const raw = localStorage.getItem(KEY)
    const parsed: unknown = raw ? JSON.parse(raw) : []
    if (!Array.isArray(parsed)) return []
    return parsed.filter(
      (n): n is Stored =>
        typeof n === 'object' &&
        n !== null &&
        typeof (n as Stored).id === 'string' &&
        typeof (n as Stored).cafeId === 'string' &&
        typeof (n as Stored).text === 'string' &&
        typeof (n as Stored).at === 'number',
    )
  } catch {
    return []
  }
}

function writeMine(list: Stored[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list))
  } catch {
    // private mode / quota: the in-memory copy still works for this visit
  }
}

function fromRemote(doc: RemoteDoc, uid: string | null): CafeNote | null {
  if (typeof doc._id !== 'string' || typeof doc.cafeId !== 'string' || typeof doc.text !== 'string') return null
  const status = doc.status
  if (status !== 'pending' && status !== 'approved' && status !== 'rejected') return null
  return {
    id: doc._id,
    cafeId: doc.cafeId,
    name: typeof doc.name === 'string' && doc.name.trim() ? doc.name.trim().slice(0, NAME_MAX) : null,
    text: doc.text.slice(0, NOTE_MAX),
    status,
    at: typeof doc.at === 'number' ? doc.at : 0,
    mine: uid !== null && doc._openid === uid,
  }
}

class NoteStore {
  private mine: Stored[] = readMine()
  private remote: CafeNote[] = []
  private listeners = new Set<() => void>()
  private snapshot: { all: CafeNote[]; byCafe: Map<string, CafeNote[]>; state: CloudState } | null = null
  state: CloudState = 'idle'
  private started = false

  subscribe = (fn: () => void) => {
    this.listeners.add(fn)
    return () => {
      this.listeners.delete(fn)
    }
  }

  getSnapshot = () => {
    if (!this.snapshot) {
      const remoteIds = new Set(this.remote.map((n) => n.id))
      const all: CafeNote[] = [
        ...this.remote,
        ...this.mine.filter((n) => !remoteIds.has(n.id)).map((n) => ({ ...n, mine: true })),
      ].sort((a, b) => b.at - a.at)
      const byCafe = new Map<string, CafeNote[]>()
      for (const n of all) {
        const list = byCafe.get(n.cafeId)
        if (list) list.push(n)
        else byCafe.set(n.cafeId, [n])
      }
      this.snapshot = { all, byCafe, state: this.state }
    }
    return this.snapshot
  }

  private emit() {
    this.snapshot = null
    for (const fn of this.listeners) fn()
  }

  /** Load the shared notebook once; safe to call repeatedly. */
  start() {
    if (this.started) return
    this.started = true
    this.state = 'loading'
    this.emit()
    void this.sync()
  }

  private async sync() {
    try {
      const { db, uid } = await cloud()
      const col = db.collection(NOTES_COLLECTION)
      const [approved, own] = await Promise.all([
        col.where({ status: 'approved' }).orderBy('at', 'desc').limit(1000).get(),
        col.where({ _openid: '{openid}' }).orderBy('at', 'desc').limit(200).get(),
      ])
      const seen = new Set<string>()
      const merged: CafeNote[] = []
      for (const raw of [...(own.data as RemoteDoc[]), ...(approved.data as RemoteDoc[])]) {
        const n = fromRemote(raw, uid)
        if (n && !seen.has(n.id)) {
          seen.add(n.id)
          merged.push(n)
        }
      }
      this.remote = merged
      // the server is the truth for anything it has accepted
      const remoteById = new Map(merged.filter((n) => n.mine).map((n) => [n.id, n]))
      this.mine = this.mine.map((n) => {
        const r = remoteById.get(n.id)
        return r ? { ...n, status: r.status, queued: false } : n
      })
      this.state = 'ready'
      this.emit()
      writeMine(this.mine)
      await this.flush()
    } catch {
      this.state = 'offline'
      this.emit()
    }
  }

  /** Push anything written while offline. */
  private async flush() {
    const queued = this.mine.filter((n) => n.queued)
    for (const n of queued) {
      try {
        await this.push(n)
      } catch {
        this.state = 'offline'
        this.emit()
        return
      }
    }
  }

  private async push(n: Stored) {
    const { db } = await cloud()
    const res = await db.collection(NOTES_COLLECTION).add({
      _id: n.id,
      cafeId: n.cafeId,
      name: n.name,
      text: n.text,
      status: 'pending',
      at: n.at,
      client: 'atlas-web',
    })
    // a retried write that already landed comes back as a duplicate-key error
    if (res.code && !/duplicate|exist/i.test(res.message ?? '')) throw new Error(res.message ?? res.code)
    this.mine = this.mine.map((m) => (m.id === n.id ? { ...m, queued: false } : m))
    writeMine(this.mine)
    this.emit()
  }

  /** Seconds until this device may post again under the café, or 0. */
  cooldown(cafeId: string): number {
    const last = this.mine.filter((n) => n.cafeId === cafeId).reduce((m, n) => Math.max(m, n.at), 0)
    return Math.max(0, Math.ceil((last + COOLDOWN_MS - Date.now()) / 1000))
  }

  /** Save locally at once, then try the server. Resolves 'shared' | 'queued'. */
  async add(cafeId: string, name: string, text: string): Promise<'shared' | 'queued'> {
    const clean = text.replace(/\s+/g, ' ').trim().slice(0, NOTE_MAX)
    if (clean.length < NOTE_MIN) throw new Error('too short')
    const note: Stored = {
      id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
      cafeId,
      name: name.trim() ? name.trim().slice(0, NAME_MAX) : null,
      text: clean,
      status: 'pending',
      at: Date.now(),
      queued: true,
    }
    this.mine = [...this.mine, note]
    writeMine(this.mine)
    this.emit()
    try {
      await this.push(note)
      return 'shared'
    } catch {
      this.state = 'offline'
      this.emit()
      return 'queued'
    }
  }
}

export const noteStore = new NoteStore()

const EMPTY: CafeNote[] = []

export function useNotes() {
  return useSyncExternalStore(noteStore.subscribe, noteStore.getSnapshot, noteStore.getSnapshot)
}

/** Approved notes plus this device's own, newest first. */
export function useCafeNotes(cafeId: string): CafeNote[] {
  const snap = useNotes()
  return snap.byCafe.get(cafeId) ?? EMPTY
}

/** Count of notes everyone can see, per café — for the map and result strips. */
export function publicNoteCounts(all: CafeNote[]): Map<string, number> {
  const out = new Map<string, number>()
  for (const n of all) if (n.status === 'approved') out.set(n.cafeId, (out.get(n.cafeId) ?? 0) + 1)
  return out
}
