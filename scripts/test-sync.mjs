// Runs src/sync/*.emulator.ts inside `firebase emulators:exec` (pnpm test:sync).
// They talk to the real Firestore rules and SDK, so they stay out of the normal `pnpm test`.
import { spawnSync } from 'node:child_process'

const { status } = spawnSync('pnpm', ['exec', 'vitest', 'run'], {
  stdio: 'inherit',
  shell: true,
  env: { ...process.env, SYNC_EMULATOR: '1' },
})
process.exit(status ?? 1)
