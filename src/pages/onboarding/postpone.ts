let postponed = false

/** "Set up later": Home stops sending you to setup until the app is opened again. */
export function postponeOnboarding(): void {
  postponed = true
}

export function isOnboardingPostponed(): boolean {
  return postponed
}
