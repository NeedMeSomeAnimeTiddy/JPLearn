import { Headphones, MessageCircle, PenTool, BookOpen, Target, Bot, Flame } from 'lucide-react'

/* THE BADGE'S OWN MARK, AND NOW IN ONE PLACE. This lived module-private inside
   `AchievementsPanel`, which was fine while one screen drew badges; the menu's wall is the second,
   and two copies of a name-to-icon map is two places for a badge to lose its face. */
export const BADGE_ICONS: Record<string, typeof Headphones> = {
  headphones: Headphones,
  messageCircle: MessageCircle,
  penTool: PenTool,
  bookOpen: BookOpen,
  target: Target,
  bot: Bot,
  flame: Flame,
}

/** the fallback every caller shared anyway */
export const BADGE_ICON_FALLBACK = Target
