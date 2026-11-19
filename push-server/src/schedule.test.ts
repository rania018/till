import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { addDays, BILL_SLOT, dueNotifications, localClock, nearDay, parseDevice, rememberSent, withoutBillText, type Device } from './schedule'

/** What the app sends for a bill's name and amount: opaque to the server. */
const SEALED = 'AAAAAAAAAAAAAAAA.c2VhbGVkIGJ5dGVzIG9ubHkgdGhlIGRldmljZSBjYW4gb3Blbg=='

const subscription = { endpoint: 'https://push.example/abc', keys: { p256dh: 'p', auth: 'a' } }

function device(overrides: Partial<Device> = {}): Device {
  return {
    subscription,
    timeZone: 'Africa/Algiers', // UTC+1, no daylight saving
    weeklyReminder: { enabled: true, weekday: 6, time: '20:00' },
    onboardingCompleted: true,
    startDate: '2026-10-01',
    expenseDates: [],
    bills: [],
    ...overrides,
  }
}

/** Saturday 31 Oct 2026, 20:05 in Algiers (19:05 UTC). */
const saturdayEvening = new Date('2026-10-31T19:05:00Z')

describe('languages', () => {
  const bill = { id: 'b1', dueDate: '2026-11-01', sealed: SEALED }
  /** Saturday 31 Oct 2026, 10:00 in Algiers. */
  const morning = new Date('2026-10-31T09:00:00Z')

  it('writes notifications in the device language', () => {
    const [french] = dueNotifications(device({ language: 'fr', bills: [bill] }), morning)
    assert.equal(french.title, 'Facture à payer')
    assert.equal(french.body, 'Une facture est à payer demain')
    assert.equal(french.template, `${BILL_SLOT}, à payer demain`)
    const [arabic] = dueNotifications(device({ language: 'ar', bills: [bill] }), morning)
    assert.equal(arabic.title, 'فاتورة مستحقة')
    assert.ok(arabic.body.includes('غدًا'))
    assert.ok(arabic.template?.startsWith(`${BILL_SLOT}،`))
  })

  it('stays in English for an app that sends no language', () => {
    const [english] = dueNotifications(device({ bills: [bill] }), morning)
    assert.equal(english.body, 'A bill is due tomorrow')
    assert.equal(english.template, `${BILL_SLOT}, is due tomorrow`)
  })

  it('names days in the language', () => {
    assert.equal(nearDay('2026-10-27', '2026-10-31', 'fr'), 'mardi')
    assert.equal(nearDay('2026-10-17', '2026-10-31', 'fr'), '17 oct.')
    assert.equal(nearDay('2026-10-17', '2026-10-31', 'ar'), '17 أكتوبر')
  })

  it('accepts only known languages from a device', () => {
    const base = { subscription, timeZone: 'UTC', weeklyReminder: { enabled: true, weekday: 6, time: '20:00' }, onboardingCompleted: true, startDate: '2026-10-01', expenseDates: [], bills: [] }
    const parsed = (language: unknown) => parseDevice({ ...base, language }) as Device
    assert.equal(parsed('ar').language, 'ar')
    assert.equal(parsed('fr').language, 'fr')
    assert.equal(parsed('de').language, 'en')
    assert.equal(parsed(undefined).language, 'en')
  })
})

describe('localClock', () => {
  it('reads the wall clock in the device zone', () => {
    assert.deepEqual(localClock(saturdayEvening, 'Africa/Algiers'), { date: '2026-10-31', weekday: 6, minutes: 20 * 60 + 5 })
    // Same instant, west of the Atlantic: still Saturday afternoon.
    assert.deepEqual(localClock(saturdayEvening, 'America/New_York'), { date: '2026-10-31', weekday: 6, minutes: 15 * 60 + 5 })
    // Across midnight the date moves on.
    assert.deepEqual(localClock(saturdayEvening, 'Asia/Tokyo'), { date: '2026-11-01', weekday: 0, minutes: 4 * 60 + 5 })
  })
  it('falls back to UTC for an unknown zone', () => {
    assert.deepEqual(localClock(saturdayEvening, 'Mars/Olympus'), { date: '2026-10-31', weekday: 6, minutes: 19 * 60 + 5 })
  })
})

