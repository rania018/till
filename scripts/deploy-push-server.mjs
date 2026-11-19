// Puts the push server (push-server/, a Cloudflare Worker) live and points the app at it.
// Run from the project root: pnpm push:deploy
//   1. checks you're logged in to Cloudflare (run `npx wrangler login` in push-server/ first)
//   2. the first time, makes the VAPID key pair (push-server/.dev.vars) and wrangler.toml from wrangler.example.toml
//   3. creates the KV namespace the first time
//   4. sets the Worker's allowed origins to your site addresses only (from .env.local)
//   5. uploads the VAPID private key as a secret and deploys the Worker
//   6. writes VITE_PUSH_API and VITE_VAPID_PUBLIC_KEY into .env.local
//   7. rebuilds and deploys the site (skip with --no-web)
// Needs VITE_FIREBASE_PROJECT_ID (or VITE_FIREBASE_SITES) in .env.local, so the Worker knows which sites may call it.
import { execFileSync, spawnSync } from 'node:child_process'
import { createECDH } from 'node:crypto'
import { copyFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const serverDir = join(root, 'push-server')
const tomlPath = join(serverDir, 'wrangler.toml')
const examplePath = join(serverDir, 'wrangler.example.toml')
const varsPath = join(serverDir, '.dev.vars')
const settingsPath = join(root, '.env.local')
const deployWeb = !process.argv.includes('--no-web')

// The local development origins, only ever in .dev.vars: `wrangler dev` reads them from there, a deployed Worker never sees them.
const DEV_ORIGINS = 'http://localhost:4173,http://localhost:5173'

function stop(message) {
  console.error(`\nStopped: ${message}`)
  process.exit(1)
}

function wrangler(args, options = {}) {
  const result = spawnSync('npx', ['wrangler', ...args], { cwd: serverDir, encoding: 'utf8', shell: true, stdio: options.input ? ['pipe', 'pipe', 'inherit'] : ['inherit', 'pipe', 'inherit'], input: options.input })
  if (result.stdout) process.stdout.write(result.stdout)
  if (result.status !== 0) stop(`wrangler ${args[0]} failed.`)
  return result.stdout ?? ''
}

/** Sets `key = "value"` in a TOML file's text, leaving the rest as it is. */
const setToml = (text, key, value) => text.replace(new RegExp(`^${key} = ".*"$`, 'm'), () => `${key} = "${value}"`)

/** Sets KEY=value in a dotenv-style text, adding the line if it isn't there. */
function setEnv(text, key, value) {
  const line = `${key}=${value}`
  const pattern = new RegExp(`^#?[ \\t]*${key}=.*$`, 'm')
  if (pattern.test(text)) return text.replace(pattern, () => line)
  return `${text}${text === '' || text.endsWith('\n') ? '' : '\n'}${line}\n`
}

// The sites that may call the Worker: the same default as src/config/cloudSettings.ts.
if (!existsSync(settingsPath)) stop('.env.local doesn’t exist. Copy .env.example to .env.local and fill in your Firebase values first (docs/SELF-HOSTING.md).')
process.loadEnvFile(settingsPath)
const project = (process.env.VITE_FIREBASE_PROJECT_ID ?? '').trim()
const listed = (process.env.VITE_FIREBASE_SITES ?? '').split(',').map((site) => site.trim()).filter(Boolean)
const sites = listed.length > 0 ? listed : project ? [`${project}.web.app`, `${project}.firebaseapp.com`] : []
if (sites.length === 0) stop('set VITE_FIREBASE_PROJECT_ID (or VITE_FIREBASE_SITES) in .env.local, so the Worker knows which sites may call it.')

// 1. Login
const who = spawnSync('npx', ['wrangler', 'whoami'], { cwd: serverDir, encoding: 'utf8', shell: true })
if (who.status !== 0 || /not authenticated|You are not logged in/i.test(who.stdout + who.stderr)) {
  stop('not logged in to Cloudflare. Run this first, then try again:\n  cd push-server && npx wrangler login')
}

// 2. The key pair: the private half stays in .dev.vars (never committed), the public half goes in wrangler.toml and .env.local.
if (!existsSync(varsPath)) {
  console.log('Making a new VAPID key pair…')
  const ecdh = createECDH('prime256v1')
  ecdh.generateKeys()
  writeFileSync(varsPath, `VAPID_PRIVATE_KEY=${ecdh.getPrivateKey().toString('base64url')}\nALLOWED_ORIGINS=${DEV_ORIGINS}\n`)
  console.log('Saved the private key in push-server/.dev.vars. Back that file up: with it lost, every device has to turn the switch off and on again.')
}
const privateKey = /^VAPID_PRIVATE_KEY=(\S+)/m.exec(readFileSync(varsPath, 'utf8'))?.[1]
if (!privateKey) stop('VAPID_PRIVATE_KEY not found in push-server/.dev.vars.')
const keys = createECDH('prime256v1')
keys.setPrivateKey(Buffer.from(privateKey, 'base64url'))
const publicKey = keys.getPublicKey().toString('base64url')

if (!existsSync(tomlPath)) {
  copyFileSync(examplePath, tomlPath)
  console.log('Made push-server/wrangler.toml from wrangler.example.toml.')
}
let toml = readFileSync(tomlPath, 'utf8')

// 3. KV namespace
if (toml.includes('REPLACE_WITH_KV_NAMESPACE_ID')) {
  console.log('Creating the KV namespace…')
  const output = wrangler(['kv', 'namespace', 'create', 'DEVICES'])
  const id = /id\s*[=:]\s*"([0-9a-f]{32})"/.exec(output)?.[1] ?? /\b([0-9a-f]{32})\b/.exec(output)?.[1]
  if (!id) stop('couldn’t find the namespace id in wrangler’s output. Paste it into push-server/wrangler.toml by hand and run again.')
  toml = toml.replace('REPLACE_WITH_KV_NAMESPACE_ID', id)
  console.log(`KV namespace ${id} written to wrangler.toml.`)
}

// 4. Public key, contact and allowed origins (site addresses only: never localhost in production)
toml = setToml(toml, 'VAPID_PUBLIC_KEY', publicKey)
if (toml.includes('REPLACE_WITH_SUBJECT')) toml = setToml(toml, 'VAPID_SUBJECT', `https://${sites[0]}`)
toml = setToml(toml, 'ALLOWED_ORIGINS', sites.map((site) => `https://${site}`).join(','))
writeFileSync(tomlPath, toml)

// 5. Secret and Worker
console.log('Uploading the VAPID private key…')
wrangler(['secret', 'put', 'VAPID_PRIVATE_KEY'], { input: privateKey })
console.log('Deploying the Worker…')
const deployOutput = wrangler(['deploy'])
const url = /https:\/\/[\w.-]+\.workers\.dev/.exec(deployOutput)?.[0]
if (!url) stop('deployed, but couldn’t find the Worker address in the output. Put it in .env.local as VITE_PUSH_API by hand.')

// 6. Point the app at it
let settings = readFileSync(settingsPath, 'utf8')
settings = setEnv(settings, 'VITE_PUSH_API', url)
settings = setEnv(settings, 'VITE_VAPID_PUBLIC_KEY', publicKey)
writeFileSync(settingsPath, settings)
console.log(`VITE_PUSH_API and VITE_VAPID_PUBLIC_KEY set in .env.local (${url}).`)

// 7. The site
if (deployWeb) {
  console.log('Building and deploying the site…')
  execFileSync('pnpm', ['deploy:web'], { cwd: root, stdio: 'inherit', shell: true })
}
console.log(`\nDone. Push server: ${url}\nOn the phone: Settings › Reminders and alerts › Allow notifications.`)
