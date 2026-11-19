import { Copy, Download, KeyRound, LockOpen, RotateCcw } from 'lucide-react'
import { Fragment, useEffect, useId, useState, type FormEvent } from 'react'
import { t } from '../../i18n'
import { saveFile } from '../../lib/saveFile'
import { changePassphrase, prepareRecoveryKey, prepareSetup, startOver, unlock, unlockWithRecovery, useSyncStatus, type PendingKey } from '../../sync'
import { passphraseProblem } from '../../sync/vault'
import { BottomSheet } from '../ui/BottomSheet'
import { Button } from '../ui/Button'
import { ConfirmDialog } from '../ui/ConfirmDialog'
import { Field } from '../ui/Field'
import { inputClass } from '../ui/formStyles'
import { toast } from '../ui/toastStore'

/**
 * The sync passphrase and recovery key: choosing them, unlocking a device with them, and
 * replacing them. The passphrase never leaves this file except into src/sync, which only
 * uses it on the device (src/sync/vault.ts).
 */

const messageOf = (error: unknown) => (error instanceof Error && error.message ? error.message : t.vault.saveFailed)

function PassphraseField({
  id,
  label,
  value,
  onChange,
  hint,
  error,
  autoComplete,
  autoFocus,
}: {
  id: string
  label: string
  value: string
  onChange: (value: string) => void
  hint?: string
  error?: string | null
  autoComplete: 'new-password' | 'current-password'
  autoFocus?: boolean
}) {
  const [shown, setShown] = useState(false)
  return (
    <Field label={label} htmlFor={id} hint={hint} error={error}>
      <div className="relative">
        <input
          id={id}
          type={shown ? 'text' : 'password'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          autoComplete={autoComplete}
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          autoFocus={autoFocus}
          dir="auto"
          className={inputClass({ invalid: Boolean(error), className: 'pe-20' })}
        />
        <button
          type="button"
          aria-pressed={shown}
          onClick={() => setShown((s) => !s)}
          className="absolute inset-y-0 end-0 rounded-e-xl px-3.5 text-sm font-bold text-accent hover:bg-surface-2"
        >
          {shown ? t.vault.hide : t.vault.show}
        </button>
      </div>
    </Field>
  )
}

/** Lets a password manager file the passphrase under the right account. */
function UsernameHint({ email }: { email?: string }) {
  return email ? <input type="email" name="username" autoComplete="username" value={email} readOnly hidden /> : null
}

/** A new passphrase, typed twice. */
function useNewPassphrase() {
  const [value, setValue] = useState('')
  const [again, setAgain] = useState('')
  const [tried, setTried] = useState(false)
  const problem = passphraseProblem(value) ? t.vault.tooShort : null
  const mismatch = again !== value ? t.vault.noMatch : null
  return {
    value,
    again,
    setValue,
    setAgain,
    /** Marks the fields as tried; true when they're good to use. */
    check: () => {
      setTried(true)
      return !problem && !mismatch
    },
    clear: () => {
      setValue('')
      setAgain('')
      setTried(false)
    },
    error: tried ? problem : null,
    againError: tried && !problem ? mismatch : null,
  }
}

function NewPassphraseFields({ field, label = t.vault.passphrase, autoFocus }: { field: ReturnType<typeof useNewPassphrase>; label?: string; autoFocus?: boolean }) {
  const id = useId()
  return (
    <>
      <PassphraseField id={`${id}-new`} label={label} hint={t.vault.passphraseHint} value={field.value} onChange={field.setValue} error={field.error} autoComplete="new-password" autoFocus={autoFocus} />
      <PassphraseField id={`${id}-again`} label={t.vault.confirmPassphrase} value={field.again} onChange={field.setAgain} error={field.againError} autoComplete="new-password" />
    </>
  )
}

/** The recovery key, shown once, with ways to keep it and a promise that it was kept. */
function RecoveryKeyStep({ pending, email, busy, error, onSave, saveLabel }: { pending: PendingKey; email?: string; busy: boolean; error: string | null; onSave: () => void; saveLabel: string }) {
  const id = useId()
  const [saved, setSaved] = useState(false)
  const copy = t.vault
  return (
    <div className="space-y-4">
      <div>
        <p className="font-bold">{copy.recoveryTitle}</p>
        <p className="mt-1 text-sm text-ink-2">{copy.recoveryIntro}</p>
      </div>
      {/* Lines only break after a dash, so a group is never split when it's copied down by hand. */}
      <p dir="ltr" className="select-all rounded-xl border border-line bg-surface-2 px-3.5 py-3 text-center font-mono text-[1.0625rem] font-bold tracking-wide">
        {pending.recoveryKey.split('-').map((group, i) => (
          <Fragment key={i}>
            {i > 0 && (
              <>
                -<wbr />
              </>
            )}
            {group}
          </Fragment>
        ))}
      </p>
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          variant="secondary"
          icon={Copy}
          onClick={() => {
            navigator.clipboard.writeText(pending.recoveryKey).then(
              () => toast(copy.copied, { tone: 'good' }),
              () => undefined,
            )
          }}
        >
          {copy.copy}
        </Button>
        <Button
          size="sm"
          variant="secondary"
          icon={Download}
          onClick={() => saveFile(copy.fileName, copy.fileText(pending.recoveryKey, email ?? '', t.format.dateTime(new Date().toISOString())), 'text/plain;charset=utf-8')}
        >
          {copy.download}
        </Button>
      </div>
      <label htmlFor={`${id}-saved`} className="flex items-start gap-3 text-[0.9375rem] font-semibold">
        <input id={`${id}-saved`} type="checkbox" checked={saved} onChange={(e) => setSaved(e.target.checked)} className="mt-0.5 size-5 shrink-0 accent-accent" />
        {copy.savedCheck}
      </label>
      {error && (
        <p role="alert" className="text-sm font-semibold text-crit-ink">
          {error}
        </p>
      )}
      <Button block disabled={!saved || busy} onClick={onSave}>
        {busy ? copy.working : saveLabel}
      </Button>
    </div>
  )
}

function PanelTitle({ children }: { children: string }) {
  return <p className="font-bold">{children}</p>
}

/** First device on an account: a passphrase, then the recovery key, then sync starts. */
function SetupForm({ email, withTitle }: { email?: string; withTitle?: boolean }) {
  const field = useNewPassphrase()
  const [pending, setPending] = useState<PendingKey | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const copy = t.vault

  async function choose(event: FormEvent) {
    event.preventDefault()
    if (!field.check()) return
    setBusy(true)
    setError(null)
    try {
      setPending(await prepareSetup(field.value))
      field.clear()
    } catch (e) {
      setError(messageOf(e))
    } finally {
      setBusy(false)
    }
  }

  async function finish() {
    if (!pending) return
    setBusy(true)
    setError(null)
    try {
      await pending.finish()
      toast(copy.done, { tone: 'good' })
    } catch (e) {
      setError(messageOf(e))
      setBusy(false)
    }
  }

  if (pending) return <RecoveryKeyStep pending={pending} email={email} busy={busy} error={error} onSave={() => void finish()} saveLabel={copy.turnOn} />

  return (
    <form className="space-y-4" onSubmit={(e) => void choose(e)}>
      <UsernameHint email={email} />
      <div>
        {withTitle && <PanelTitle>{copy.setupTitle}</PanelTitle>}
        <p className="mt-1 text-sm text-ink-2">{copy.setupIntro}</p>
      </div>
      <NewPassphraseFields field={field} />
      {error && (
        <p role="alert" className="text-sm font-semibold text-crit-ink">
          {error}
        </p>
      )}
      <Button type="submit" block disabled={busy}>
        {busy ? copy.working : copy.continue}
      </Button>
    </form>
  )
}

/** A device joining an account: the passphrase, or the recovery key and a new passphrase. */
function UnlockForm({ email, withTitle }: { email?: string; withTitle?: boolean }) {
  const id = useId()
  const [mode, setMode] = useState<'passphrase' | 'recovery'>('passphrase')
  const [passphrase, setPassphrase] = useState('')
  const [recoveryKey, setRecoveryKey] = useState('')
  const field = useNewPassphrase()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmStartOver, setConfirmStartOver] = useState(false)
  const copy = t.vault

  async function run(work: () => Promise<boolean>, wrong: string) {
    setBusy(true)
    setError(null)
    try {
      if (await work()) {
        toast(copy.unlocked, { tone: 'good' })
        return
      }
      setError(wrong)
    } catch (e) {
      setError(messageOf(e))
    }
    setBusy(false)
  }

  if (mode === 'passphrase') {
    return (
      <form
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault()
          if (passphrase) void run(() => unlock(passphrase), copy.wrongPassphrase)
        }}
      >
        <UsernameHint email={email} />
        <div>
          {withTitle && <PanelTitle>{copy.lockedTitle}</PanelTitle>}
          <p className="mt-1 text-sm text-ink-2">{copy.lockedIntro}</p>
        </div>
        <PassphraseField id={`${id}-passphrase`} label={copy.passphrase} value={passphrase} onChange={setPassphrase} error={error} autoComplete="current-password" />
        <Button type="submit" block icon={LockOpen} disabled={busy || !passphrase}>
          {busy ? copy.working : copy.unlock}
        </Button>
        <Button
          variant="ghost"
          block
          icon={KeyRound}
          onClick={() => {
            setError(null)
            setMode('recovery')
          }}
        >
          {copy.forgot}
        </Button>
      </form>
    )
  }

  return (
    <>
      <form
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault()
          if (field.check()) void run(() => unlockWithRecovery(recoveryKey, field.value), copy.wrongRecoveryKey)
        }}
      >
        <UsernameHint email={email} />
        {withTitle && <PanelTitle>{copy.forgot}</PanelTitle>}
        <Field label={copy.recoveryKey} htmlFor={`${id}-recovery`}>
          <input
            id={`${id}-recovery`}
            value={recoveryKey}
            onChange={(e) => setRecoveryKey(e.target.value)}
            autoComplete="off"
            autoCapitalize="characters"
            autoCorrect="off"
            spellCheck={false}
            dir="ltr"
            placeholder="XXXX-XXXX-XXXX-XXXX-…"
            className={inputClass({ className: 'font-mono' })}
          />
        </Field>
        <NewPassphraseFields field={field} label={copy.newPassphrase} />
        {error && (
          <p role="alert" className="text-sm font-semibold text-crit-ink">
            {error}
          </p>
        )}
        <Button type="submit" block disabled={busy || !recoveryKey}>
          {busy ? copy.working : copy.useRecovery}
        </Button>
        <Button
          variant="ghost"
          block
          onClick={() => {
            setError(null)
            setMode('passphrase')
          }}
        >
          {copy.back}
        </Button>
        <div className="flex items-center justify-between gap-3 border-t border-line pt-4">
          <span className="text-sm text-muted">{copy.lostBoth}</span>
          <Button size="sm" variant="ghost" icon={RotateCcw} className="text-crit-ink" onClick={() => setConfirmStartOver(true)}>
            {copy.startOver}
          </Button>
        </div>
      </form>
      <ConfirmDialog
        open={confirmStartOver}
        onOpenChange={setConfirmStartOver}
        title={copy.startOverTitle}
        body={copy.startOverBody}
        confirmLabel={copy.startOver}
        onConfirm={() => {
          startOver().catch((e: unknown) => toast(messageOf(e), { tone: 'crit' }))
        }}
      />
    </>
  )
}

