import { Card, PageHeader, SectionTitle } from '../../components/ui'

const POINTS: { title: string; body: string }[] = [
  {
    title: 'Your data stays on this device',
    body: 'Transactions, categories and accounts are stored in this browser’s database on this device only. PocketLog has no server, no account and no login.',
  },
  {
    title: 'Nothing is sent anywhere',
    body: 'The app makes no network requests with your data. There are no analytics, ads or trackers, and the page’s security policy blocks scripts from other sites.',
  },
  {
    title: 'The website only delivers the app',
    body: 'Anyone can open the web address, but they get an empty app with their own empty database. They can’t see yours.',
  },
  {
    title: 'Backups are files you control',
    body: 'A backup leaves the device only when you save or share it. Protect it with a passphrase if it will sit in iCloud Drive or be sent over AirDrop; it’s encrypted on this device with AES-256-GCM before it’s saved.',
  },
  {
    title: 'Siri entries pass through Apple',
    body: 'Dictation is handled by Apple, and the Siri inbox file lives in iCloud Drive. Apple can read iCloud Drive files unless Advanced Data Protection is turned on in your Apple Account settings.',
  },
  {
    title: 'Protecting the device protects the data',
    body: 'Anyone who can unlock this device can open PocketLog. Your passcode and Face ID are the lock.',
  },
]

export function PrivacyPage() {
  return (
    <>
      <PageHeader title="Privacy" back="/settings" />
      <section>
        <SectionTitle>How PocketLog handles your data</SectionTitle>
        <Card className="divide-y divide-border">
          {POINTS.map((p) => (
            <div key={p.title} className="px-5 py-4">
              <p className="text-[15px] font-medium">{p.title}</p>
              <p className="mt-1 text-[14px] text-muted">{p.body}</p>
            </div>
          ))}
        </Card>
      </section>
    </>
  )
}
