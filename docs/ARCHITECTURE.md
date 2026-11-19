# Till: how it works

What the app is and how it behaves today.

## Goal

Till is a **personal (one-person) finance app** that:

- asks for salary, working hours and fixed expenses on first launch (onboarding)
- tracks every expense, paid in cash or by card, with a full dashboard and stats, and keeps a running count of your cash on hand
- manages monthly budgets per category, plus savings goals
- alerts when spending goes over budget, and reminds you at the end of the week if nothing was logged
- has a **"Is it worth it?"** calculator that turns a price into **hours of work**
- stores everything **locally** (offline-first), with optional Google sign-in and end-to-end encrypted sync
- is mobile-first and **installable on a phone** like an app

---

## Data model

All money movement becomes a **Transaction**. Marking a bill as paid creates a transaction, and so do goal deposits, ATM withdrawals, the salary on payday and cash-count differences. That single log is what makes the stats, alerts and reminders possible.

**Source of truth:** [src/types/index.ts](src/types/index.ts). In short:

| Record | Holds |
|---|---|
| `Profile` | Currency, salary (amount, frequency, payday or a date to count weekly and biweekly paydays from, wallet it lands in, the day the schedule last changed), work hours, hourly-rate basis, setup date, onboarding done |
| `IncomeSource` | Regular money on top of the salary: name, amount, how often, payday, wallet, category, start date. Its currency is its wallet's |
| `Account` (wallet) | Cash or bank, currency (left out means the main one), starting balance and its date, last cash count |
| `Category` | Name, icon, expense or income, limit per pay cycle, `optional` (Pets), `enabled`, `system` (Untracked cash) |
| `Bill` | Name, amount, category, wallet, frequency, due day, start date, active |
| `Transaction` | `expense` · `income` · `transfer` · `goal-deposit` · `goal-withdrawal` · `debt-out` · `debt-in`, amount (always positive), date, wallet, plus category / target wallet / bill / goal / debt / income source / `source` (`salary`, `cash-count`). An expense paid from a fund has `goalId` and `fundAmount`, the part the fund paid |
| `Goal` | Name, icon, target, deadline, planned amount per cycle, amount already saved before setup (`startingAmount`). A fund has `fund`: how its date repeats (`yearly`, `hijri-yearly`) or the bill it pays (`billId`) |
| `Debt` | Lent or borrowed, person, amount owed without money moving (`startingAmount`), date, due date, monthly payment and first payment date, closed or not |
| `WishlistItem` | Name, price, status (thinking / bought / skipped) |
| `Settings` | Theme, weekly reminder (Sat 20:00), cash check, alert thresholds, show work hours |

Every record has `id`, `createdAt`, `updatedAt` and `deleted` (soft delete), so Firebase sync can merge with "last write wins". Built-in wallets and categories use fixed ids (`acc-cash`, `cat-groceries`…) so two devices create identical ones.


### Key calculations

All calculations live in one place (`src/lib/`) and have unit tests. A test dataset ([src/test/previewExample.ts](src/test/previewExample.ts)) reproduces every number in the visual preview.

