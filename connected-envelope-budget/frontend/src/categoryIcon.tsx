import {
  Car,
  Film,
  Gamepad2,
  Heart,
  Home,
  type LucideIcon,
  MoreHorizontal,
  PawPrint,
  PiggyBank,
  Plane,
  Repeat,
  ShieldCheck,
  ShoppingBag,
  ShoppingCart,
  Tag,
  TrendingUp,
  UtensilsCrossed,
  Zap,
} from 'lucide-react'

// Maps an envelope's name to the icon shown when it was created (see the
// onboarding category templates in App.tsx). Custom envelope names fall back
// to a generic tag icon.
const ICON_BY_NAME: Record<string, LucideIcon> = {
  housing: Home,
  groceries: ShoppingCart,
  transportation: Car,
  transport: Car,
  insurance: ShieldCheck,
  utilities: Zap,
  dining: UtensilsCrossed,
  shopping: ShoppingBag,
  entertainment: Film,
  subscriptions: Repeat,
  pets: PawPrint,
  vacation: Plane,
  'trips/vacation': Plane,
  'date night': Heart,
  recreation: Gamepad2,
  miscellaneous: MoreHorizontal,
  'emergency fund': PiggyBank,
  'long-term goals': TrendingUp,
}

export function getCategoryIcon(name: string): LucideIcon {
  return ICON_BY_NAME[name.trim().toLowerCase()] ?? Tag
}
