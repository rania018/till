# Running your own Till

Till works fully on one device with nothing set up. This guide is for when you want your own copy online, with sync between devices and reminders while the app is closed. Everything below fits in the free plans; **never add a payment card** to either account.

## 1. What needs what

| You want | You need | Free-plan limits that matter |
|---|---|---|
| Try it on your computer | Node.js 20.19+ or 22.12+ and [pnpm](https://pnpm.io) | none |
| Your own site, with sync | A Firebase project (Spark plan: Hosting, Firestore, Authentication) | Spark has daily read/write quotas; one person's data is far below them |
| Reminders while the app is closed | A Cloudflare account (Workers free plan, KV, cron) | 100,000 requests a day |

The two features are independent. With no settings at all, sync and the closed-app switch are hidden, nothing contacts any server, and the page's Content-Security-Policy allows only its own site.

## 2. Run it locally

```bash
pnpm install
pnpm dev          # http://localhost:5173
pnpm test
pnpm build && pnpm preview   # the production build, with the service worker
```

In development, `/ui` shows every building block of the interface on one page, and Settings › Developer can load made-up data.

## 3. Firebase (sync)

1. Create a project in the [Firebase console](https://console.firebase.google.com). Note its **project id**.
2. Build › Firestore Database › Create database, in **production mode**.
3. Project settings › Your apps › add a **Web app**. Copy `apiKey`, `projectId` and `appId`.
4. Copy `.env.example` to `.env.local` and fill in:
   ```
   VITE_FIREBASE_API_KEY=...
   VITE_FIREBASE_PROJECT_ID=...
   VITE_FIREBASE_APP_ID=...
   ```
   These values are public by design (they ship in the app). Access is decided by `firestore.rules`.
5. Install the CLI and sign in: `npm i -g firebase-tools`, `firebase login`, then `firebase use --add` and pick your project.
6. Deploy rules, Google sign-in and the site in one go: `pnpm sync:deploy <email of a project owner>`. Google shows that email on its sign-in screen.
7. Authentication › Settings › Authorized domains: keep your two Hosting addresses and **remove `localhost`** from the live project.
8. Check it: `pnpm sync:deploy --check` asks Google whether sign-in is accepted for both addresses.
9. `pnpm test:sync` runs the sync code and the real security rules on the local Firebase emulators (needs Java).

The hosting deploy refuses to run if the Firebase CLI points at a different project than `VITE_FIREBASE_PROJECT_ID`, so a copy can't overwrite someone else's site.

## 4. Cloudflare (reminders while the app is closed)

1. `cd push-server && npx wrangler login`, then back to the project root. In the Cloudflare dashboard, register a **workers.dev subdomain** (Workers & Pages › Overview, or the link `wrangler deploy` prints).
2. Make sure `.env.local` has `VITE_FIREBASE_PROJECT_ID` (or `VITE_FIREBASE_SITES`): the Worker only accepts calls from your site's addresses.
3. `pnpm push:deploy`. It makes a VAPID key pair (private half in `push-server/.dev.vars`), creates `push-server/wrangler.toml` from `wrangler.example.toml`, creates the KV namespace, uploads the secret, deploys the Worker, writes `VITE_PUSH_API` and `VITE_VAPID_PUBLIC_KEY` into `.env.local`, then deploys the site (`--no-web` skips that).
4. On a phone: Settings › Reminders and alerts › Allow notifications, then the **Also when the app is closed** switch.
5. Locally: `pnpm push:dev` runs the Worker on port 8787; a request to `/__scheduled` fires the cron by hand. Only this mode allows `localhost` origins (they come from `.dev.vars`).

## 5. Make it yours

- Who runs the site, and where people write about their data: `src/privacy/operator.ts`. The privacy policy leaves out whatever is empty. Change `POLICY_DATE` in `src/privacy/policy.ts` with any change of substance.
- Name and icons: `vite.config.ts` (manifest), `public/`, `docs/brand/`.

## 6. Deploy order

Worker first, then rules, then the site: `pnpm push:deploy` (Worker), then `pnpm sync:deploy <email>` (rules, sign-in, site). When a new kind of record is added in an update, deploy the rules before the site so no device writes something the rules refuse. To follow this project's updates: `git remote add upstream <this repository's address>` and merge from it.

## 7. Backups

Back up `push-server/.dev.vars`. If the VAPID private key is lost, `pnpm push:deploy` makes a new pair and devices register again the next time the app opens. `.env.local` can be rebuilt from the Firebase console. Neither file is committed.

## 8. Troubleshooting

- **`CONFIGURATION_NOT_FOUND` on sign-in:** Authentication isn't set up yet. Run `pnpm sync:deploy <email>`.
- **Signed out again on an iPhone:** sign in through your site's own address (the `.web.app` one), not another domain. The app already uses that address for sign-in pages.
- **CSP errors in the console after changing an address:** rebuild. The policy is made at build time from `.env.local`; check `VITE_FIREBASE_SITES` and `VITE_PUSH_API`.
- **The Worker refuses an origin:** its `ALLOWED_ORIGINS` lists only your site addresses. Run `pnpm push:deploy` again after changing them.
- **Port 8080 held by Java:** an earlier emulator run left a Java process. End it, then run `pnpm test:sync` again.
- **Nothing shows for sync or reminders:** a missing or partial value switches the feature off. All three Firebase values are needed; both push values are needed, and the push address must be `https`.
