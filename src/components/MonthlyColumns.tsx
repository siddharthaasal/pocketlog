import { useEffect, useRef, useState } from 'react'
import { formatINR, formatINRCompact, niceCeiling } from '../domain/money'
import { formatMonth, fromISODate } from '../lib/dates'

export interface MonthValue {
  month: string
  /** Paise. */
  value: number
}

const HEIGHT = 200
const PAD = { top: 12, right: 4, bottom: 26, left: 48 }
const MAX_BAR = 24
const RADIUS = 4

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null)
  const [width, setWidth] = useState(0)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const observer = new ResizeObserver(([entry]) => setWidth(entry?.contentRect.width ?? 0))
    observer.observe(el)
    return () => observer.disconnect()
  }, [])
  return [ref, width] as const
}

/** Column path with a rounded data end and a square base on the baseline. */
function columnPath(x: number, y: number, w: number, h: number): string {
  const r = Math.min(RADIUS, h, w / 2)
  const bottom = y + h
  return `M${x},${bottom}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${bottom}Z`
}

const shortMonth = (month: string) =>
  fromISODate(`${month}-01`).toLocaleDateString('en-IN', { month: 'short' })

/**
 * Single-series monthly columns. The selected month is drawn in the chart colour,
 * the rest in a tint of it. Tapping a column selects that month.
 */
export function MonthlyColumns({
  data,
  selected,
  onSelect,
  label,
}: {
  data: readonly MonthValue[]
  selected: string
  onSelect: (month: string) => void
  label: string
}) {
  const [ref, width] = useWidth<HTMLDivElement>()
  const [hovered, setHovered] = useState<string | null>(null)

  const max = niceCeiling(Math.max(0, ...data.map((d) => d.value)))
  const ticks = max > 0 ? [0, max / 2, max] : [0]
  const plotW = Math.max(0, width - PAD.left - PAD.right)
  const plotH = HEIGHT - PAD.top - PAD.bottom
  const band = data.length > 0 ? plotW / data.length : 0
  const barW = Math.min(MAX_BAR, band * 0.6)
  const y = (v: number) => PAD.top + plotH - (max > 0 ? (v / max) * plotH : 0)
  const shown = data.find((d) => d.month === (hovered ?? selected))

  return (
    <div ref={ref} className="w-full">
      {/* The value lives in a caption, not on the chart, so it can never collide with a column. */}
      <div className="mb-1 flex items-baseline gap-2 px-1" aria-live="polite">
        <span className="text-[13px] text-muted">{shown ? formatMonth(shown.month) : ''}</span>
        <span className="text-[17px] font-semibold tabular-nums">
          {shown ? formatINR(shown.value) : ''}
        </span>
      </div>
      {width > 0 && (
        <svg
          width={width}
          height={HEIGHT}
          role="img"
          aria-label={label}
          className="block overflow-visible text-[11px] tabular-nums"
          onMouseLeave={() => setHovered(null)}
        >
          {ticks.map((t) => (
            <g key={t}>
              <line
                x1={PAD.left}
                x2={width - PAD.right}
                y1={y(t)}
                y2={y(t)}
                className="stroke-border"
                strokeWidth={1}
                shapeRendering="crispEdges"
              />
              <text x={PAD.left - 8} y={y(t)} dy="0.35em" textAnchor="end" className="fill-muted">
                {formatINRCompact(t)}
              </text>
            </g>
          ))}

          {data.map((d, i) => {
            const x = PAD.left + i * band
            const barX = x + (band - barW) / 2
            const top = y(d.value)
            const isSelected = d.month === selected
            return (
              <g key={d.month}>
                {d.value > 0 && (
                  <path
                    d={columnPath(barX, top, barW, PAD.top + plotH - top)}
                    className={isSelected ? 'fill-chart' : 'fill-chart-muted'}
                  />
                )}
                <text
                  x={x + band / 2}
                  y={HEIGHT - 8}
                  textAnchor="middle"
                  className={isSelected ? 'fill-text font-semibold' : 'fill-muted'}
                >
                  {shortMonth(d.month)}
                </text>
                {/* Hit target: the whole band, taller than the mark. */}
                <rect
                  x={x}
                  y={0}
                  width={band}
                  height={HEIGHT}
                  fill="transparent"
                  className="cursor-pointer"
                  role="button"
                  aria-label={`${formatMonth(d.month)}: ${formatINR(d.value)}`}
                  tabIndex={0}
                  onMouseEnter={() => setHovered(d.month)}
                  onClick={() => onSelect(d.month)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') onSelect(d.month)
                  }}
                />
              </g>
            )
          })}
        </svg>
      )}
    </div>
  )
}
