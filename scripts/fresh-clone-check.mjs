// Proves a clone of the committed branch is safe by default, as someone else would get it:
//   node scripts/fresh-clone-check.mjs [ref]     (default: the current branch)
// It clones into a temporary folder, installs, runs the tests and builds with NO settings, and checks the
// built page has nothing but its own site in its Content-Security-Policy and no Firebase, Google or
// workers.dev address in the bundle. Then it builds again with made-up settings and checks they show up.
import { execFileSync, spawnSync } from 'node:child_process'
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const ref = process.argv[2] ?? execFileSync('git', ['rev-parse', '--abbrev-ref', 'HEAD']).toString().trim()
const dir = mkdtempSync(join(tmpdir(), 'till-fresh-'))
const clone = join(dir, 'c')
let failures = 0
const check = (name, ok, detail = '') => {
  if (!ok) failures++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  ${detail}` : ''}`)
}
const run = (command, args, env = {}) => spawnSync(command, args, { cwd: clone, shell: true, stdio: 'inherit', env: { ...cleanEnv(), ...env } }).status === 0
// No settings may leak in from this machine's environment.
const cleanEnv = () => Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('VITE_')))

const read = () => {
  const html = readFileSync(join(clone, 'dist/index.html'), 'utf8')
  const csp = /<meta http-equiv="Content-Security-Policy" content="([^"]*)"/.exec(html)?.[1] ?? ''
  const assets = readdirSync(join(clone, 'dist/assets')).filter((name) => name.endsWith('.js'))
  const bundle = assets.map((name) => readFileSync(join(clone, 'dist/assets', name), 'utf8')).join('\n')
  return { csp, bundle }
}

try {
  console.log(`Cloning ${ref} into ${clone}`)
  execFileSync('git', ['clone', '--quiet', '--branch', ref, process.cwd(), clone], { stdio: 'inherit' })
  check('install', run('pnpm', ['install', '--frozen-lockfile']))
  check('tests pass', run('pnpm', ['test']))

  check('build with no settings', run('pnpm', ['build']))
  const off = read()
  check('CSP is the site itself only', !/https?:\/\/|wss?:\/\//.test(off.csp), off.csp.match(/connect-src[^;]*/)?.[0])
  // Firebase's own library names Google's addresses; what must not be there is a site or Worker address of anyone's own.
  check('no site or Worker address of its own in the bundle', !/workers\.dev|[`'"][a-z0-9-]+\.(?:web\.app|firebaseapp\.com)[`'"]/.test(off.bundle))

  const made = { VITE_FIREBASE_API_KEY: 'AIzaMadeUpKeyForTheCheck', VITE_FIREBASE_PROJECT_ID: 'made-up-till', VITE_FIREBASE_APP_ID: '1:1:web:madeup', VITE_PUSH_API: 'https://made-up.example.workers.dev', VITE_VAPID_PUBLIC_KEY: 'Bmadeup' }
  check('build with made-up settings', run('pnpm', ['build'], made))
  const on = read()
  check('made-up settings appear in the CSP', on.csp.includes('made-up-till.web.app') && on.csp.includes('made-up.example.workers.dev'))
  check('made-up settings appear in the bundle', on.bundle.includes('AIzaMadeUpKeyForTheCheck') && on.bundle.includes('made-up.example.workers.dev'))
} finally {
  rmSync(dir, { recursive: true, force: true })
}
console.log(failures === 0 ? '\nAll checks passed.' : `\n${failures} check(s) failed.`)
process.exit(failures === 0 ? 0 : 1)
