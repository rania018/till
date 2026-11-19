import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { debtOwed } from '../lib/debts'
import { expectedPays } from '../lib/income'
import { ACCOUNT_IDS, CATEGORY_IDS } from '../store/defaults'
import { SCHEMA_VERSION } from '../store/migrations'
import { createAppStore, pickData, whenHydrated, type AppStore } from '../store/store'
import { createSyncEngine, CURSOR_MARGIN_MS, type EnginePhase, type RemoteDoc, type SyncCursor, type SyncEngine, type SyncRemote, type SyncTarget } from './engine'
import { restoredData, type SyncDoc } from './records'

/** The online copy: one per account, shared by the devices in a test. */
function createCloud() {
  const docs = new Map<string, RemoteDoc>()
  const listeners = new Set<(docs: RemoteDoc[]) => void>()
  let clock = 1_000_000
  const cloud = {
    docs,
    writes: 0,
    failNextWrite: false,
    write(batch: SyncDoc[]) {
      if (cloud.failNextWrite) {
        cloud.failNextWrite = false
        return Promise.reject(new Error('network'))
      }
      cloud.writes += batch.length
      const written = batch.map((doc) => ({ ...doc, syncedAtMs: ++clock }))
      written.forEach((doc) => docs.set(doc.id, doc))
      listeners.forEach((listener) => listener(written))
      return Promise.resolve()
    },
    remote(): SyncRemote & { lastSince?: number } {
      const remote: SyncRemote & { lastSince?: number } = {
        listen(sinceMs, onDocs) {
          remote.lastSince = sinceMs
          // Answered later, as a server would be, so nothing happens during `listen` itself.
          const timer = setTimeout(() => onDocs([...docs.values()].filter((doc) => doc.syncedAtMs > sinceMs)), 0)
          listeners.add(onDocs)
          return () => {
            clearTimeout(timer)
            listeners.delete(onDocs)
          }
        },
        write: (batch) => cloud.write(batch),
      }
      return remote
    },
  }
  return cloud
}
type Cloud = ReturnType<typeof createCloud>

function memoryStorage() {
  const saved = new Map<string, string>()
  return {
    getItem: (name: string) => saved.get(name) ?? null,
    setItem: (name: string, value: string) => void saved.set(name, value),
    removeItem: (name: string) => void saved.delete(name),
  }
}

interface Device {
  store: AppStore
  engine: SyncEngine
  phases: EnginePhase[]
  online: { value: boolean }
  cursor: { value: SyncCursor | null }
  remote: ReturnType<Cloud['remote']>
}

async function openStore(): Promise<AppStore> {
  const store = createAppStore(memoryStorage())
  await whenHydrated(store)
  return store
}

function connect(store: AppStore, cloud: Cloud, shared?: Pick<Device, 'cursor'>): Device {
  const target: SyncTarget = {
    read: () => pickData(store.getState()),
    apply: (data) => store.getState().applySynced(data),
    subscribe: (listener) => store.subscribe(listener),
  }
  const online = { value: true }
  const cursor = shared?.cursor ?? { value: null as SyncCursor | null }
  const phases: EnginePhase[] = []
  const remote = cloud.remote()
  const engine = createSyncEngine({
    uid: 'me',
    target,
    remote,
    cursors: {
      load: async () => cursor.value,
      save: async (next) => {
        cursor.value = structuredClone(next)
      },
      clear: async () => {
        cursor.value = null
      },
    },
    isOnline: () => online.value,
    onStatus: (phase) => phases.push(phase),
    pushDelayMs: 1_000,
    retryDelayMs: 60_000,
  })
  return { store, engine, phases, online, cursor, remote }
}

async function device(cloud: Cloud): Promise<Device> {
  const connected = connect(await openStore(), cloud)
  await connected.engine.start()
  await settle()
  return connected
}

/** Runs everything that's due: the first read, debounced writes and what they trigger. */
const settle = () => vi.advanceTimersByTimeAsync(5_000)

function logExpense(store: AppStore, amount: number) {
  return store.getState().addTransaction({ type: 'expense', amount, accountId: ACCOUNT_IDS.cash, categoryId: 'cat-groceries' })
}

function setUp(store: AppStore, salary = 60_000) {
  store.getState().updateProfile({ name: 'Lina', salary: { amount: salary, frequency: 'monthly', payday: 25, accountId: ACCOUNT_IDS.bank } })
  store.getState().finishOnboarding('2026-01-01')
}

