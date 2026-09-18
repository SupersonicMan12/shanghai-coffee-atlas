const ONBOARD_KEY = 'shca.onboarded.v1'

export function shouldOnboard(): boolean {
  try {
    return localStorage.getItem(ONBOARD_KEY) === null
  } catch {
    return false
  }
}

export function markOnboarded() {
  try {
    localStorage.setItem(ONBOARD_KEY, '1')
  } catch {
    // fine — they will see it again next visit
  }
}
