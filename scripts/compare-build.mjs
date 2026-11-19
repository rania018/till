// Proves a change did not alter the owner's live site.
//   node scripts/compare-build.mjs snapshot <file>   builds with the current .env.local and stores what matters
//   node scripts/compare-build.mjs compare <file>    rebuilds and exits 1 on any difference
// What matters: the Content-Security-Policy meta tag (source order included), the Firebase
// config in the bundle, the sign-in addresses and the push server's address and public key.
import { spawnSync } from 'node:child_process'
import { readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const [mode, file] = process.argv.slice(2)
if (!['snapshot', 'compare'].includes(mode) || !file) {
  console.error('Usage: node scripts/compare-build.mjs snapshot|compare <file>')
  process.exit(2)
}

const built = spawnSync('pnpm', ['build'], { stdio: 'inherit', shell: true })
if (built.status !== 0) process.exit(built.status ?? 1)

const html = readFileSync('dist/index.html', 'utf8')
const csp = /<meta http-equiv="Content-Security-Policy"[^>]*>/.exec(html)?.[0] ?? null
const assets = readdirSync('dist/assets').filter((name) => name.endsWith('.js'))
const bundle = assets.map((name) => readFileSync(join('dist/assets', name), 'utf8')).join('\n')
const first = (re) => re.exec(bundle)?.[1] ?? null
const all = (re) => [...new Set([...bundle.matchAll(re)].map((match) => match[1]))]

// The settings reader leaves the settings in the bundle as one object (VITE_FIREBASE_API_KEY: `value`, ...);
// the code before it had them as literals. Both shapes are read, so a snapshot of the old code
// can be compared with a build of the new.
const projectId = first(/VITE_FIREBASE_PROJECT_ID:`([^`]+)`/) ?? first(/projectId:`([^`]+)`/)
const literalSites = all(/`([a-z0-9-]+\.(?:web\.app|firebaseapp\.com))`/g)
// The reader builds the default addresses as `${project}.web.app` and `${project}.firebaseapp.com`.
const suffixes = all(/`\$\{\w+\}(\.(?:web\.app|firebaseapp\.com))`/g)

const snapshot = {
  csp,
  apiKey: first(/VITE_FIREBASE_API_KEY:`([^`]+)`/) ?? first(/apiKey:`([^`]+)`/),
  projectId,
  appId: first(/VITE_FIREBASE_APP_ID:`([^`]+)`/) ?? first(/appId:`([^`]+)`/),
  authDomainUsesHostname: /authDomain:[^,]*location\.hostname/.test(bundle),
  sites: literalSites.length > 0 ? literalSites : suffixes.map((suffix) => `${projectId}${suffix}`),
  pushApi: first(/VITE_PUSH_API:`([^`]+)`/) ?? first(/`(https:\/\/[\w.-]+\.workers\.dev)`/),
  vapidPublicKey: first(/VITE_VAPID_PUBLIC_KEY:`([^`]+)`/) ?? first(/`(B[\w-]{86})`/),
}

if (mode === 'snapshot') {
  writeFileSync(file, JSON.stringify(snapshot, null, 2) + '\n')
  console.log(`Snapshot written to ${file}.`)
} else {
  const before = JSON.parse(readFileSync(file, 'utf8'))
  let same = true
  for (const key of Object.keys({ ...before, ...snapshot })) {
    if (JSON.stringify(before[key]) !== JSON.stringify(snapshot[key])) {
      same = false
      console.error(`DIFFERENT  ${key}\n  was: ${JSON.stringify(before[key])}\n  now: ${JSON.stringify(snapshot[key])}`)
    }
  }
  if (!same) process.exit(1)
  console.log('Same as the snapshot: CSP, Firebase config, sign-in addresses and push server unchanged.')
}
