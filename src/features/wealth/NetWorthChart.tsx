import { formatINRCompact } from '../../domain/money'
import type { SnapshotRow } from '../../domain/networth'
import { formatMonth } from '../../lib/dates'

const W = 640
const H = 200
const PAD = { left: 8, right: 8, top: 16, bottom: 28 }

/** Net worth month by month. Drawn to scale from the lowest to the highest closed month. */
export function NetWorthChart({ rows }: { rows: readonly SnapshotRow[] }) {
  if (rows.length === 0) return null
  const values = rows.map((r) => r.summary.netWorth)
  const min = Math.min(...values, 0)
  const max = Math.max(...values, 1)
  const span = max - min || 1
  const x = (i: number) =>
    rows.length === 1 ? W / 2 : PAD.left + (i / (rows.length - 1)) * (W - PAD.left - PAD.right)
  const y = (v: number) => PAD.top + (1 - (v - min) / span) * (H - PAD.top - PAD.bottom)
  const points = rows.map((r, i) => `${x(i)},${y(r.summary.netWorth)}`)
  const baseline = y(Math.max(min, 0))
  const first = rows[0]!
  const last = rows[rows.length - 1]!

  return (
    <figure className="rounded-xl border border-border bg-surface p-4">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={`Net worth from ${formatMonth(first.month)} to ${formatMonth(last.month)}`}
        className="h-auto w-full text-accent"
      >
        {min < 0 && (
          <line
            x1={PAD.left}
            x2={W - PAD.right}
            y1={y(0)}
            y2={y(0)}
            stroke="currentColor"
            strokeOpacity={0.25}
            strokeDasharray="3 4"
          />
        )}
        {rows.length > 1 && (
          <polygon
            points={`${x(0)},${baseline} ${points.join(' ')} ${x(rows.length - 1)},${baseline}`}
            fill="currentColor"
            fillOpacity={0.1}
          />
        )}
        <polyline
          points={points.join(' ')}
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        {rows.map((r, i) => (
          <circle
            key={r.month}
            cx={x(i)}
            cy={y(r.summary.netWorth)}
            r={i === rows.length - 1 ? 4.5 : 3}
            fill="currentColor"
          >
            <title>{`${formatMonth(r.month)}: ${formatINRCompact(r.summary.netWorth)}`}</title>
          </circle>
        ))}
        <g className="fill-muted" fontSize={11}>
          <text x={PAD.left} y={H - 8}>
            {formatMonth(first.month)}
          </text>
          {rows.length > 1 && (
            <text x={W - PAD.right} y={H - 8} textAnchor="end">
              {formatMonth(last.month)}
            </text>
          )}
          <text
            x={x(rows.length - 1)}
            y={y(last.summary.netWorth) - 10}
            textAnchor={rows.length > 1 ? 'end' : 'middle'}
          >
            {formatINRCompact(last.summary.netWorth)}
          </text>
        </g>
      </svg>
    </figure>
  )
}
