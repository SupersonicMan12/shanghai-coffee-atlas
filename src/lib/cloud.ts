import type cloudbase from '@cloudbase/js-sdk'

/**
 * The one shared backend the atlas talks to: the CloudBase environment that
 * also serves the 随口咖 mini program, so a note left on the web and a note
 * left in WeChat land in the same collection. The SDK is loaded lazily, never
 * on first paint.
 *
 * Setup that lives in the CloudBase console, not in code (see HANDOFF.md):
 * anonymous sign-in enabled, this site's origin in the web safe-domain list,
 * and the `cafe_notes` collection with its security rules.
 */
export const CLOUD_ENV = 'cloudbase-d6ghx3rq70e1f82cf'
export const NOTES_COLLECTION = 'cafe_notes'

export interface CloudHandle {
  db: cloudbase.database.App
  /** This device's anonymous user id — what CloudBase writes into `_openid`. */
  uid: string
}

let handle: Promise<CloudHandle> | null = null

/** Resolve to a signed-in (anonymous) database handle, or reject when offline / misconfigured. */
export function cloud(): Promise<CloudHandle> {
  if (!handle) {
    handle = connect().catch((err: unknown) => {
      handle = null
      throw err
    })
  }
  return handle
}

async function connect(): Promise<CloudHandle> {
  const { default: cloudbase } = await import('@cloudbase/js-sdk')
  const app = cloudbase.init({ env: CLOUD_ENV, region: 'ap-shanghai' })
  const auth = app.auth({ persistence: 'local' })
  let state = await auth.getLoginState()
  if (!state) {
    const { error } = await auth.signInAnonymously()
    if (error) throw new Error(error.message)
    state = await auth.getLoginState()
  }
  const uid = state?.user?.uid
  if (!uid) throw new Error('cloudbase: no login state after anonymous sign-in')
  return { db: app.database(), uid }
}
