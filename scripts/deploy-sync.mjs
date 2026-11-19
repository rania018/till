// Puts Google sync live: pnpm sync:deploy <support email>
//   1. Firestore rules (firestore.rules)
//   2. Google sign-in on the Firebase project, with the site's sign-in pages allowed
//   3. The site
//   4. Checks that Google accepts the sign-in, without signing in
//
// The project, its web API key and the site addresses come from .env.local (see .env.example).
// The email must be an owner of the Firebase project; Google shows it on the sign-in
// screen. It's an argument so it stays out of the repo, along with the config made from it.
//
// pnpm sync:deploy --check only runs step 4.
import { spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

if (!existsSync('.env.local')) {
  console.error('Stopped: .env.local does not exist. Copy .env.example to .env.local and fill in your Firebase values (docs/SELF-HOSTING.md).')
  process.exit(1)
}
process.loadEnvFile('.env.local')

const PROJECT = (process.env.VITE_FIREBASE_PROJECT_ID ?? '').trim()
const API_KEY = (process.env.VITE_FIREBASE_API_KEY ?? '').trim()
if (!PROJECT || !API_KEY) {
  console.error('Stopped: VITE_FIREBASE_PROJECT_ID and VITE_FIREBASE_API_KEY must both be set in .env.local.')
  process.exit(1)
}
// Same default as src/config/cloudSettings.ts: the project's two Hosting addresses, unless the settings list others.
const listed = (process.env.VITE_FIREBASE_SITES ?? '').split(',').map((site) => site.trim()).filter(Boolean)
const SITES = listed.length > 0 ? listed : [`${PROJECT}.web.app`, `${PROJECT}.firebaseapp.com`]
const handler = (site) => `https://${site}/__/auth/handler`

function firebase(args, cwd) {
  const { status } = spawnSync('firebase', [...args, '--project', PROJECT], { stdio: 'inherit', shell: true, cwd })
  if (status !== 0) {
    console.error(`\nStopped: firebase ${args.join(' ')} failed.`)
    process.exit(status ?? 1)
  }
}

function enableGoogleSignIn(supportEmail) {
  const dir = mkdtempSync(join(tmpdir(), 'till-auth-'))
  try {
    const config = {
      auth: {
        providers: {
          googleSignIn: { oAuthBrandDisplayName: 'Till', supportEmail, authorizedRedirectUris: SITES.map(handler) },
        },
      },
    }
    writeFileSync(join(dir, 'firebase.json'), JSON.stringify(config, null, 2))
    firebase(['deploy', '--only', 'auth'], dir)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

/** Asks for a sign-in link for each site and sees whether Google would show its sign-in page. */
async function check() {
  let ok = true
  for (const site of SITES) {
    const response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:createAuthUri?key=${API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Referer: `https://${site}/` },
      body: JSON.stringify({ providerId: 'google.com', continueUri: handler(site) }),
    })
    const body = await response.json()
    if (!body.authUri) {
      console.log(`NOT READY  ${site}: ${body.error?.message ?? 'no sign-in link'}`)
      ok = false
      continue
    }
    const google = await fetch(body.authUri, { redirect: 'manual' })
    const accepted = google.status >= 300 && google.status < 400
    console.log(`${accepted ? 'OK       ' : 'NOT READY'}  ${site}: Google answered ${google.status}${accepted ? '' : ' (this address may not be allowed yet)'}`)
    ok &&= accepted
  }
  if (!ok) process.exitCode = 1
}

const argument = process.argv[2]
if (argument === '--check') {
  await check()
} else if (!argument?.includes('@')) {
  console.error('Usage: pnpm sync:deploy <email of a Firebase project owner>')
  process.exit(1)
} else {
  firebase(['deploy', '--only', 'firestore:rules'])
  enableGoogleSignIn(argument)
  firebase(['deploy', '--only', 'hosting'])
  await check()
}