/** What a signed-in device without its key shows: setup for a new account, unlock for an existing one. */
export function SyncKeyPanel({ phase, email, withTitle }: { phase: 'setup' | 'locked'; email?: string; withTitle?: boolean }) {
  return phase === 'setup' ? <SetupForm key="setup" email={email} withTitle={withTitle} /> : <UnlockForm key="locked" email={email} withTitle={withTitle} />
}

/** The same, in a sheet: for Home's reminder. Closes itself once the device can sync. */
export function SyncKeySheet({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { phase, email } = useSyncStatus()
  const keyPhase = phase === 'setup' || phase === 'locked' ? phase : null
  useEffect(() => {
    if (open && !keyPhase) onOpenChange(false)
  }, [open, keyPhase, onOpenChange])
  if (!keyPhase) return null
  return (
    <BottomSheet open={open} onOpenChange={onOpenChange} title={keyPhase === 'setup' ? t.vault.setupTitle : t.vault.lockedTitle}>
      <SyncKeyPanel phase={keyPhase} email={email} />
    </BottomSheet>
  )
}

export function ChangePassphraseSheet({ open, onOpenChange, email }: { open: boolean; onOpenChange: (open: boolean) => void; email?: string }) {
  const id = useId()
  const [currentPassphrase, setCurrentPassphrase] = useState('')
  const field = useNewPassphrase()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const copy = t.vault

  function close(next: boolean) {
    if (!next) {
      setCurrentPassphrase('')
      field.clear()
      setError(null)
    }
    onOpenChange(next)
  }

  async function save(event: FormEvent) {
    event.preventDefault()
    if (!field.check() || !currentPassphrase) return
    setBusy(true)
    setError(null)
    try {
      if (await changePassphrase(currentPassphrase, field.value)) {
        toast(copy.passphraseChanged, { tone: 'good' })
        close(false)
      } else {
        setError(copy.wrongPassphrase)
      }
    } catch (e) {
      setError(messageOf(e))
    }
    setBusy(false)
  }

  return (
    <BottomSheet open={open} onOpenChange={close} title={copy.changePassphrase} description={copy.changePassphraseHint}>
      <form className="space-y-4" onSubmit={(e) => void save(e)}>
        <UsernameHint email={email} />
        <PassphraseField id={`${id}-current`} label={copy.currentPassphrase} value={currentPassphrase} onChange={setCurrentPassphrase} error={error} autoComplete="current-password" />
        <NewPassphraseFields field={field} label={copy.newPassphrase} />
        <Button type="submit" block disabled={busy || !currentPassphrase}>
          {busy ? copy.working : copy.save}
        </Button>
      </form>
    </BottomSheet>
  )
}

export function NewRecoveryKeySheet({ open, onOpenChange, email }: { open: boolean; onOpenChange: (open: boolean) => void; email?: string }) {
  const id = useId()
  const [passphrase, setPassphrase] = useState('')
  const [pending, setPending] = useState<PendingKey | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const copy = t.vault

  function close(next: boolean) {
    if (!next) {
      setPassphrase('')
      setPending(null)
      setError(null)
      setBusy(false)
    }
    onOpenChange(next)
  }

  async function make(event: FormEvent) {
    event.preventDefault()
    if (!passphrase) return
    setBusy(true)
    setError(null)
    try {
      const next = await prepareRecoveryKey(passphrase)
      if (next) {
        setPending(next)
        setPassphrase('')
      } else {
        setError(copy.wrongPassphrase)
      }
    } catch (e) {
      setError(messageOf(e))
    }
    setBusy(false)
  }

  async function save() {
    if (!pending) return
    setBusy(true)
    setError(null)
    try {
      await pending.finish()
      toast(copy.recoveryReplaced, { tone: 'good' })
      close(false)
    } catch (e) {
      setError(messageOf(e))
      setBusy(false)
    }
  }

  return (
    <BottomSheet open={open} onOpenChange={close} title={copy.newRecoveryKey}>
      {pending ? (
        <RecoveryKeyStep pending={pending} email={email} busy={busy} error={error} onSave={() => void save()} saveLabel={copy.save} />
      ) : (
        <form className="space-y-4" onSubmit={(e) => void make(e)}>
          <UsernameHint email={email} />
          <p className="text-sm text-ink-2">{copy.newRecoveryKeyIntro}</p>
          <PassphraseField id={`${id}-passphrase`} label={copy.passphrase} value={passphrase} onChange={setPassphrase} error={error} autoComplete="current-password" autoFocus />
          <Button type="submit" block disabled={busy || !passphrase}>
            {busy ? copy.working : copy.continue}
          </Button>
        </form>
      )}
    </BottomSheet>
  )
}