describe('dates', () => {
  it('adds days across months and years', () => {
    assert.equal(addDays('2026-10-31', 1), '2026-11-01')
    assert.equal(addDays('2026-10-31', -6), '2026-10-25')
    assert.equal(addDays('2026-12-31', 1), '2027-01-01')
  })
  it('describes a day the way the app does', () => {
    assert.equal(nearDay('2026-10-31', '2026-10-31'), 'today')
    assert.equal(nearDay('2026-11-01', '2026-10-31'), 'tomorrow')
    assert.equal(nearDay('2026-10-30', '2026-10-31'), 'yesterday')
    assert.equal(nearDay('2026-10-27', '2026-10-31'), 'Tuesday')
    assert.equal(nearDay('2026-10-17', '2026-10-31'), '17 Oct')
  })
})

describe('weekly reminder', () => {
  it('is sent just after the reminder time when the week has no expenses', () => {
    const messages = dueNotifications(device(), saturdayEvening)
    assert.equal(messages.length, 1)
    assert.equal(messages[0].key, 'weekly-2026-10-31')
    assert.equal(messages[0].url, '/')
  })
  it('is not sent before the reminder time, nor long after it', () => {
    assert.equal(dueNotifications(device(), new Date('2026-10-31T18:55:00Z')).length, 0)
    assert.equal(dueNotifications(device(), new Date('2026-10-31T22:10:00Z')).length, 0)
  })
  it('uses the device zone: Saturday 20:00 in New York is 01:00 Sunday in Algiers', () => {
    const newYork = device({ timeZone: 'America/New_York' })
    assert.equal(dueNotifications(newYork, saturdayEvening).length, 0)
    assert.equal(dueNotifications(newYork, new Date('2026-11-01T00:10:00Z')).length, 1)
  })
  it('stays quiet when something was logged in the 7 days up to the reminder', () => {
    assert.equal(dueNotifications(device({ expenseDates: ['2026-10-25'] }), saturdayEvening).length, 0)
    // The day before the week started doesn't count.
    assert.equal(dueNotifications(device({ expenseDates: ['2026-10-24'] }), saturdayEvening).length, 1)
  })
  it('respects the switch, setup, dismissal and the sent list', () => {
    assert.equal(dueNotifications(device({ weeklyReminder: { enabled: false, weekday: 6, time: '20:00' } }), saturdayEvening).length, 0)
    assert.equal(dueNotifications(device({ onboardingCompleted: false }), saturdayEvening).length, 0)
    assert.equal(dueNotifications(device({ startDate: '2026-11-01' }), saturdayEvening).length, 0)
    assert.equal(dueNotifications(device({ dismissedWeek: '2026-10-31' }), saturdayEvening).length, 0)
    assert.equal(dueNotifications(device({ sentKeys: ['weekly-2026-10-31'] }), saturdayEvening).length, 0)
  })
})

describe('bills', () => {
  const bills = [
    { id: 'b-rent', dueDate: '2026-11-01', sealed: SEALED },
    { id: 'b-net', dueDate: '2026-10-29', sealed: SEALED },
    { id: 'b-gym', dueDate: '2026-11-05', sealed: SEALED },
  ]
  /** Saturday 09:10 in Algiers. */
  const morning = new Date('2026-10-31T08:10:00Z')

  it('announces bills due by tomorrow and late ones from 9:00', () => {
    const messages = dueNotifications(device({ bills }), morning)
    assert.deepEqual(
      messages.map((m) => [m.key, m.body, m.template]),
      [
        ['bill-b-rent-2026-11-01', 'A bill is due tomorrow', `${BILL_SLOT}, is due tomorrow`],
        ['bill-b-net-2026-10-29', 'A bill was due Thursday', `${BILL_SLOT}, was due Thursday`],
      ],
    )
    assert.equal(messages[0].url, '/plan/bills')
  })
  it('passes the sealed name and amount on untouched, for the device to open', () => {
    const [message] = dueNotifications(device({ bills }), morning)
    assert.equal(message.sealed, SEALED)
  })
  it('stays generic for a bill sent without its sealed text', () => {
    const [message] = dueNotifications(device({ bills: [{ id: 'b-rent', dueDate: '2026-11-01' }] }), morning)
    assert.equal(message.body, 'A bill is due tomorrow')
    assert.equal(message.sealed, undefined)
    assert.equal(message.template, undefined)
  })
  it('waits for 9:00 and keeps quiet at night', () => {
    assert.equal(dueNotifications(device({ bills }), new Date('2026-10-31T07:50:00Z')).length, 0)
    assert.equal(dueNotifications(device({ bills }), new Date('2026-10-31T20:30:00Z')).length, 1, 'only the weekly reminder at 21:30')
  })
  it('never repeats a bill for the same due date', () => {
    const sent = device({ bills, sentKeys: ['bill-b-rent-2026-11-01', 'bill-b-net-2026-10-29'] })
    assert.equal(dueNotifications(sent, morning).length, 0)
  })
})

