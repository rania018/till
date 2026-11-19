import { LayoutGrid, Monitor, Moon, Palette, Receipt, ShieldCheck, SlidersHorizontal, Sun, Tags, Wallet, Zap, type LucideIcon } from 'lucide-react'
import { ChevronRight } from '../components/ui/directionalIcons'
import { useId, type ReactNode } from 'react'
import { Link, useLocation } from 'react-router'
import { useShallow } from 'zustand/react/shallow'
import { InstallAction } from '../components/InstallPopup'
import { DataSettings } from '../components/settings/DataSettings'
import { PrivacySettings } from '../components/settings/PrivacySettings'
import { LanguageSelect } from '../components/settings/LanguageSelect'
import { DemoDataRow } from '../components/settings/DemoDataRow'
import { RemindersSettings } from '../components/settings/RemindersSettings'
import { SettingRow } from '../components/settings/SettingRow'
import { SyncSettings } from '../components/settings/SyncSettings'
import { PUSH_ENABLED } from '../app/pushConfig'
import { SYNC_ENABLED } from '../sync'
import { Card } from '../components/ui/Card'
import { inputClass } from '../components/ui/formStyles'
import { PageHeader } from '../components/ui/PageHeader'
import { SegmentedControl, SegmentedLinks } from '../components/ui/SegmentedControl'
import { Select } from '../components/ui/Select'
import { Toggle } from '../components/ui/Toggle'
import { useIsDesktop } from '../hooks/useMediaQuery'
import { t } from '../i18n'
import { totalMonthlyBills } from '../lib/bills'
import { formatMoney } from '../lib/money'
import { hourlyRate } from '../lib/workHours'
import { appStore, useAppStore } from '../store'

const COOLING_OFF_HOURS = [24, 48, 72, 168]

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mb-6">
      <h2 className="mb-2 px-1 text-xs font-bold uppercase tracking-wider text-muted">{title}</h2>
      {children}
    </section>
  )
}

/** Three columns of cards on a computer, each column ending on the same line. */
const COLUMNS = 'grid gap-6 @min-[48rem]:grid-cols-2 @min-[66rem]:grid-cols-3'
const COLUMN = 'flex min-w-0 flex-col gap-6'

/** A titled group whose card takes up whatever height its column has left. */
function DeskSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex min-w-0 grow flex-col">
      <h2 className="mb-3 text-base font-extrabold">{title}</h2>
      <div className="flex flex-1 flex-col *:grow">{children}</div>
    </section>
  )
}

/** A row that opens another page. */
function LinkRow({ to, icon: Icon, title, hint }: { to: string; icon: LucideIcon; title: string; hint?: string }) {
  return (
    <Link to={to} className="-mx-2 flex items-center gap-3 rounded-xl px-2 py-2.5 transition-colors hover:bg-surface-2">
      <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent">
        <Icon aria-hidden className="size-[1.125rem]" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-bold">{title}</span>
        {hint && <span className="block text-sm text-muted">{hint}</span>}
      </span>
      <ChevronRight aria-hidden className="size-5 shrink-0 text-muted" />
    </Link>
  )
}

