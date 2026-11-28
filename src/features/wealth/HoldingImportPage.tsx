import { useState, type ChangeEvent } from 'react'
import { useLocation } from 'wouter'
import {
  NumberGlyph,
  SelectGlyph,
  Table,
  Tag,
  TagSelect,
  TextGlyph,
  Td,
  Th,
  Tr,
} from '../../components/table'
import { Button, Card, Loading, Money, PageHeader } from '../../components/ui'
import { useHoldings } from '../../data/hooks'
import { readGrowwFile, saveHoldingImport, type ImportChoice } from '../../data/holdingImport'
import { matchHoldings, missingFromReport, type HoldingMatch } from '../../domain/holdingImport'
import { ASSET_CLASS_LABELS, HOLDING_KIND_LABELS, type Holding } from '../../domain/types'
import type { GrowwReport, ParsedHoldings } from '../../parser/groww'
import { currentMonth, formatMonth, formatShortDate } from '../../lib/dates'

const BACK = '/wealth/investments'

const REPORT_TITLES: Record<GrowwReport, string> = {
  mutual_funds: 'Mutual funds',
  stocks: 'Shares and ETFs',
}

interface Loaded {
  fileName: string
  holdings: ParsedHoldings
  /** Worked out once, when the file is read, so editing a choice doesn't re-suggest. */
  matches: (HoldingMatch | null)[]
}

export function HoldingImportPage() {
  const holdings = useHoldings()
  const [, navigate] = useLocation()
  // One report of each kind: loading another mutual funds file replaces the first.
  const [reports, setReports] = useState<Partial<Record<GrowwReport, Loaded>>>({})
  const [targets, setTargets] = useState<Record<string, string>>({})
  const [problems, setProblems] = useState<string[]>([])
  const [reading, setReading] = useState(false)
  const [error, setError] = useState('')

  if (!holdings) return <Loading />

  async function onFiles(e: ChangeEvent<HTMLInputElement>) {
    const picked = [...(e.target.files ?? [])]
    e.target.value = ''
    if (picked.length === 0 || !holdings) return
    setReading(true)
    const errors: string[] = []
    const next = { ...reports }
    const nextTargets = { ...targets }
    for (const file of picked) {
      const result = await readGrowwFile(file)
      if (!result.ok) {
        errors.push(`${file.name}: ${result.message}`)
        continue
      }
      const { report, rows } = result.holdings
      const matches = matchHoldings(rows, holdings)
      next[report] = { fileName: file.name, holdings: result.holdings, matches }
      rows.forEach((row, i) => {
        nextTargets[`${report}:${i}`] = row.problem ? 'skip' : (matches[i]?.holding.id ?? 'new')
      })
    }
    setReports(next)
    setTargets(nextTargets)
    setProblems(errors)
    setError('')
    setReading(false)
  }

  const loaded = (Object.entries(reports) as [GrowwReport, Loaded][]).sort(([a], [b]) =>
    a.localeCompare(b),
  )
  const choices: ImportChoice[] = loaded.flatMap(([report, l]) =>
    l.holdings.rows.map((row, i) => ({
      row,
      month: l.holdings.asOf.slice(0, 7),
      target: targets[`${report}:${i}`] ?? 'skip',
    })),
  )
  const toSave = choices.filter((c) => c.target !== 'skip').length
  const latestMonth = loaded.reduce((m, [, l]) => {
    const month = l.holdings.asOf.slice(0, 7)
    return month > m ? month : m
  }, '')

  async function save() {
    // Two rows can't both be the same holding in the same month; the second would overwrite.
    const seen = new Set<string>()
    for (const c of choices) {
      if (c.target === 'skip' || c.target === 'new') continue
      const key = `${c.target}:${c.month}`
      if (seen.has(key)) {
        const name = holdings?.find((h) => h.id === c.target)?.name
        return setError(`Two rows are set to save to “${name}”. Pick a different holding for one.`)
      }
      seen.add(key)
    }
    try {
      await saveHoldingImport(choices)
      navigate(
        latestMonth && latestMonth !== currentMonth() ? `${BACK}?month=${latestMonth}` : BACK,
      )
    } catch (e) {
      setError((e as Error).message)
    }
  }

  const options = holdings.filter((h) => !h.archived)

  return (
    <>
      <PageHeader title="Import from Groww" back={BACK} />
      <div className="space-y-6">
        <Card className="space-y-3 p-5">
          <p className="text-[15px]">
            Add Groww’s holdings reports as downloaded: the mutual funds one, the stocks one, or
            both. Each holding’s invested amount and worth are saved for the month of the report’s
            date, replacing values already entered for that month. Files are read on this device and
            not kept.
          </p>
          <label
            className={`inline-flex h-10 w-fit cursor-pointer items-center justify-center rounded-lg bg-accent px-5 text-[14.5px] font-medium text-accent-fg hover:opacity-90 ${reading ? 'pointer-events-none opacity-40' : ''}`}
          >
            {reading ? 'Reading…' : loaded.length > 0 ? 'Add another report' : 'Choose reports'}
            <input
              type="file"
              multiple
              accept=".xlsx,.xls,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv"
              className="sr-only"
              onChange={(e) => void onFiles(e)}
            />
          </label>
          {problems.map((p) => (
            <p key={p} className="text-[13px] text-negative">
              {p}
            </p>
          ))}
        </Card>

        {loaded.map(([report, l]) => (
          <ReportSection
            key={report}
            report={report}
            loaded={l}
            holdings={holdings}
            options={options}
            targets={targets}
            onTarget={(i, value) => setTargets((t) => ({ ...t, [`${report}:${i}`]: value }))}
          />
        ))}

        {loaded.length > 0 && (
          <div className="flex flex-wrap items-center justify-end gap-3">
            {error && (
              <p role="alert" className="mr-auto text-[13px] text-negative">
                {error}
              </p>
            )}
            <Button variant="ghost" className="h-9 px-4 text-[14px]" onClick={() => navigate(BACK)}>
              Cancel
            </Button>
            <Button
              className="h-9 px-4 text-[14px]"
              disabled={toSave === 0}
              onClick={() => void save()}
            >
              {toSave === 1 ? 'Save 1 holding' : `Save ${toSave} holdings`}
            </Button>
          </div>
        )}
      </div>
    </>
  )
}

