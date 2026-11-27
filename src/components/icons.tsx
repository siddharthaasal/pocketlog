import {
  ArrowLeftRight,
  ChartColumn,
  ChevronLeft,
  ChevronRight,
  FileCheck,
  House,
  List,
  Mic,
  Plus,
  SlidersHorizontal,
  TrendingUp,
  type LucideProps,
} from 'lucide-react'

/**
 * Icons come from Lucide, one of the open-source sets on notionicons.so. They are drawn in
 * `--icon`, which is pure black in the light theme and pure white in the dark one.
 */
export type IconProps = LucideProps

export const iconDefaults = {
  size: 22,
  strokeWidth: 1.8,
  color: 'var(--icon)',
  'aria-hidden': true,
} as const

const make = (Glyph: typeof House) =>
  function NavGlyph(p: IconProps) {
    return <Glyph {...iconDefaults} {...p} />
  }

export const HomeIcon = make(House)
export const ListIcon = make(List)
export const PlusIcon = make(Plus)
export const SettingsIcon = make(SlidersHorizontal)
export const ChevronLeftIcon = make(ChevronLeft)
export const ChevronRightIcon = make(ChevronRight)
export const ChartIcon = make(ChartColumn)
export const ReconcileIcon = make(FileCheck)
export const MicIcon = make(Mic)
export const WealthIcon = make(TrendingUp)
export const TransferIcon = make(ArrowLeftRight)
