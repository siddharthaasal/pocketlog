import { describe, expect, it } from 'vitest'
import { makeTransaction } from '../test/factories'
import {
  addMonths,
  knownPayees,
  matchingCharges,
  nextRenewalAfter,
  perMonth,
  perYear,
  recurringTotals,
  suggestRecurring,
  upcomingRenewals,
} from './recurring'

const charge = (description: string, date: string, amount = 649_00, extra = {}) =>
  makeTransaction({ description, date, amount, categoryId: 'cat-subscriptions', ...extra })

describe('cost conversion', () => {
  it('converts any billing period to per month and per year', () => {
    expect(perMonth(1200_00, 'yearly')).toBe(100_00)
    expect(perMonth(300_00, 'quarterly')).toBe(100_00)
    expect(perYear(100_00, 'monthly')).toBe(1200_00)
    expect(perYear(1200_00, 'yearly')).toBe(1200_00)
  })

  it('counts active items and those marked cancel, not cancelled ones', () => {
    const t = recurringTotals([
      { cost: 100_00, billing: 'monthly', status: 'active' },
      { cost: 1200_00, billing: 'yearly', status: 'cancel' },
      { cost: 999_00, billing: 'monthly', status: 'cancelled' },
    ])
    expect(t).toEqual({ perMonth: 200_00, perYear: 2400_00, cancelPerMonth: 100_00 })
  })
})

describe('dates', () => {
  it('adds months and keeps to the end of a short month', () => {
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28')
    expect(addMonths('2026-11-15', 3)).toBe('2027-02-15')
    expect(addMonths('2026-11-15', 12)).toBe('2027-11-15')
  })

  it('finds the next renewal after a date', () => {
    expect(nextRenewalAfter('2026-08-10', 'monthly', '2026-11-27')).toBe('2026-12-10')
    expect(nextRenewalAfter('2026-12-10', 'monthly', '2026-11-27')).toBe('2026-12-10')
    expect(nextRenewalAfter('2025-12-01', 'yearly', '2026-11-27')).toBe('2026-12-01')
  })

  it('lists renewals due soon, soonest first', () => {
    const items = [
      { id: 'a', renewal: '2026-12-10' },
      { id: 'b', renewal: '2026-11-30' },
      { id: 'c', renewal: '2027-06-01' },
      { id: 'd' },
    ]
    expect(upcomingRenewals(items, '2026-11-27', 30).map((i) => i.id)).toEqual(['b', 'a'])
  })
})

describe('suggestRecurring', () => {
  const today = '2026-11-27'

  it('spots a charge that repeats monthly', () => {
    const found = suggestRecurring(
      [
        charge('Netflix', '2026-09-05'),
        charge('Netflix', '2026-10-05'),
        charge('Netflix', '2026-11-05'),
        charge('Lunch', '2026-11-06', 250_00),
      ],
      new Set(),
      today,
    )
    expect(found).toHaveLength(1)
    expect(found[0]).toMatchObject({
      name: 'Netflix',
      cost: 649_00,
      billing: 'monthly',
      count: 3,
      nextRenewal: '2026-12-05',
    })
  })

  it('needs three charges for a monthly pattern, two for a yearly one', () => {
    expect(
      suggestRecurring(
        [charge('Spotify', '2026-10-05'), charge('Spotify', '2026-11-05')],
        new Set(),
        today,
      ),
    ).toEqual([])
    const yearly = suggestRecurring(
      [
        charge('Amazon Prime', '2025-11-20', 1499_00),
        charge('Amazon Prime', '2026-11-20', 1499_00),
      ],
      new Set(),
      today,
    )
    expect(yearly[0]).toMatchObject({ billing: 'yearly', nextRenewal: '2027-11-20' })
  })

  it('ignores irregular timing and very different amounts', () => {
    expect(
      suggestRecurring(
        [
          charge('Cafe', '2026-09-01', 300_00),
          charge('Cafe', '2026-09-20', 300_00),
          charge('Cafe', '2026-11-02', 300_00),
        ],
        new Set(),
        today,
      ),
    ).toEqual([])
    expect(
      suggestRecurring(
        [
          charge('Gym', '2026-09-05', 500_00),
          charge('Gym', '2026-10-05', 5000_00),
          charge('Gym', '2026-11-05', 500_00),
        ],
        new Set(),
        today,
      ),
    ).toEqual([])
  })

  it('skips payees already known, and charges already linked', () => {
    const rows = [
      charge('Netflix', '2026-09-05'),
      charge('Netflix', '2026-10-05'),
      charge('Netflix', '2026-11-05'),
    ]
    expect(suggestRecurring(rows, new Set(['netflix']), today)).toEqual([])
    expect(
      suggestRecurring(
        rows.map((r) => ({ ...r, subscriptionId: 's1' })),
        new Set(),
        today,
      ),
    ).toEqual([])
  })
})

describe('matching charges', () => {
  const rows = [
    charge('Netflix', '2026-10-05'),
    charge('NETFLIX.COM', '2026-11-05', 649_00, { subscriptionId: 's1' }),
    charge('Lunch', '2026-11-06'),
  ]
  it('finds unlinked charges from the same payee', () => {
    expect(matchingCharges('netflix', rows).map((t) => t.date)).toEqual(['2026-10-05'])
    expect(matchingCharges('netflix', rows, false)).toHaveLength(2)
    expect(matchingCharges('', rows)).toEqual([])
  })

  it('collects the payee keys that are already covered', () => {
    expect(
      knownPayees([
        { payeeKey: 'netflix' },
        { payeeKey: undefined },
        { payeeKey: 'x', deletedAt: 'now' },
      ]),
    ).toEqual(new Set(['netflix']))
  })
})

describe('renewalState', () => {
  it('says how close a renewal is', async () => {
    const { renewalState } = await import('./recurring')
    expect(renewalState(undefined, '2026-11-27')).toBe('none')
    expect(renewalState('2026-11-26', '2026-11-27')).toBe('overdue')
    expect(renewalState('2026-11-27', '2026-11-27')).toBe('soon')
    expect(renewalState('2026-12-27', '2026-11-27')).toBe('soon')
    expect(renewalState('2026-12-28', '2026-11-27')).toBe('later')
  })
})

describe('advanceRenewal', () => {
  it('moves one period on, even when paid before the due date', async () => {
    const { advanceRenewal } = await import('./recurring')
    expect(advanceRenewal('2026-12-12', 'yearly', '2026-11-27')).toBe('2027-12-12')
    expect(advanceRenewal('2026-11-20', 'quarterly', '2026-11-27')).toBe('2027-02-20')
  })

  it('skips periods that are already past', async () => {
    const { advanceRenewal } = await import('./recurring')
    expect(advanceRenewal('2025-03-01', 'yearly', '2026-11-27')).toBe('2027-03-01')
  })
})
