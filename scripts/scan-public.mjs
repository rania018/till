// Looks through everything that would be published, before it is. Run it on the committed tree:
//   node scripts/scan-public.mjs            scans HEAD
//   node scripts/scan-public.mjs <ref>      scans another commit or branch
//   node scripts/scan-public.mjs --list     also prints the full file list (read it before publishing)
//
// It flags: secret and key shapes, any email address, the owner's own addresses and ids, attribution
// and private-history wording, and any path that must stay private. Exit code 1 on any finding outside
// the reviewed allow-list below.
//
// The owner's own values (project id, API key, Worker address, KV id, VAPID key, git email, names)
// are read at run time from files that stay on the owner's disk and out of the repository:
// .env.local, push-server/wrangler.toml, push-server/.dev.vars, .firebaserc, git config, and an
// optional .scan-terms.txt (one extra word per line, for real names). Nothing owner-specific is written here.
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'

const args = process.argv.slice(2)
const listFiles = args.includes('--list')
const ref = args.find((arg) => !arg.startsWith('--')) ?? 'HEAD'

const git = (gitArgs, options = {}) => execFileSync('git', gitArgs, { maxBuffer: 256 * 1024 * 1024, ...options })

// ---- the reviewed allow-list: the only places a finding is accepted ---------------------------------
// The live site address in the README (the project id is public by design there), and the placeholders in .env.example.
const ALLOW = [
  { file: 'README.md', kind: 'owner value', line: /https:\/\/[\w-]+\.web\.app/ },
  { file: '.env.example', kind: 'any', line: /./ },
]

// ---- paths that must never be published ------------------------------------------------------------
const MUST_BE_ABSENT = [
  /^PLAN\.md$/,
  /^docs\/history\//,
  /^docs\/next\//,
  /^docs\/redesign-preview\.html$/,
  /^docs\/till-ui-2026-11-05\.pdf$/,
  /^push-server\/wrangler\.toml$/,
  /^push-server\/\.dev\.vars$/,
  /^\.firebaserc$/,
  /^\.env\.local$/,
  /^\.baseline\.json$/,
  /^\.scan-terms\.txt$/,
  /^ROADMAP\.md$/,
  /^specs\//,
  /^\.specify\//,
  /^\.claude\//,
  /^CLAUDE\.md$/,
]
const MUST_BE_PRESENT = ['LICENSE', 'SECURITY.md', 'README.md', '.env.example', 'docs/SELF-HOSTING.md', 'push-server/wrangler.example.toml']

// ---- shapes that look like secrets -----------------------------------------------------------------
const SECRET_SHAPES = [
  ['Google API key', /AIza[0-9A-Za-z_-]{35}/],
  ['GitHub token', /\bgh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{20,}/],
  ['secret key', /\bsk-[A-Za-z0-9_-]{20,}/],
  ['Slack token', /\bxox[abprs]-[A-Za-z0-9-]{10,}/],
  ['AWS key', /\bAKIA[0-9A-Z]{16}\b/],
  ['private key', /-----BEGIN [A-Z ]*PRIVATE KEY-----/],
  ['32-hex id (Cloudflare account or KV id)', /\b[0-9a-f]{32}\b/],
  ['email address', /[A-Za-z0-9._%+-]+@(?!example\.(?:com|org|net)\b)[A-Za-z0-9-]+\.(?:com|org|net|io|dev|app|me|co|fr|dz|ai)\b/],
  ['unfilled placeholder', /\[PUBLIC NAME\]/],
  ['workers.dev address', /\b[\w-]+\.(?!example\b|your-subdomain\b)[\w-]+\.workers\.dev\b/],
]

// ---- wording that would reveal how the project was made ---------------------------------------------
// Spelled in pieces so this file doesn't trip itself.
const word = (...parts) => new RegExp(parts.join(''), 'i')
const PRIVATE_WORDS = [
  ['attribution line', word('co-?', 'authored-?by')],
  ['attribution line', word('generated ', 'with')],
  ['AI assistant name', word('\\bcla', 'ude\\b')],
  ['AI vendor name', word('anthro', 'pic')],
  ['spec tool', word('spec-?', 'kit')],
  ['private working log', word('\\bPLAN', '(?:\\.md|-v1)\\b')],
  ['private branch name', word('re', 'design')],
  ['private working log', word('working ', 'log')],
  ['private file', word('docs/', 'next')],
  ['private file', word('ROAD', 'MAP')],
  ['private repository', word('Personal', 'Projects')],
  ['private repository', word('\\bexpenses\\.git\\b|github\\.com/[\\w-]+/expenses\\b')],
]