function ReportSection({
  report,
  loaded,
  holdings,
  options,
  targets,
  onTarget,
}: {
  report: GrowwReport
  loaded: Loaded
  holdings: readonly Holding[]
  options: readonly Holding[]
  targets: Record<string, string>
  onTarget: (index: number, value: string) => void
}) {
  const { holdings: parsed, matches } = loaded
  const missing = missingFromReport(parsed.rows, holdings, report)
  const total = parsed.rows.reduce((sum, r) => sum + r.value, 0)

  return (
    <section className="space-y-2">
      <div className="px-1">
        <h2 className="text-[17px] font-semibold tracking-tight">{REPORT_TITLES[report]}</h2>
        <p className="text-[13px] text-muted">
          As on {formatShortDate(parsed.asOf, true)}, saved as{' '}
          {formatMonth(parsed.asOf.slice(0, 7))} values · {loaded.fileName}
        </p>
        {parsed.totalMismatch && (
          <p className="text-[13px] text-negative">
            These rows add up to <Money paise={parsed.totalMismatch.rows} />, but the report’s total
            is <Money paise={parsed.totalMismatch.printed} />. A row may be missing; check the file
            before saving.
          </p>
        )}
      </div>
      <Table minWidth={820}>
        <thead>
          <tr>
            <Th icon={<TextGlyph />}>In the report</Th>
            <Th className="w-56" icon={<SelectGlyph />}>
              Saves to
            </Th>
            <Th className="w-24" icon={<NumberGlyph />}>
              Units
            </Th>
            <Th className="w-28" icon={<NumberGlyph />}>
              Invested
            </Th>
            <Th className="w-28" icon={<NumberGlyph />}>
              Worth
            </Th>
          </tr>
        </thead>
        <tbody>
          {parsed.rows.map((row, i) => {
            const target = targets[`${report}:${i}`] ?? 'skip'
            const match = matches[i]
            return (
              <Tr key={`${row.isin ?? row.folio}-${i}`}>
                <Td className="max-w-0">
                  <span className="flex items-center gap-2">
                    <span className="truncate" title={row.name}>
                      {row.name}
                    </span>
                    {row.problem && (
                      <Tag color="#e03131" title={row.problem}>
                        Check
                      </Tag>
                    )}
                  </span>
                </Td>
                <Td>
                  <span className="flex items-center gap-2">
                    <TagSelect
                      aria-label={`Save ${row.name} to`}
                      value={target}
                      onChange={(e) => onTarget(i, e.target.value)}
                      title={
                        target === 'new'
                          ? `${HOLDING_KIND_LABELS[row.kind]} · ${ASSET_CLASS_LABELS[row.assetClass]}`
                          : undefined
                      }
                    >
                      <option value="new">New holding</option>
                      <option value="skip">Skip</option>
                      {options.map((h) => (
                        <option key={h.id} value={h.id}>
                          {h.name}
                        </option>
                      ))}
                    </TagSelect>
                    {match?.by === 'name' && target === match.holding.id && (
                      <span className="text-[12px] text-muted" title="Matched by name; check it">
                        by name
                      </span>
                    )}
                  </span>
                </Td>
                <Td className="text-right tabular-nums">{row.units}</Td>
                <Td className="text-right">
                  <Money paise={row.invested} />
                </Td>
                <Td className="text-right">
                  <Money paise={row.value} />
                </Td>
              </Tr>
            )
          })}
          <Tr>
            <Td className="font-medium">Total</Td>
            <Td />
            <Td />
            <Td className="text-right text-muted">
              <Money paise={parsed.rows.reduce((sum, r) => sum + r.invested, 0)} />
            </Td>
            <Td className="text-right font-medium">
              <Money paise={total} />
            </Td>
          </Tr>
        </tbody>
      </Table>
      {missing.length > 0 && (
        <p className="px-1 text-[13px] text-muted">
          Not in this report: {missing.map((h) => h.name).join(', ')}. If you sold{' '}
          {missing.length === 1 ? 'it' : 'them'}, archive {missing.length === 1 ? 'it' : 'them'}{' '}
          from the holding’s page.
        </p>
      )}
    </section>
  )
}
