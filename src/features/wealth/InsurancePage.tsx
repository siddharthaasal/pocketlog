import { Link, useLocation } from 'wouter'
import {
  CalendarGlyph,
  NumberGlyph,
  SelectGlyph,
  SmallButton,
  Table,
  Tag,
  TextGlyph,
  Td,
  Th,
  Tr,
} from '../../components/table'
import { EmptyState, Loading, Money } from '../../components/ui'
import { usePolicies } from '../../data/hooks'
import { markRenewed } from '../../data/policies'
import { perYear, renewalState, type RenewalState } from '../../domain/recurring'
import { BILLING_LABELS, POLICY_KIND_LABELS } from '../../domain/types'
import { cx } from '../../lib/cx'
import { formatShortDate, todayISO } from '../../lib/dates'
import { Stat, WealthShell } from './WealthShell'

const STATE_TAG: Record<RenewalState, { label: string; color: string } | null> = {
  overdue: { label: 'Overdue', color: '#e03131' },
  soon: { label: 'Due soon', color: '#f08c00' },
  later: null,
  none: null,
}

export function InsurancePage() {
  const policies = usePolicies()
  const [, navigate] = useLocation()
  const today = todayISO()

  if (!policies) {
    return (
      <WealthShell>
        <Loading />
      </WealthShell>
    )
  }
  const active = policies.filter((p) => p.status === 'active')
  const premiums = active.reduce((sum, p) => sum + perYear(p.premium, p.frequency), 0)
  const cover = (kinds: readonly string[]) =>
    active.filter((p) => kinds.includes(p.kind)).reduce((sum, p) => sum + (p.sumAssured ?? 0), 0)
  const next = active
    .filter((p) => p.renewalDate)
    .sort((a, b) => a.renewalDate!.localeCompare(b.renewalDate!))[0]

  return (
    <WealthShell
      action={
        <Link
          href="/wealth/insurance/new"
          className="inline-flex h-9 items-center rounded-lg bg-accent px-4 text-[14px] font-medium text-accent-fg hover:opacity-90"
        >
          Add policy
        </Link>
      }
    >
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Premiums a year">
          <Money paise={premiums} />
        </Stat>
        <Stat label="Life cover">
          <Money paise={cover(['term'])} />
        </Stat>
        <Stat label="Health cover">
          <Money paise={cover(['health'])} />
        </Stat>
        <Stat label="Next renewal" hint={next?.name}>
          {next?.renewalDate ? formatShortDate(next.renewalDate) : '-'}
        </Stat>
      </div>

      {policies.length === 0 ? (
        <EmptyState title="No policies yet.">
          <Link
            href="/wealth/insurance/new"
            className="inline-flex h-10 items-center rounded-lg bg-accent px-5 text-[14.5px] font-medium text-accent-fg"
          >
            Add a policy
          </Link>
        </EmptyState>
      ) : (
        <Table minWidth={980}>
          <thead>
            <tr>
              <Th icon={<TextGlyph />}>Policy</Th>
              <Th className="w-28" icon={<SelectGlyph />}>
                Type
              </Th>
              <Th className="w-36" icon={<TextGlyph />}>
                Insurer
              </Th>
              <Th className="w-32" icon={<NumberGlyph />}>
                Cover
              </Th>
              <Th className="w-28" icon={<NumberGlyph />}>
                Premium
              </Th>
              <Th className="w-24" icon={<SelectGlyph />}>
                Paid
              </Th>
              <Th className="w-36" icon={<CalendarGlyph />}>
                Renews
              </Th>
              <Th className="w-36" />
            </tr>
          </thead>
          <tbody>
            {policies.map((p) => {
              const state = p.status === 'active' ? renewalState(p.renewalDate, today) : 'none'
              const tag = STATE_TAG[state]
              return (
                <Tr key={p.id} onClick={() => navigate(`/wealth/insurance/${p.id}`)}>
                  <Td className={cx('max-w-0', p.status !== 'active' && 'text-muted')}>
                    {p.name}
                    {p.status !== 'active' && (
                      <span className="ml-2 text-[12.5px]">
                        {p.status === 'lapsed' ? 'Lapsed' : 'Closed'}
                      </span>
                    )}
                  </Td>
                  <Td>
                    <Tag>{POLICY_KIND_LABELS[p.kind]}</Tag>
                  </Td>
                  <Td className="max-w-0 text-muted">{p.insurer}</Td>
                  <Td className="text-right">
                    {p.sumAssured ? <Money paise={p.sumAssured} /> : '-'}
                  </Td>
                  <Td className="text-right">
                    <Money paise={p.premium} />
                  </Td>
                  <Td className="text-muted">{BILLING_LABELS[p.frequency]}</Td>
                  <Td>
                    <span className="inline-flex items-center gap-2">
                      <span className="text-muted">
                        {p.renewalDate ? formatShortDate(p.renewalDate, true) : '-'}
                      </span>
                      {tag && <Tag color={tag.color}>{tag.label}</Tag>}
                    </span>
                  </Td>
                  <Td className="overflow-visible text-right" onClick={(e) => e.stopPropagation()}>
                    {p.status === 'active' && p.renewalDate && state !== 'later' && (
                      <SmallButton onClick={() => void markRenewed(p.id, today)}>
                        Mark paid
                      </SmallButton>
                    )}
                  </Td>
                </Tr>
              )
            })}
          </tbody>
        </Table>
      )}
    </WealthShell>
  )
}