| Value | Formula |
|---|---|
| **Pay cycle** (budget month) | From payday to the day before the next payday, e.g. 25 Oct → 24 Nov. If payday is the 31st, it falls on the last day of shorter months. Weekly and biweekly pay: 7 or 14 days, from any known payday. Irregular pay: a month from the chosen day |
| Monthly plans with weekly or biweekly pay | Bills, goals and limits are monthly amounts. Each cycle carries its share (× 12/52 or × 12/26, in whole money). Plan › Bills, Goals and Debts follow calendar months |
| Wallet balance | starting balance + money in (income, transfers in, goal withdrawals) − money out (expenses less what a fund paid, goal deposits, transfers out), counting only transactions on or after the wallet's start date |
| Fund | Saved = starting amount + deposits − withdrawals − what it paid. Next needed: the next date it repeats on, or its bill's next unpaid due date. It plans its monthly amount but never past its target. A bill with a fund is planned through the fund, not as a bill, and in the cycle it's due takes what the fund holds first |
| Monthly salary | weekly × 52/12 · biweekly × 26/12 · monthly as is |
| Monthly work hours | hoursPerDay × daysPerWeek × 52/12 |
| **Hourly rate** | monthly salary ÷ monthly work hours |
| Monthly cost of a bill | weekly × 52/12 · quarterly ÷ 3 · yearly ÷ 12 |
| Free to spend (planned) | monthly salary − bills' monthly cost − goals' planned amounts |
| Left to spend | salary that arrived + other income + debt money in − bills − savings − debt money out and unpaid instalments − flexible spending this cycle (every expense that isn't a bill payment, including categories without a limit). What a fund paid is left out of both bills and spending: it was put aside before. Pay still on its way isn't counted. The cycle of setup, or of a change of schedule, takes the salary from settings because it came before then. Irregular pay starts from everything received, or from the monthly estimate while that's bigger |
| Debt owed | starting amount + money lent or borrowed − repayments, never below 0 |
| Safe to spend per day | left to spend ÷ days left in the cycle (today included), never below 0 |
| Budget pace | % of budget used vs % of pay cycle elapsed |
| Savings rate | (income − expenses) ÷ income |

---

## "Is it worth it?" calculator

1. Enter a price (and optionally a name and category).
2. The app shows:
   - **⏱ 6 h 40 min of work** (≈ 0.8 work days)
   - % of your monthly salary
   - % of what's left in that category's budget
   - impact on goals: "delays *Laptop* by 9 days at your current savings pace"
3. Choose one:
   - **Buy it**: logs it as an expense
   - **Skip it**: counted as "money saved by skipping" in Stats 🎉
   - **Wishlist**: think it over, with a reminder after a cooling-off period (default 48 h)
4. Optional: show the work-hours cost on every transaction and in Stats.

Edge cases: if work hours aren't set, the app asks for them. Two optional modes: "based on net salary" (default) or "based on free money after bills" (stricter).

---

## Alerts & reminders

### Alerts (checked every time an expense is added)

| Alert | Trigger | Shown as |
|---|---|---|
| Category near limit | ≥ 80% of the category budget (adjustable) | Toast + Home card |
| Category over budget | ≥ 100% | Red toast + Home card + notification |
| Total budget near/over | ≥ 80% / ≥ 100% of the monthly budget | Same |
| Spending too fast | % used is more than 15 points ahead of % of pay cycle elapsed | Home card |
| Bill due soon / overdue | Unpaid bill due in ≤ 3 days, or past due | Home card + notification |
| Goal off track | Current pace won't reach the goal by its deadline | Goals tab badge |
| Big purchase | A single expense above X% of salary | Work-hours prompt |
| Cash check | Optional weekly prompt: "Count your cash". If the count differs from what the app expects, one tap logs the difference as untracked cash spending | Home card |
| Pay expected | A payday arrived with no answer yet: Received, Other amount or Not received | Home card with buttons |

## Storage, backup and sync

- **Storage:** a Zustand store persisted to **IndexedDB** (via `idb-keyval`). It's bigger and more robust than localStorage and fully offline.
- **Schema version + migrations**, so future changes never break saved data.
- **Backup:** export/import a JSON file, plus a CSV export of transactions.
- **Sync:** Google sign-in (Firebase Auth) and Firestore, one end-to-end encrypted document per record, last-write-wins merge using `updatedAt` and soft deletes. The app's own IndexedDB stays the offline store; Firestore runs without its persistence, and a per-device cursor means a restart only reads what's new.

---

## Mobile & "phone app"

- Mobile-first layouts, with a bottom tab bar and bottom sheets instead of modals
- Touch targets ≥ 44px, `inputmode="decimal"` for amounts (numeric keypad), safe-area insets for notched phones
- **PWA** via `vite-plugin-pwa`: manifest, app icons, splash, offline service worker, "Install app" prompt. On Android and iOS it installs from the browser onto the home screen and opens full-screen like a native app
- Self-hosted fonts so the app works fully offline
- Optional later: wrap with **Capacitor** to get a real APK / App Store app with reliable notifications

---

## UI direction

- **Feel:** calm, clean, trustworthy. Lots of white space and big readable numbers, with color used only where it means something (green = good, amber = careful, red = over)
- **Design tokens** in Tailwind v4 `@theme` (CSS-first).
- **Dark mode** (system / light / dark)
- **Typography:** Manrope (as in the visual preview) + tabular numbers for amounts in lists
- **Each category** has its own icon. Charts show at most the top 4 categories plus "Other", in fixed colorblind-safe chart colors and always labelled, so colors stay easy to tell apart
- **Reusable UI kit:** Button, Card, StatTile, ProgressBar, BottomSheet, EmptyState, Toast, SegmentedControl, ConfirmDialog (see them at `/ui` in development). AmountInput and CategoryPicker come with Phases 3–4; a ProgressRing only if a screen needs one
- **Empty states** that teach ("No expenses yet. Tap ➕ to add your first one")
- Confirmation (with undo) for deletes
- **Accessibility:** labels on icon buttons, focus states, color is never the only signal, AA contrast

## Stack and layout

Vite, React 19, TypeScript (strict), Tailwind 4 (tokens in `@theme`), zustand + idb-keyval, react-router, Recharts, date-fns, vite-plugin-pwa (Workbox), vitest, pnpm. Firebase (Auth, Firestore, Hosting) for sync and hosting; a Cloudflare Worker (`push-server/`) for closed-app reminders.

```
src/
  app/         shell, router, layout, navigation
  pages/       Home, Activity, Plan, Stats, Wallets, WorthIt, Settings, Onboarding, UiKit (dev, /ui)
  components/  ui/ kit and per-area components
  store/       zustand store, IndexedDB storage, migrations, backup
  lib/         every calculation and export, with *.test.ts beside it
  sync/        Firebase sync engine, device keys, sealed records
  privacy/     policy text and operator details
  i18n/        en.ts (source), fr.ts, ar.ts
  types/       index.ts, the data model
  test/        previewExample.ts, demoData.ts
```

## Decisions

### Product decisions
- Single user, personal finances only (no "paid by")
- Local-first storage; optional Google sign-in and encrypted sync on top
- **Navigation:** `Home · Activity · ➕ · Plan · Stats`. Plan = Budget / Bills / Goals; Settings = gear icon
- **Phone app:** PWA now (installable, offline). Closed-app reminders come from the Cloudflare Worker
- **Language:** English, French and Arabic (right to left). `i18n/en.ts` is the source; `fr.ts` and `ar.ts` have the same shape. Changing language reloads the page, because modules read their text as they load. Arabic uses Latin digits and Algerian month names
- **Currency:** DA (Algerian Dinar) is the default main currency. Other currencies never convert: **no exchange rates anywhere**, since they change daily (user decision, 2026-11-04). Amounts in different currencies are never added together
- **Debts aren't spending:** lending and repaying move money through wallets and change left to spend, but never count as spending or income in Stats
- **Budget month:** runs from payday to the day before the next payday (e.g. 25th → 24th)
- **Weekly reminder:** Saturday at 20:00 (still changeable in Settings)
- **Cash tracking:** in v1. Two wallets, Cash and Bank card; every expense says which one paid; ATM withdrawals move money from bank to cash; an optional cash count catches forgotten spending
- **Categories:** main categories with subcategories, plus **Pets** as an optional category (off by default)

