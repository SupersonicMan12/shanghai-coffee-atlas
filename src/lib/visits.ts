import { cloud } from './cloud'

/**
 * Visitor count. One document per device per Shanghai day in the `visits`
 * collection, written through the same anonymous CloudBase sign-in as the
 * notes; CloudBase stamps `_openid`, so distinct `_openid`s are distinct
 * visitors. No cookies, no third party, nothing that names a person. The
 * collection is create-only (HANDOFF.md §12): the site can never read it back.
 */
export const VISITS_COLLECTION = 'visits'
const KEY = 'shca.visit.day'

function shanghaiDay(now: Date): string {
  return new Date(now.getTime() + 8 * 3600_000).toISOString().slice(0, 10)
}

function referrerHost(): string | null {
  try {
    const host = document.referrer ? new URL(document.referrer).host : ''
    return host && host !== location.host ? host : null
  } catch {
    return null
  }
}

/** Record today's visit once. Silent on every failure: counting must never get in the reader's way. */
export async function recordVisit(lang: string): Promise<void> {
  const now = new Date()
  const day = shanghaiDay(now)
  try {
    if (localStorage.getItem(KEY) === day) return
    const { db } = await cloud()
    await db.collection(VISITS_COLLECTION).add({
      day,
      at: now.toISOString(),
      lang,
      ref: referrerHost(),
      mobile: matchMedia('(max-width: 900px)').matches,
      installed: matchMedia('(display-mode: standalone)').matches,
    })
    localStorage.setItem(KEY, day)
  } catch {
    // offline, storage blocked, or the collection is not set up yet: try again next visit
  }
}
