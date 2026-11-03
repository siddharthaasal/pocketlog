import { Card, SectionTitle } from '../../components/ui'

const STEPS: { title: string; detail: string }[] = [
  {
    title: 'Create the shortcut',
    detail: 'Open Shortcuts, tap +, and name it “Log expense”. That name is what you say to Siri.',
  },
  {
    title: 'Dictate Text',
    detail:
      'Add the Dictate Text action. Set Language to English (India) and Stop Listening to After Pause.',
  },
  {
    title: 'Current Date → Format Date',
    detail:
      'Add Current Date, then Format Date with Date Format set to ISO 8601 and Include ISO 8601 Time turned on.',
  },
  {
    title: 'Text',
    detail: 'Add a Text action containing the Formatted Date, a space, then the Dictated Text.',
  },
  {
    title: 'Append to Text File',
    detail: 'Append that Text to PocketLog/inbox.txt with Make New Line turned on.',
  },
  {
    title: 'Show Result',
    detail: 'Add Show Result with “Saved: ” followed by the Dictated Text, so Siri reads it back.',
  },
]

export function SiriSetupGuide() {
  return (
    <section>
      <SectionTitle>Set up Siri</SectionTitle>
      <Card className="p-5">
        <details className="group">
          <summary className="cursor-pointer list-none text-[15px] text-accent">
            <span className="group-open:hidden">Show the six steps</span>
            <span className="hidden group-open:inline">Hide steps</span>
          </summary>
          <ol className="mt-4 space-y-4">
            {STEPS.map((step, i) => (
              <li key={step.title} className="flex gap-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-surface-2 text-[13px] font-medium tabular-nums">
                  {i + 1}
                </span>
                <div>
                  <p className="text-[15px] font-medium">{step.title}</p>
                  <p className="text-[14px] text-muted">{step.detail}</p>
                </div>
              </li>
            ))}
          </ol>
          <div className="mt-5 space-y-2 border-t border-border pt-4 text-[14px] text-muted">
            <p>
              Then say <span className="text-text">“Hey Siri, log expense”</span> and speak the
              entry, for example “Spent 350 on lunch using HDFC yesterday”.
            </p>
            <p>
              Privacy: inbox.txt lives in the Shortcuts folder in iCloud Drive, so it also appears
              on your Mac. Apple can read iCloud Drive files unless Advanced Data Protection is on.
              Clear the file now and then by deleting it in Files; PocketLog remembers what it has
              already imported.
            </p>
          </div>
        </details>
      </Card>
    </section>
  )
}