const liveTransactions = (d: Device) => d.store.getState().transactions.filter((t) => !t.deleted)

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-11-03T10:00:00.000Z'))
})

afterEach(() => {
  vi.useRealTimers()
})

describe('two devices', () => {
  it('brings everything to a new device, whose empty defaults change nothing', async () => {
    const cloud = createCloud()
    const phone = await device(cloud)
    setUp(phone.store)
    phone.store.getState().updateAccount(ACCOUNT_IDS.cash, { startingBalance: 7_500 })
    phone.store.getState().setCategoryBudgets({ 'cat-groceries': { monthlyBudget: 20_000 } })
    logExpense(phone.store, 250)
    await settle()

    vi.setSystemTime(new Date('2026-11-04T10:00:00.000Z')) // The new phone is set up later, so its defaults are "newer".
    const laptop = await device(cloud)

    const state = laptop.store.getState()
    expect(state.profile).toMatchObject({ name: 'Lina', onboardingCompleted: true })
    expect(state.profile.salary.amount).toBe(60_000)
    expect(state.accounts.find((a) => a.id === ACCOUNT_IDS.cash)?.startingBalance).toBe(7_500)
    expect(state.categories.find((c) => c.id === 'cat-groceries')?.monthlyBudget).toBe(20_000)
    expect(liveTransactions(laptop).map((t) => t.amount)).toEqual([250])
    expect(state.deviceId).not.toBe(phone.store.getState().deviceId)

    await settle()
    expect(phone.store.getState().accounts.find((a) => a.id === ACCOUNT_IDS.cash)?.startingBalance).toBe(7_500)
  })

  it('keeps a half-finished setup from replacing a finished one', async () => {
    const cloud = createCloud()
    const phone = await device(cloud)
    setUp(phone.store)
    await settle()

    vi.advanceTimersByTime(60_000)
    const store = await openStore()
    store.getState().updateProfile({ name: 'Typed just now' })
    const laptop = connect(store, cloud)
    await laptop.engine.start()
    await settle()

    expect(laptop.store.getState().profile).toMatchObject({ name: 'Lina', onboardingCompleted: true })
    expect(phone.store.getState().profile).toMatchObject({ name: 'Lina', onboardingCompleted: true })
  })

  it('merges what each device did offline', async () => {
    const cloud = createCloud()
    const phone = await device(cloud)
    const laptop = await device(cloud)

    phone.online.value = false
    laptop.online.value = false
    phone.engine.wentOffline()
    logExpense(phone.store, 100)
    logExpense(laptop.store, 200)
    await settle()
    expect(cloud.docs.size).toBeLessThan(40)
    expect(phone.phases.at(-1)).toBe('offline')

    phone.online.value = true
    laptop.online.value = true
    phone.engine.resync()
    laptop.engine.resync()
    await settle()

    const amounts = (d: Device) => liveTransactions(d).map((t) => t.amount).sort((a, b) => a - b)
    expect(amounts(phone)).toEqual([100, 200])
    expect(amounts(laptop)).toEqual([100, 200])
    expect(phone.phases.at(-1)).toBe('synced')
  })

  it('lets the later edit of the same record win, on both devices', async () => {
    const cloud = createCloud()
    const phone = await device(cloud)
    const expense = logExpense(phone.store, 100)
    await settle()
    const laptop = await device(cloud)

    phone.online.value = false
    laptop.online.value = false
    phone.store.getState().updateTransaction(expense.id, { amount: 111 })
    vi.advanceTimersByTime(1_000)
    laptop.store.getState().updateTransaction(expense.id, { amount: 222 })

    // The older edit reaches the cloud first; it must still lose.
    phone.online.value = true
    phone.engine.resync()
    await settle()
    laptop.online.value = true
    laptop.engine.resync()
    await settle()

    expect(liveTransactions(phone)[0].amount).toBe(222)
    expect(liveTransactions(laptop)[0].amount).toBe(222)
    expect(cloud.docs.get(`transactions:${expense.id}`)?.json).toContain('222')
  })

  it('passes deletions on, and undoing one too', async () => {
    const cloud = createCloud()
    const phone = await device(cloud)
    const expense = logExpense(phone.store, 100)
    await settle()
    const laptop = await device(cloud)
    expect(liveTransactions(laptop)).toHaveLength(1)

    phone.store.getState().deleteTransaction(expense.id)
    await settle()
    expect(liveTransactions(laptop)).toHaveLength(0)

    vi.advanceTimersByTime(1_000)
    phone.store.getState().restoreTransaction(expense.id)
    await settle()
    expect(liveTransactions(laptop)).toHaveLength(1)
  })

  it('logs one salary when both devices reach payday on their own', async () => {
    const cloud = createCloud()
    const phone = await device(cloud)
    setUp(phone.store)
    await settle()
    const laptop = await device(cloud)

    phone.online.value = false
    laptop.online.value = false
    phone.store.getState().confirmPay(expectedPays(phone.store.getState(), '2026-01-26')[0])
    vi.advanceTimersByTime(5_000)
    laptop.store.getState().confirmPay(expectedPays(laptop.store.getState(), '2026-01-26')[0])
    phone.online.value = true
    laptop.online.value = true
    phone.engine.resync()
    laptop.engine.resync()
    await settle()

    expect(liveTransactions(phone).filter((t) => t.source === 'salary')).toHaveLength(1)
    expect(liveTransactions(laptop).filter((t) => t.source === 'salary')).toHaveLength(1)
    expect(liveTransactions(phone)[0].id).toBe('salary-2026-01-25')
  })

  it('keeps the later answer when two devices disagree about a payday', async () => {
    const cloud = createCloud()
    const phone = await device(cloud)
    setUp(phone.store)
    await settle()
    const laptop = await device(cloud)

    phone.online.value = false
    laptop.online.value = false
    phone.store.getState().confirmPay(expectedPays(phone.store.getState(), '2026-01-26')[0], { amount: 65_000 })
    vi.advanceTimersByTime(5_000)
    laptop.store.getState().skipPay(expectedPays(laptop.store.getState(), '2026-01-26')[0])
    phone.online.value = true
    laptop.online.value = true
    phone.engine.resync()
    laptop.engine.resync()
    await settle()

    expect(liveTransactions(phone)).toHaveLength(0)
    expect(liveTransactions(laptop)).toHaveLength(0)
    expect(expectedPays(phone.store.getState(), '2026-01-26')).toEqual([])
  })

  it('asks again on every device when an answer is taken back', async () => {
    const cloud = createCloud()
    const phone = await device(cloud)
    setUp(phone.store)
    await settle()
    const laptop = await device(cloud)

    const undo = phone.store.getState().confirmPay(expectedPays(phone.store.getState(), '2026-01-26')[0])
    await settle()
    expect(liveTransactions(laptop)).toHaveLength(1)
    vi.advanceTimersByTime(5_000)
    undo()
    await settle()

    expect(liveTransactions(laptop)).toHaveLength(0)
    expect(expectedPays(laptop.store.getState(), '2026-01-26').map((p) => p.payDate)).toEqual(['2026-01-25'])
  })

  it('keeps two late salaries confirmed on the same day', async () => {
    const cloud = createCloud()
    const phone = await device(cloud)
    setUp(phone.store)
    await settle()
    const pays = expectedPays(phone.store.getState(), '2026-03-01')
    expect(pays).toHaveLength(2)
    for (const pay of pays) phone.store.getState().confirmPay(pay, { date: '2026-03-01' })
    await settle()
    const laptop = await device(cloud)
    await settle()

    expect(liveTransactions(phone)).toHaveLength(2)
    expect(liveTransactions(laptop)).toHaveLength(2)
  })

  it('brings income sources to the other device', async () => {
    const cloud = createCloud()
    const phone = await device(cloud)
    setUp(phone.store)
    phone.store.getState().addIncomeSource({ name: 'Rent', amount: 20_000, frequency: 'monthly', payday: 5, startDate: '2026-01-01', accountId: ACCOUNT_IDS.bank, categoryId: 'inc-other' })
    await settle()
    const laptop = await device(cloud)
    await settle()

    expect(laptop.store.getState().incomes.map((s) => s.name)).toEqual(['Rent'])
  })

  it('brings one-tap items to the other device, and their edits and deletes', async () => {
    const cloud = createCloud()
    const phone = await device(cloud)
    setUp(phone.store)
    const category = phone.store.getState().categories.find((c) => c.kind === 'expense' && !c.system)!.id
    const account = phone.store.getState().accounts[0].id
    const item = phone.store.getState().addQuickItem({ name: 'Coffee', amount: 250, accountId: account, categoryId: category })
    await settle()
    const laptop = await device(cloud)
    await settle()
    expect(laptop.store.getState().quickItems.map((i) => [i.name, i.amount])).toEqual([['Coffee', 250]])

    laptop.store.getState().updateQuickItem(item.id, { amount: 300 })
    await settle()
    expect(phone.store.getState().quickItems[0].amount).toBe(300)

    phone.store.getState().deleteQuickItem(item.id)
    await settle()
    expect(laptop.store.getState().quickItems[0].deleted).toBe(true)
  })

  it('brings assets and their new values to the other device', async () => {
    const cloud = createCloud()
    const phone = await device(cloud)
    setUp(phone.store)
    const gold = phone.store.getState().addAsset({ name: 'Gold', kind: 'gold', grams: 40, value: { date: '2026-07-01', value: 800_000, perGram: 20_000 } })
    await settle()
    const laptop = await device(cloud)
    await settle()
    expect(laptop.store.getState().assets.map((a) => [a.name, a.grams])).toEqual([['Gold', 40]])

    laptop.store.getState().setAssetValue(gold.id, { date: '2026-10-01', value: 880_000, perGram: 22_000 })
    await settle()
    expect(phone.store.getState().assets[0].values.map((v) => v.value)).toEqual([800_000, 880_000])
  })

  it('cleans up salaries that were logged with different ids before sync, the same way everywhere', async () => {
    const cloud = createCloud()
    const phone = await device(cloud)
    const old = {
      type: 'income' as const,
      amount: 60_000,
      date: '2026-10-25',
      accountId: ACCOUNT_IDS.bank,
      categoryId: CATEGORY_IDS.salary,
      source: 'salary' as const,
    }
    phone.store.getState().addTransaction(old)
    await settle()
    const store = await openStore()
    store.getState().addTransaction(old)
    const laptop = connect(store, cloud)
    await laptop.engine.start()
    await settle()

    expect(liveTransactions(laptop)).toHaveLength(1)
    expect(liveTransactions(phone)).toHaveLength(1)
    expect(liveTransactions(phone)[0].id).toBe(liveTransactions(laptop)[0].id)
  })

  it('makes a restored backup win over newer online data, on every device', async () => {
    const cloud = createCloud()
    const phone = await device(cloud)
    logExpense(phone.store, 100)
    const backup = pickData(phone.store.getState())
    await settle()
    const laptop = await device(cloud)

    vi.advanceTimersByTime(60_000)
    logExpense(laptop.store, 999) // Not in the backup.
    await settle()
    expect(liveTransactions(phone)).toHaveLength(2)

    vi.advanceTimersByTime(60_000)
    phone.store.getState().replaceData(restoredData(pickData(phone.store.getState()), backup))
    await settle()

    expect(liveTransactions(phone).map((t) => t.amount)).toEqual([100])
    expect(liveTransactions(laptop).map((t) => t.amount)).toEqual([100])
  })
})