export function SettingsPage() {
  const id = useId()
  const desktop = useIsDesktop()
  const { pathname } = useLocation()
  const { profile, settings, bills } = useAppStore(useShallow((s) => ({ profile: s.profile, settings: s.settings, bills: s.bills })))
  const { updateProfile, updateSettings } = appStore.getState()
  const copy = t.settings
  const rate = hourlyRate(profile, totalMonthlyBills(bills))
  const money = (amount: number) => formatMoney(amount, profile.currency)
  const payHint =
    profile.salary.frequency === 'irregular' && profile.salary.amount <= 0
      ? copy.payVaries
      : profile.salary.amount > 0
      ? `${copy.paySummary(money(profile.salary.amount), copy.frequencies[profile.salary.frequency], profile.work.hoursPerDay, profile.work.daysPerWeek)}${rate ? `. ${copy.payRate(money(Math.round(rate)))}.` : ''}`
      : copy.payNotSet

  const youFields = (
    <>
              <label htmlFor={`${id}-name`} className="block">
                <span className="mb-1.5 block text-sm font-bold">{copy.name}</span>
                <input
                  id={`${id}-name`}
                  value={profile.name ?? ''}
                  onChange={(e) => updateProfile({ name: e.target.value || undefined })}
                  placeholder={copy.namePlaceholder}
                  autoComplete="given-name"
                  className={inputClass()}
                />
              </label>
              <div className="grid gap-4 sm:grid-cols-2 desk:grid-cols-1">
                <label htmlFor={`${id}-currency`} className="block">
                  <span className="mb-1.5 block text-sm font-bold">{copy.currency}</span>
                  <Select id={`${id}-currency`} value={profile.currency} onChange={(e) => updateProfile({ currency: e.target.value })}>
                    {Object.entries(copy.currencies).map(([code, label]) => (
                      <option key={code} value={code}>
                        {label}
                      </option>
                    ))}
                  </Select>
                  <span className="mt-1.5 block text-sm text-muted">{copy.currencyHint}</span>
                </label>
                <label htmlFor={`${id}-language`} className="block">
                  <span className="mb-1.5 block text-sm font-bold">{copy.language}</span>
                  <LanguageSelect id={`${id}-language`} />
                  <span className="mt-1.5 block text-sm text-muted">{copy.languageHint}</span>
                </label>
              </div>
    </>
  )

  const worthRows = (
    <>
              <SettingRow
                title={copy.showWorkHours}
                hint={copy.showWorkHoursHint}
                control={<Toggle label={copy.showWorkHours} checked={settings.showWorkHours} onChange={(showWorkHours) => updateSettings({ showWorkHours })} />}
              />
              <SettingRow title={copy.basis} hint={copy.basisHint}>
                <SegmentedControl
                  label={copy.basis}
                  value={profile.hourlyRateBasis}
                  onChange={(hourlyRateBasis) => updateProfile({ hourlyRateBasis })}
                  options={[
                    { value: 'net-salary', label: t.worthIt.basis['net-salary'] },
                    { value: 'after-bills', label: t.worthIt.basis['after-bills'] },
                  ]}
                />
              </SettingRow>
              <SettingRow title={copy.coolingOff}>
                <Select aria-label={copy.coolingOff} value={settings.coolingOffHours} onChange={(e) => updateSettings({ coolingOffHours: Number(e.target.value) })}>
                  {COOLING_OFF_HOURS.map((hours) => (
                    <option key={hours} value={hours}>
                      {copy.coolingOffOption(hours)}
                    </option>
                  ))}
                </Select>
              </SettingRow>
    </>
  )

  const themeBody = (
    <>
              <div>
                <p className="font-bold">{copy.theme}</p>
                <p className="text-sm text-muted">{copy.themeHint}</p>
              </div>
              <SegmentedControl
                label={copy.theme}
                value={settings.theme}
                onChange={(theme) => updateSettings({ theme })}
                options={[
                  { value: 'system', label: copy.themeSystem, icon: Monitor },
                  { value: 'light', label: copy.themeLight, icon: Sun },
                  { value: 'dark', label: copy.themeDark, icon: Moon },
                ]}
              />
    </>
  )

  const aboutBody = (
    <>
              <p className="font-bold">{copy.about}</p>
              <p className="mt-1 text-sm text-muted">{copy.aboutBody({ sync: SYNC_ENABLED, push: PUSH_ENABLED })}</p>
              <div className="mt-3 border-t border-line pt-1">
                <LinkRow to="/privacy" icon={ShieldCheck} title={t.policy.title} hint={t.policy.hint} />
              </div>
    </>
  )

  if (desktop) {
    const section = pathname.endsWith('/money') ? 'money' : pathname.endsWith('/privacy') ? 'privacy' : 'general'
    const moneyLinks: { to: string; icon: LucideIcon; title: string; hint: string }[] = [
      { to: '/settings/pay', icon: Wallet, title: copy.payTitle, hint: payHint },
      { to: '/plan/budget/edit', icon: LayoutGrid, title: copy.limits, hint: copy.limitsHint },
      { to: '/plan/bills', icon: Receipt, title: copy.bills, hint: copy.billsHint },
      { to: '/settings/categories', icon: Tags, title: copy.categories, hint: copy.categoriesHint },
      { to: '/settings/quick-items', icon: Zap, title: t.quickItems.title, hint: copy.quickItemsHint },
      { to: '/wallets', icon: Wallet, title: copy.wallets, hint: copy.walletsHint },
    ]
    return (
      <>
        <PageHeader
          title={copy.title}
          showSettings={false}
          centerNav
          nav={
            <SegmentedLinks
              prominent
              label={copy.tabsLabel}
              links={[
                { to: '/settings', label: copy.tabGeneral, end: true },
                { to: '/settings/money', label: copy.tabMoney },
                { to: '/settings/privacy', label: copy.tabPrivacy },
              ]}
            />
          }
        />
        <div className="space-y-6 @container">
          {section === 'general' && (
            <>
              <div className={COLUMNS}>
                <div className={COLUMN}>
                  <DeskSection title={copy.you}>
                    <Card className="space-y-4">{youFields}</Card>
                  </DeskSection>
                  <DeskSection title={t.onboardingAgain.title}>
                    <Card className="py-2">
                      <LinkRow to="/onboarding/2" icon={SlidersHorizontal} title={t.onboardingAgain.row} hint={t.onboardingAgain.hint} />
                    </Card>
                  </DeskSection>
                </div>
                <div className={COLUMN}>
                  <DeskSection title={copy.reminders.title}>
                    <RemindersSettings />
                  </DeskSection>
                </div>
                <div className={COLUMN}>
                  <DeskSection title={copy.appearance}>
                    <Card className="space-y-3">{themeBody}</Card>
                  </DeskSection>
                  <DeskSection title={copy.device}>
                    <Card>
                      <SettingRow title={copy.install} hint={copy.installHint}>
                        <InstallAction />
                      </SettingRow>
                    </Card>
                  </DeskSection>
                </div>
              </div>
              <DeskSection title={copy.aboutTitle}>
                <Card>{aboutBody}</Card>
              </DeskSection>
              {import.meta.env.DEV && (
                <DeskSection title={copy.developer}>
                  <Card className="grid gap-x-12 py-2 @min-[66rem]:grid-cols-2">
                    <LinkRow to="/ui" icon={Palette} title={copy.uiKit} hint={copy.uiKitHint} />
                    <DemoDataRow />
                  </Card>
                </DeskSection>
              )}
            </>
          )}

          {section === 'money' && (
            <>
              <ul className="grid gap-6 @min-[48rem]:grid-cols-2 @min-[66rem]:grid-cols-3">
                {moneyLinks.map(({ to, icon: Icon, title, hint }) => (
                  <li key={to} className="min-w-0">
                    <Link to={to} className="flex h-full items-center gap-3 rounded-2xl border border-line bg-surface p-5 transition-colors hover:border-accent/40">
                      <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent">
                        <Icon aria-hidden className="size-[1.125rem]" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block font-bold">{title}</span>
                        <span className="block text-sm text-muted">{hint}</span>
                      </span>
                      <ChevronRight aria-hidden className="size-5 shrink-0 text-muted" />
                    </Link>
                  </li>
                ))}
              </ul>
              <DeskSection title={copy.worthItTitle}>
                {/* Three settings on the page's three columns. */}
                <Card className="grid gap-x-12 gap-y-6 @min-[48rem]:grid-cols-2 @min-[66rem]:grid-cols-3 *:py-0!">{worthRows}</Card>
              </DeskSection>
            </>
          )}

          {section === 'privacy' && (
            <div className={COLUMNS}>
              <DeskSection title={t.lock.section}>
                <PrivacySettings />
              </DeskSection>
              <DeskSection title={t.data.title}>
                <DataSettings />
              </DeskSection>
              {SYNC_ENABLED && (
                <DeskSection title={copy.syncTitle}>
                  <SyncSettings />
                </DeskSection>
              )}
            </div>
          )}
        </div>
      </>
    )
  }

  return (
    <div className="max-w-xl lg:max-w-none">
      <PageHeader title={copy.title} showSettings={false} />

      {/* Two groups in reading order, side by side on wider screens. */}
      <div className="lg:grid lg:grid-cols-2 lg:items-start lg:gap-x-6">
        <div>

          <Section title={copy.you}>
            <Card className="space-y-4">
              {youFields}
            </Card>
          </Section>

          <Section title={copy.payTitle}>
            <Card className="py-2">
              <LinkRow to="/settings/pay" icon={Wallet} title={copy.payTitle} hint={payHint} />
            </Card>
          </Section>

          <Section title={copy.budgetTitle}>
            <Card className="py-2">
              <LinkRow to="/plan/budget/edit" icon={LayoutGrid} title={copy.limits} hint={copy.limitsHint} />
              <LinkRow to="/plan/bills" icon={Receipt} title={copy.bills} hint={copy.billsHint} />
              <LinkRow to="/settings/categories" icon={Tags} title={copy.categories} hint={copy.categoriesHint} />
              <LinkRow to="/settings/quick-items" icon={Zap} title={t.quickItems.title} hint={copy.quickItemsHint} />
              <LinkRow to="/wallets" icon={Wallet} title={copy.wallets} hint={copy.walletsHint} />
            </Card>
          </Section>

          <Section title={copy.reminders.title}>
            <RemindersSettings />
          </Section>
        </div>

        <div>

          <Section title={copy.worthItTitle}>
            <Card className="divide-y divide-line">
              {worthRows}
            </Card>
          </Section>

          <Section title={copy.appearance}>
            <Card className="space-y-3">
              {themeBody}
            </Card>
          </Section>

          <Section title={t.lock.section}>
            <PrivacySettings />
          </Section>

          <Section title={t.data.title}>
            <DataSettings />
          </Section>

          <Section title={copy.device}>
            <Card>
              <SettingRow title={copy.install} hint={copy.installHint}>
                <InstallAction />
              </SettingRow>
            </Card>
          </Section>

          {SYNC_ENABLED && (
            <Section title={copy.syncTitle}>
              <SyncSettings />
            </Section>
          )}

          <Section title={t.onboardingAgain.title}>
            <Card className="py-2">
              <LinkRow to="/onboarding/2" icon={SlidersHorizontal} title={t.onboardingAgain.row} hint={t.onboardingAgain.hint} />
            </Card>
          </Section>

          <Section title={copy.aboutTitle}>
            <Card>
              {aboutBody}
            </Card>
          </Section>

          {import.meta.env.DEV && (
            <Section title={copy.developer}>
              <Card className="py-2">
                <LinkRow to="/ui" icon={Palette} title={copy.uiKit} hint={copy.uiKitHint} />
              <DemoDataRow />
              </Card>
            </Section>
          )}
        </div>
      </div>
    </div>
  )
}
