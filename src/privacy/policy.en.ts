import { menuPath, type PolicyFacts, type PrivacyPolicy } from './types'

export function enPolicy({ m, operator, passphraseMin, expenseDays, billDays, keepDays, sync, push }: PolicyFacts): PrivacyPolicy {
  const settings = m.settings.title
  const reminders = m.settings.reminders
  const { name, email } = operator
  const features = [sync && 'sync', push && 'reminders while the app is closed'].filter(Boolean).join(' or ')

  return {
    intro:
      features
        ? 'Till keeps your money on your device. This page says what leaves it, when, who can see it, and how to remove it. In short: nothing leaves unless you turn on ' + features + (sync ? ', and synced data is end-to-end encrypted, so nobody else can read it, including the people who run Till.' : '.')
        : 'Till keeps your money on your device. This page says what stays there and how to remove it. In short: nothing leaves your device.',
    sections: [
      ...(email || name
        ? [
            {
              title: 'Who runs Till',
              blocks: [
                [name && `Till is run by ${name}, who is responsible for the data described here.`, email && `For any question or request about your data, write to ${email}.`].filter(Boolean).join(' '),
              ],
            },
          ]
        : []),
      {
        title: 'On your device',
        blocks: [
          'Everything you enter (wallets, transactions, bills, budgets, goals, debts, notes and settings) is saved in this browser on this device. ' + (features ? `It isn’t sent anywhere unless you turn on ${features}.` : 'It isn’t sent anywhere.'),
          'The app lock’s PIN stays on this device, saved as a salted hash, never the digits. Fingerprint or face unlock goes through your device’s own sign-in: Till never receives them.',
          'Backups, spreadsheet exports and imports are made on your device. The files go wherever you save or send them.',
          'Clearing this site’s data in your browser deletes everything here, so save a backup now and then' + (sync ? ', or turn on sync.' : '.'),
        ],
      },
      {
        title: 'No tracking',
        blocks: ['Till has no ads, no analytics, no trackers and no third-party cookies. Your data isn’t sold, rented or shared with anyone, and isn’t used for anything but the app itself.'],
      },
      ...(sync
        ? [
            {
              title: `${m.sync.title} (optional)`,
              blocks: [
                'Signing in with Google creates an account for you in Till’s Firebase project (a Google service). It holds your email address, the name and profile picture link Google shares, and when you signed up and last signed in. Google handles the sign-in itself, under Google’s privacy policy.',
                `Before anything goes online, your device encrypts it with a key that’s locked by your sync passphrase (at least ${passphraseMin} characters) and by a recovery key you keep. Your passphrase and recovery key never leave your device. Nobody else can read your synced data: not Google, and not the people who run Till.`,
                'What can be seen online is limited to:',
                ['your email address and the sign-in details above', 'random-looking ids for your records', 'when each record was last saved', 'roughly how many records you have and how big they are'],
                'If you forget your passphrase and lose your recovery key, nobody can open your online copy, including the people who run Till. Your devices keep their own copies.',
                'Synced data is stored in Google’s data centres (Cloud Firestore and Firebase Authentication), which may be outside your country.',
              ],
            },
          ]
        : []),
      ...(push
        ? [
            {
              title: 'Reminders while the app is closed (optional)',
              blocks: [
                `If you turn on ${menuPath(settings, reminders.title, reminders.push)}, this device registers with Till’s reminder server (a Cloudflare Worker) under a random device id, and sends it:`,
                [
                  'the push address your browser gives it',
                  'your time zone and language',
                  'your weekly reminder’s day and time, and the week you dismissed one',
                  'whether setup is finished, and the day you started',
                  `the dates (not amounts) of expenses you logged by hand in the last ${expenseDays} days`,
                  `the due dates of unpaid bills in the next ${billDays} days`,
                ],
                'Bill names and amounts are sealed on your device with a key that never leaves it. The server keeps and forwards them without being able to read them, and your device opens them when the reminder arrives.',
                'The notification is delivered by your browser’s push service (Google, Mozilla or Apple), encrypted so they can’t read it.',
                `Turning the switch off deletes this from the server. A device that hasn’t checked in for ${keepDays} days is deleted automatically.`,
              ],
            },
          ]
        : []),
      {
        title: 'Servers and logs',
        blocks: [
          'Like any website, the services that deliver Till (Firebase Hosting, Google Cloud and Cloudflare) see your IP address and browser details, to deliver the app and protect it from abuse.' + (push ? ' The reminder server keeps short technical logs, such as a failed delivery, with the random device id.' : '') + ' Till doesn’t use any of this to identify or follow you.',
        ],
      },
      {
        title: 'Your choices',
        blocks: [
          [
            `Get a copy: ${menuPath(settings, m.data.title, m.data.exportBackup)}, or ${m.data.exportCsv}.`,
            `Correct anything: change it in the app${sync ? ', and sync carries the change' : ''}.`,
            ...(sync ? [`Stop syncing: ${menuPath(settings, m.settings.syncTitle, m.sync.signOut)}. Your data stays on your device and online.`] : []),
            ...(sync ? [`Delete your online copy: ${menuPath(settings, m.settings.syncTitle, m.sync.deleteOnline)}. Your encrypted data, your locked key and your sign-in account are removed from Till’s Firebase project.`] : []),
            `Delete everything, on this device${sync ? ' and online' : ''}: ${menuPath(settings, m.data.title, m.data.reset)}.`,
            ...(push ? [`Stop reminders while the app is closed: turn off “${reminders.push}”.`] : []),
            ...(email
              ? [`Ask what’s held about you, or ask for it to be deleted: write to ${email}.${sync ? ' Synced data is encrypted, so the people who run Till can’t read it or give it back to you, but they can delete it.' : ''}`]
              : []),
          ],
        ],
      },
      {
        title: 'Changes',
        blocks: ['If this policy changes, the new version is published here with a new date at the top.'],
      },
    ],
  }
}