describe('withoutBillText', () => {
  it('takes names and amounts out of devices stored by an older server', () => {
    assert.deepEqual(withoutBillText([{ id: 'b1', name: 'Rent', dueDate: '2026-11-01', amountText: '20,000 DA' }]), [{ id: 'b1', dueDate: '2026-11-01' }])
  })
  it('leaves clean bills alone', () => {
    assert.equal(withoutBillText([{ id: 'b1', dueDate: '2026-11-01', sealed: SEALED }, { id: 'b2', dueDate: '2026-11-02' }]), null)
    assert.equal(withoutBillText([]), null)
  })
})

describe('rememberSent', () => {
  it('appends, de-duplicates and keeps the most recent 60', () => {
    assert.deepEqual(rememberSent(['a', 'b'], ['b', 'c']), ['a', 'b', 'c'])
    const many = Array.from({ length: 70 }, (_, i) => `k${i}`)
    const kept = rememberSent(many, ['new'])
    assert.equal(kept.length, 60)
    assert.equal(kept.at(-1), 'new')
    assert.equal(kept[0], 'k11')
  })
})

describe('parseDevice', () => {
  const valid = {
    subscription: { endpoint: 'https://push.example/abc', expirationTime: null, keys: { p256dh: 'p', auth: 'a' } },
    timeZone: 'Africa/Algiers',
    weeklyReminder: { enabled: true, weekday: 6, time: '20:00' },
    onboardingCompleted: true,
    startDate: '2026-10-01',
    expenseDates: ['2026-10-30', '2026-10-30', '2026-10-29'],
    dismissedWeek: null,
    bills: [{ id: 'b1', dueDate: '2026-11-01', sealed: SEALED }],
  }
  it('accepts a good payload and tidies it', () => {
    const parsed = parseDevice(valid)
    assert.equal(typeof parsed, 'object')
    const d = parsed as Device
    assert.deepEqual(d.expenseDates, ['2026-10-29', '2026-10-30'])
    assert.equal(d.bills.length, 1)
    assert.equal(d.dismissedWeek, null)
    assert.equal('sentKeys' in d, false, 'the app cannot set the sent list')
  })
  it('names the first bad field', () => {
    assert.equal(parseDevice(null), 'body')
    assert.equal(parseDevice({ ...valid, subscription: { endpoint: 'http://insecure', keys: { p256dh: 'p', auth: 'a' } } }), 'subscription')
    assert.equal(parseDevice({ ...valid, weeklyReminder: { enabled: true, weekday: 7, time: '20:00' } }), 'weeklyReminder.weekday')
    assert.equal(parseDevice({ ...valid, weeklyReminder: { enabled: true, weekday: 6, time: '8pm' } }), 'weeklyReminder.time')
    assert.equal(parseDevice({ ...valid, expenseDates: ['yesterday'] }), 'expenseDates')
    assert.equal(parseDevice({ ...valid, bills: [{ id: 'b1', dueDate: '1 Nov' }] }), 'bills.dueDate')
    assert.equal(parseDevice({ ...valid, bills: [{ id: 'b1', dueDate: '2026-11-01', sealed: 'Rent, 20,000 DA' }] }), 'bills.sealed')
  })
  it('never keeps a bill’s name or amount sent in the clear by an older app', () => {
    const old = parseDevice({ ...valid, bills: [{ id: 'b1', name: 'Rent', dueDate: '2026-11-01', amountText: '20,000 DA' }] }) as Device
    assert.deepEqual(old.bills, [{ id: 'b1', dueDate: '2026-11-01' }])
    assert.ok(!JSON.stringify(old).includes('Rent'))
  })
  it('ignores a sent list sent by the app', () => {
    const parsed = parseDevice({ ...valid, sentKeys: ['weekly-2026-10-31'] })
    assert.equal(typeof parsed, 'object')
    assert.equal((parsed as Device).sentKeys, undefined)
  })
  it('replaces an unknown time zone with UTC', () => {
    assert.equal((parseDevice({ ...valid, timeZone: 'Nowhere/Town' }) as Device).timeZone, 'UTC')
  })
})