describe('talking to the online copy', () => {
  it('reads before it writes: nothing goes out until the first read is in', async () => {
    const cloud = createCloud()
    const store = await openStore()
    logExpense(store, 100)
    const phone = connect(store, cloud)
    await phone.engine.start()
    expect(cloud.writes).toBe(0)
    await settle()
    expect(cloud.writes).toBeGreaterThan(0)
  })

  it('writes only what changed, and doesn’t send back what it received', async () => {
    const cloud = createCloud()
    const phone = await device(cloud)
    const laptop = await device(cloud)
    await settle()

    const before = cloud.writes
    logExpense(phone.store, 100)
    await settle()
    expect(cloud.writes).toBe(before + 1)
    expect(liveTransactions(laptop)).toHaveLength(1)
    await settle()
    expect(cloud.writes).toBe(before + 1)
  })

  it('sends a burst of edits as one write', async () => {
    const cloud = createCloud()
    const write = vi.spyOn(cloud, 'write')
    const phone = await device(cloud)
    write.mockClear()
    logExpense(phone.store, 1)
    logExpense(phone.store, 2)
    logExpense(phone.store, 3)
    await settle()
    expect(write).toHaveBeenCalledTimes(1)
    expect(write.mock.calls[0][0]).toHaveLength(3)
  })

  it('tries again after a failed write, without losing the change', async () => {
    const cloud = createCloud()
    const phone = await device(cloud)
    const expense = logExpense(phone.store, 100)
    cloud.failNextWrite = true
    await settle()
    expect(phone.phases.at(-1)).toBe('error')
    expect(cloud.docs.has(`transactions:${expense.id}`)).toBe(false)

    await vi.advanceTimersByTimeAsync(61_000)
    expect(cloud.docs.has(`transactions:${expense.id}`)).toBe(true)
    expect(phone.phases.at(-1)).toBe('synced')
  })

  it('sends changes made while offline on the next run, after a restart', async () => {
    const cloud = createCloud()
    const store = await openStore()
    const first = connect(store, cloud)
    await first.engine.start()
    await settle()
    first.online.value = false
    const expense = logExpense(store, 100)
    await settle()
    first.engine.stop()

    const second = connect(store, cloud, first)
    await second.engine.start()
    await settle()
    expect(cloud.docs.has(`transactions:${expense.id}`)).toBe(true)
  })

  it('resumes from where it left off instead of reading everything again', async () => {
    const cloud = createCloud()
    const store = await openStore()
    const first = connect(store, cloud)
    await first.engine.start()
    logExpense(store, 100)
    await settle()
    first.engine.stop()
    const sinceMs = first.cursor.value!.sinceMs
    expect(sinceMs).toBeGreaterThan(0)

    const second = connect(store, cloud, first)
    await second.engine.start()
    expect(second.remote.lastSince).toBe(Math.max(0, sinceMs - CURSOR_MARGIN_MS))
    const before = cloud.writes
    await settle()
    expect(cloud.writes).toBe(before)
  })

  it('starts over when the saved position belongs to another account', async () => {
    const cloud = createCloud()
    const store = await openStore()
    const phone = connect(store, cloud, { cursor: { value: { uid: 'someone-else', sinceMs: 9e12, seen: { profile: 'x' } } } })
    await phone.engine.start()
    expect(phone.remote.lastSince).toBe(0)
  })

  it('leaves everything alone when a newer version of the app wrote the data', async () => {
    const cloud = createCloud()
    const phone = await device(cloud)
    const name = phone.store.getState().profile.name
    await cloud.write([
      {
        id: 'profile',
        kind: 'profile',
        updatedAt: '2030-01-01T00:00:00.000Z',
        json: JSON.stringify({ ...pickData(phone.store.getState()).profile, name: 'From the future' }),
        schema: SCHEMA_VERSION + 1,
      },
    ])
    await settle()
    expect(phone.phases.at(-1)).toBe('outdated')
    expect(phone.store.getState().profile.name).toBe(name)

    const writes = cloud.writes
    logExpense(phone.store, 100)
    await settle()
    expect(cloud.writes).toBe(writes)
  })

  it('carries wallets, debts and their entries to the other device, whoever edits them', async () => {
    const cloud = createCloud()
    const phone = await device(cloud)
    const laptop = await device(cloud)

    const baridi = phone.store.getState().addAccount({ name: 'BaridiMob', kind: 'bank', startingBalance: 1_000, startDate: '2026-11-01', archived: false })
    const debt = phone.store.getState().addDebt(
      { direction: 'lent', person: 'Sami', startingAmount: 0, date: '2026-11-02', archived: false },
      { accountId: baridi.id, amount: 400, date: '2026-11-02' },
    )
    await settle()
    expect(laptop.store.getState().accounts.find((a) => a.id === baridi.id)?.name).toBe('BaridiMob')
    expect(laptop.store.getState().debts).toEqual(phone.store.getState().debts)
    expect(laptop.store.getState().transactions).toEqual(phone.store.getState().transactions)

    // A payment logged on the other device counts on the first.
    laptop.store.getState().addTransaction({ type: 'debt-in', amount: 150, date: '2026-11-03', accountId: baridi.id, debtId: debt.id })
    await settle()
    expect(debtOwed(debt, phone.store.getState().transactions)).toBe(250)

    // Deleting it reaches the first device too, and its entries stay.
    laptop.store.getState().deleteDebt(debt.id)
    await settle()
    expect(phone.store.getState().debts[0].deleted).toBe(true)
    expect(phone.store.getState().transactions.filter((t) => t.debtId === debt.id)).toHaveLength(2)
  })

  it('stops completely when stopped', async () => {
    const cloud = createCloud()
    const phone = await device(cloud)
    phone.engine.stop()
    const writes = cloud.writes
    logExpense(phone.store, 100)
    await settle()
    expect(cloud.writes).toBe(writes)
  })
})
