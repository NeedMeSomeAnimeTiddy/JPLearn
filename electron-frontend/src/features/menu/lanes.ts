import { MINIGAMES, MINIGAME_SKILL_GROUP_META } from '../../constants'
import { DAILY_GAME_TILES } from '../daily-games/constants'
import type { StudySummaryPayload } from '../../types'

/* ==================================================================================================
   LANES — one card, two screens.

   PRACTICE is three lanes and THE WORLD is two, and the mockup deliberately draws them with the
   same card: both answer "which of these do you want to do", nothing on either is ordered or gated
   against its neighbour, and a learner who has learned one screen should not have to learn the
   other. So the card is shared and the screens differ only in how many there are and what fills
   them.

   ONE OBLIGATION WEARS THE VERMILION. Reviews are the only thing in this menu that is owed rather
   than chosen, so `duty` is what turns the action slab red — the same law the hero's slab obeys.
   Nothing in THE WORLD is an obligation, so nothing there will carry it.
   ================================================================================================== */
export interface Lane {
  key: string
  en: string
  jp: string
  glyph: string
  desc: string
  /** the big figure */
  fig: string
  figLab: string
  foot: string
  /** the action slab */
  act: string
  /** the obligation — carries the one vermilion on the screen */
  duty?: boolean
  /** the figure is an absence rather than a number, and is drawn as one */
  absent?: boolean
  /** a lane the curriculum has not opened yet */
  shut?: boolean
  /** what opens it, when shut */
  opens?: string
}

/** total cards the scheduler says are due, across every deck */
export function dueToday(summary: StudySummaryPayload | null | undefined): number | null {
  const decks = summary?.decks
  if (!decks) return null
  return decks.reduce((sum: number, deck) => sum + (deck.due_today ?? 0), 0)
}

/* THE FIGURES ARE COUNTED, NOT COPIED — and this comment nearly proved its own point. It first
   said the app had 21 drills against the mockup's seventeen, because 21 is how many entries the
   `MinigameKey` UNION has; `MINIGAMES`, the array the drill picker actually renders, has 17, and
   the design was right all along. The rule stands and the anecdote is why: a number transcribed
   into a comment goes stale exactly as silently as one transcribed into a screen. */
export function practiceLanes(summary: StudySummaryPayload | null | undefined): Lane[] {
  const due = dueToday(summary)
  const groups = Object.keys(MINIGAME_SKILL_GROUP_META).length

  return [
    {
      key: 'review',
      en: 'REVIEW', jp: '復習', glyph: '復',
      desc: 'The cards the scheduler says are due today',
      /* an absence is drawn as an absence: nothing due is not zero cards due, it is a clear day */
      fig: due === null ? '—' : due > 0 ? String(due) : '—',
      figLab: due === null ? 'NOT COUNTED YET' : due > 0 ? 'CARDS DUE' : 'NOTHING DUE',
      absent: !due,
      foot: due ? 'THE SCHEDULER CHOSE THESE' : 'THE SCHEDULER HAS NOTHING FOR YOU TODAY',
      act: due ? 'START REVIEWING' : 'REVIEW ANYWAY',
      duty: !!due,
    },
    {
      key: 'drills',
      en: 'DRILLS', jp: '訓練', glyph: '訓',
      desc: 'Ways to practise, on any of the decks the path has given you',
      fig: String(MINIGAMES.length), figLab: 'MODES',
      foot: `${groups} SKILL GROUPS`,
      act: 'PICK A DRILL',
    },
    {
      key: 'games',
      en: 'DAILY GAMES', jp: '日課', glyph: '日',
      desc: 'Puzzles built out of your own decks, new each day',
      fig: String(DAILY_GAME_TILES.length), figLab: 'PUZZLES',
      foot: DAILY_GAME_TILES.map((tile) => tile.title.toUpperCase()).join(' · '),
      act: "PLAY TODAY'S",
    },
  ]
}
