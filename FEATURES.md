# JPLearn Features

Updated: 2026-06-27

JPLearn is a desktop Japanese learning app focused on daily retention, fast review loops, and measurable progress.

## What You Can Do

### Build real Japanese foundations

- Study Hiragana and Katakana from beginner level.
- Learn JLPT Kanji from N5 through N1.
- Train vocabulary across JLPT levels N5 through N1.
- Practice grammar patterns and conversational structures.

### Practice with multiple game-like modes

- Romaji Sprint
- Meaning Match
- Character Match
- Stroke Order
- Typed Recall
- Context Cloze
- Narrative Story
- Interleave Mix (blended mode)

### Get adaptive reviews instead of random drills

- Uses spaced repetition to schedule what to review next.
- Balances due cards, new cards, and leech cards in queue building.
- Tracks repetitions, interval, ease factor, and next review date per card.
- Supports optional confidence scoring after answers.

### Follow structured progression

- Block-based unlock progression per deck.
- Per-block mastery scoring.
- Curriculum stage tracking for context-cloze progression.
- Narrative chapter progression tracking.

### Set goals and track outcomes

- Start sessions with target item goals.
- Optionally set target minutes and target accuracy.
- View session summaries with completion and accuracy stats.
- Track current and best daily streaks.

### See your progress clearly

- Deck-level totals, due counts, completed counts, and mastered counts.
- 7-day and 30-day activity summaries.
- Mistake trend and breakdown visibility.
- Item history with recent review events.
- Overview character mastery for kana blocks and kanji coverage.

### Use built-in assistant and chat features

- Assistant state snapshots and event feed.
- Assistant interaction tracking and event consumption.
- Persistent assistant chat history.
- Runtime-managed local tutor chat:
  - status
  - preload
  - send
  - cancel
  - unload

### Use local voice and pronunciation support

- Voice runtime status and preload controls.
- Speech synthesis with text input.
- Speaker selection and speech speed control.

### Personalize the learning experience

- Multiple themes, including light and dark variants.
- Background style options.
- Font size and Japanese-friendly font presets.
- Animation behavior settings.
- Tutor, voice, and keyboard shortcut settings.

## Desktop App and Runtime

- Electron desktop shell with React + TypeScript frontend.
- Python backend bridge for domain logic and persistence.
- SQLite-backed study state and analytics.
- Frameless window controls (minimize, maximize/restore, close).
- Startup theme persistence.

## Data and Operations

- Import external CSV datasets for kanji, vocab, and conversational content.
- Export and import progress snapshots (merge/overwrite workflows).
- Database reset operation for local development/test workflows.
- Compact debug tooling for snapshots, checks, and diagnostics.

## Security and Reliability

- Trusted IPC sender checks.
- Payload validation for deck IDs, session IDs, limits, and typed request bodies.
- Structured error wrapping on IPC responses.

## Notes

- The legacy Python GUI entrypoint is deprecated.
- The supported interactive surface is the Electron frontend.