// ---- the owner's own values, read from local files --------------------------------------------------
function ownerTerms() {
  const terms = new Map() // value -> where it came from
  const add = (value, from, min = 6) => {
    const v = (value ?? '').trim()
    if (v.length >= min) terms.set(v, from)
  }
  const dotenv = (path) => {
    if (!existsSync(path)) return {}
    return Object.fromEntries(
      readFileSync(path, 'utf8')
        .split(/\r?\n/)
        .map((line) => /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line))
        .filter(Boolean)
        .map((m) => [m[1], m[2].replace(/^["']|["']$/g, '')]),
    )
  }
  const env = dotenv('.env.local')
  add(env.VITE_FIREBASE_PROJECT_ID, 'Firebase project id (.env.local)')
  add(env.VITE_FIREBASE_API_KEY, 'Firebase API key (.env.local)')
  add(env.VITE_FIREBASE_APP_ID, 'Firebase app id (.env.local)')
  add(env.VITE_VAPID_PUBLIC_KEY, 'VAPID public key (.env.local)')
  if (env.VITE_PUSH_API) {
    add(env.VITE_PUSH_API, 'Worker address (.env.local)')
    const host = /^https?:\/\/([^/]+)/.exec(env.VITE_PUSH_API)?.[1]
    add(host, 'Worker host (.env.local)')
    // The account's workers.dev subdomain: <worker>.<subdomain>.workers.dev
    add(/^[^.]+\.([^.]+)\.workers\.dev$/.exec(host ?? '')?.[1], 'Cloudflare subdomain (.env.local)', 4)
  }
  add(dotenv('push-server/.dev.vars').VAPID_PRIVATE_KEY, 'VAPID private key (push-server/.dev.vars)')
  if (existsSync('push-server/wrangler.toml')) {
    const toml = readFileSync('push-server/wrangler.toml', 'utf8')
    add(/^id = "([0-9a-f]{32})"/m.exec(toml)?.[1], 'KV namespace id (push-server/wrangler.toml)')
    add(/^VAPID_PUBLIC_KEY = "([^"]+)"/m.exec(toml)?.[1], 'VAPID public key (push-server/wrangler.toml)')
  }
  if (existsSync('.firebaserc')) {
    for (const [, id] of readFileSync('.firebaserc', 'utf8').matchAll(/"([a-z0-9-]{4,})"\s*[,}\n]/g)) if (id !== 'projects' && id !== 'default') add(id, 'Firebase project id (.firebaserc)')
  }
  try {
    add(git(['config', 'user.email']).toString(), 'git email')
  } catch {
    /* no git email set */
  }
  if (existsSync('.scan-terms.txt')) {
    for (const line of readFileSync('.scan-terms.txt', 'utf8').split(/\r?\n/)) add(line, 'a term from .scan-terms.txt', 3)
  }
  return terms
}

// ---- the files that would be published --------------------------------------------------------------
const paths = git(['ls-tree', '-r', '-z', '--name-only', ref])
  .toString('utf8')
  .split('\0')
  .filter(Boolean)

const findings = []
const found = (file, line, kind, excerpt) => {
  const allowed = ALLOW.some((rule) => rule.file === file && (rule.kind === 'any' || rule.kind === kind) && rule.line.test(excerpt))
  if (!allowed) findings.push({ file, line, kind, excerpt: excerpt.trim().slice(0, 140) })
}

for (const path of paths) {
  if (MUST_BE_ABSENT.some((re) => re.test(path))) found(path, 0, 'private path in the file list', path)
}
for (const path of MUST_BE_PRESENT) if (!paths.includes(path)) findings.push({ file: path, line: 0, kind: 'required file missing', excerpt: '' })

const owner = ownerTerms()
const ownerLower = [...owner].map(([value, from]) => [value.toLowerCase(), from])
const isLock = (path) => /(^|\/)(pnpm-lock\.yaml|package-lock\.json)$/.test(path)
// This file has to name the words it looks for, so it is the one file not read for them (it is still read for secrets and owner values).
const SELF = 'scripts/scan-public.mjs'
const isBinary = (buffer) => buffer.subarray(0, 8000).includes(0)

for (const path of paths) {
  const buffer = git(['show', `${ref}:${path}`])
  if (isBinary(buffer)) continue
  const lines = buffer.toString('utf8').split(/\r?\n/)
  lines.forEach((text, index) => {
    const lower = text.toLowerCase()
    for (const [kind, re] of SECRET_SHAPES) {
      if (isLock(path) && (kind.startsWith('32-hex') || kind === 'email address')) continue
      if (re.test(text)) found(path, index + 1, kind, text)
    }
    if (path !== SELF) for (const [kind, re] of PRIVATE_WORDS) if (re.test(text)) found(path, index + 1, kind, text)
    for (const [value, from] of ownerLower) if (lower.includes(value)) found(path, index + 1, 'owner value', `${from}: ${text}`.replace(/\s+/g, ' '))
  })
}

// ---- report -----------------------------------------------------------------------------------------
if (listFiles) {
  console.log(`Files that would be published (${paths.length}), from ${ref}:\n`)
  for (const path of paths) console.log(`  ${path}`)
  console.log('')
}
console.log(`Scanned ${paths.length} files from ${ref}. Owner values checked: ${owner.size}${owner.size === 0 ? ' (none found: .env.local and the other local files are missing, so only generic shapes were checked)' : ''}.`)
if (findings.length === 0) {
  console.log('No findings.')
} else {
  console.log(`\n${findings.length} finding${findings.length === 1 ? '' : 's'}:\n`)
  for (const f of findings) console.log(`  ${f.file}${f.line ? `:${f.line}` : ''}  [${f.kind}]  ${f.excerpt}`)
  process.exitCode = 1
}
