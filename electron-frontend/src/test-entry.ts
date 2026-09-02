import { fireEvent, screen } from '@testing-library/react'

/* ==================================================================================================
   HOW A TEST GETS INTO A STUDY SURFACE, NOW THAT THERE IS ONE FRONT DOOR.

   Four suites carried their own identical copy of a `clickTopMenuCard` that found a deck cassette
   on `HomeView` and clicked it twice — the carousel wanted one click to focus and a second to
   launch. `HomeView` retired with phase 6's toggle, so all four copies pointed at a screen that no
   longer exists.

   THE REPLACEMENT IS NOT THE MENU. These suites are testing what happens INSIDE a session — block
   selection, minigame rounds, session state — and walking L1 → PRACTICE → a lane to reach one would
   make every one of them a navigation test that fails for navigation reasons. `App` has carried
   digit shortcuts for the six decks the whole time, they are bound on `window`, and they are the
   shortest honest way in.

   AND THEN THE SCRIPT HUB WENT, which is where those digits used to land. It was one screen that
   answered two questions — which deck, and which of its seventeen drills — and each of them now has
   its own door, so this file has two functions where it had one:

     - `openDeck` opens the deck's own screen in the menu: its block chain, or its daily feed. Same
       digits, same window binding, one screen further in.
     - `openGame` runs a named drill on a named deck with no screen in between, through the
       titlebar's map tree. That tree is the only place in the app that names every mode of every
       deck, which is exactly what a test that wants Stroke Order on kanji needs.
   ================================================================================================== */

/** the digits `App`'s own window handler binds, and the labels the old cassettes wore */
const DECK_KEY: Record<string, string> = {
  hiragana: '1',
  katakana: '2',
  kanji: '3',
  vocabulary: '4',
  grammar: '5',
  sentences: '7',
}

/** Open a deck's own screen in the menu, the way the titlebar shortcuts do. */
export function openDeck(label: string): void {
  const key = DECK_KEY[label.toLowerCase()]
  if (!key) throw new Error(`No deck shortcut for ${label}. Have: ${Object.keys(DECK_KEY).join(', ')}`)
  fireEvent.keyDown(window, { key })
}

/**
 * Run one drill on one deck, with no screen in between.
 *
 * `label` is the deck as the titlebar names it — Hiragana, Kanji, Vocabulary — and `game` is the
 * mode's own title from `MINIGAMES`, e.g. "Stroke Order".
 */
export async function openGame(label: string, game: string): Promise<void> {
  fireEvent.click(await screen.findByRole('button', { name: /open shortcuts/i }))
  fireEvent.click(await screen.findByRole('menuitem', { name: /^All Maps/ }))
  fireEvent.click(await screen.findByRole('menuitem', { name: new RegExp(`^${label} Map`, 'i') }))
  fireEvent.click(await screen.findByRole('menuitem', { name: game }))
}

/* WHAT "THE APP HAS FINISHED LOADING" LOOKS LIKE WITHOUT A HOME SCREEN TO WAIT FOR. Several suites
   waited on HomeView's own Daily Games button purely as a readiness signal. The titlebar is the one
   thing every surface has, so its shortcuts button is the signal that does not depend on which
   screen won the race. */
export async function appReady(): Promise<void> {
  await screen.findByRole('button', { name: /open shortcuts/i })
}

/** Daily Games, from the titlebar rather than from a screen. */
export async function openDailyGames(): Promise<void> {
  fireEvent.click(await screen.findByRole('button', { name: /open shortcuts/i }))
  fireEvent.click(await screen.findByRole('menuitem', { name: 'Daily Games' }))
}
