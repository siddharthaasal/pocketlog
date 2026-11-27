import {
  ArrowLeftRight,
  BadgeIndianRupee,
  Baby,
  Banknote,
  Bike,
  BookOpen,
  Briefcase,
  Bus,
  Car,
  CircleHelp,
  Clapperboard,
  Coffee,
  Dumbbell,
  Fuel,
  Gamepad2,
  Gift,
  GraduationCap,
  HandCoins,
  Heart,
  House,
  Landmark,
  Laptop,
  Lightbulb,
  Music,
  Package,
  PawPrint,
  Pill,
  Plane,
  Receipt,
  Repeat,
  Scissors,
  Shield,
  ShoppingBag,
  ShoppingCart,
  Shirt,
  Smartphone,
  Tag,
  TrendingUp,
  Tv,
  Undo2,
  Utensils,
  Wallet,
  Wifi,
  Wrench,
  type LucideIcon,
} from 'lucide-react'
import { cx } from '../lib/cx'

/**
 * What a category's `icon` field holds: a key from this list. The picker offers these.
 * Lucide is one of the open-source sets on notionicons.so.
 */
export const CATEGORY_ICONS = {
  utensils: Utensils,
  coffee: Coffee,
  'shopping-cart': ShoppingCart,
  car: Car,
  bus: Bus,
  bike: Bike,
  fuel: Fuel,
  'shopping-bag': ShoppingBag,
  shirt: Shirt,
  film: Clapperboard,
  gamepad: Gamepad2,
  music: Music,
  tv: Tv,
  pill: Pill,
  heart: Heart,
  dumbbell: Dumbbell,
  plane: Plane,
  lightbulb: Lightbulb,
  wifi: Wifi,
  phone: Smartphone,
  home: House,
  repeat: Repeat,
  book: BookOpen,
  'grad-cap': GraduationCap,
  scissors: Scissors,
  baby: Baby,
  paw: PawPrint,
  wrench: Wrench,
  receipt: Receipt,
  package: Package,
  briefcase: Briefcase,
  laptop: Laptop,
  trending: TrendingUp,
  undo: Undo2,
  rupee: BadgeIndianRupee,
  banknote: Banknote,
  coins: HandCoins,
  wallet: Wallet,
  bank: Landmark,
  shield: Shield,
  gift: Gift,
  tag: Tag,
  transfer: ArrowLeftRight,
  help: CircleHelp,
} satisfies Record<string, LucideIcon>

export type CategoryIconKey = keyof typeof CATEGORY_ICONS

/** Categories saved before icons were drawn used an emoji. They still show, as the nearest icon. */
const LEGACY_EMOJI: Record<string, CategoryIconKey> = {
  '🍽': 'utensils',
  '🍕': 'utensils',
  '🍔': 'utensils',
  '☕': 'coffee',
  '🛒': 'shopping-cart',
  '🚕': 'car',
  '🚗': 'car',
  '🚌': 'bus',
  '🚲': 'bike',
  '⛽': 'fuel',
  '🛍': 'shopping-bag',
  '👕': 'shirt',
  '🎬': 'film',
  '🎮': 'gamepad',
  '🎵': 'music',
  '💊': 'pill',
  '❤': 'heart',
  '🏋': 'dumbbell',
  '✈': 'plane',
  '💡': 'lightbulb',
  '📱': 'phone',
  '🏠': 'home',
  '🔁': 'repeat',
  '📚': 'book',
  '🎓': 'grad-cap',
  '💇': 'scissors',
  '👶': 'baby',
  '🐶': 'paw',
  '🔧': 'wrench',
  '🧾': 'receipt',
  '📦': 'package',
  '💼': 'briefcase',
  '🧑': 'laptop',
  '💻': 'laptop',
  '📈': 'trending',
  '↩': 'undo',
  '💰': 'rupee',
  '💵': 'banknote',
  '🏦': 'bank',
  '🛡': 'shield',
  '🎁': 'gift',
  '↔': 'transfer',
  '❔': 'help',
  '❓': 'help',
}

export function resolveCategoryIcon(icon: string): LucideIcon {
  if (icon in CATEGORY_ICONS) return CATEGORY_ICONS[icon as CategoryIconKey]
  // Compare the first character only: emoji often carry invisible variation selectors.
  const first = [...icon][0] ?? ''
  const key = LEGACY_EMOJI[first]
  return CATEGORY_ICONS[key ?? 'tag']
}

export function CategoryIcon({
  icon,
  size = 18,
  className,
}: {
  icon: string
  size?: number
  className?: string
}) {
  const Glyph = resolveCategoryIcon(icon)
  return (
    <Glyph
      size={size}
      strokeWidth={1.8}
      color="var(--icon)"
      aria-hidden="true"
      className={cx('shrink-0', className)}
    />
  )
}
