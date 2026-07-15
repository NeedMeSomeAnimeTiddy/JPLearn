# Plan: Add wanakana Romaji→Kana Input to Crossword & Typing Blitz

wanakana v5.3.1 is already installed and used by `TypedAnswerPanel` in the main minigame.
We port the same pattern to both Daily Games components.

## CrosswordGame.tsx

### Changes
1. **Import wanakana** — add `import * as wanakana from 'wanakana'` to imports.
2. **Replace manual IME tracking with wanakana bind/unbind** — add `onFocus`/`onBlur` to each `<input>` cell:
   - `onFocus`: `wanakana.bind(e.target, { IMEMode: 'toHiragana' })`
   - `onBlur`: `wanakana.unbind(e.target)`
3. **Replace `onChange` with `onInput`** — since wanakana's IMEMode auto-converts romaji to kana in real-time, read `event.currentTarget.value` in `onInput` (already kana). Call `updateValue(coordinate, event.currentTarget.value)`.
4. **Remove `onCompositionStart`/`onCompositionEnd`** — wanakana handles kana conversion. OS IME composition (needed for kanji) still works natively on top; `event.nativeEvent.isComposing` still fires.
5. **Remove `composingCells` ref and related logic** — `handleCompositionStart`, `handleCompositionEnd`, and the `composingCells` Set are no longer needed.
6. **Update `handleKeyDown`** — keep `event.nativeEvent.isComposing` check for Enter blocking. Remove `composingCells.current.has()` check.
7. **Update `handleSubmit`** — check `event.nativeEvent.isComposing` instead of `composingCells.current.size > 0`.
8. **Add auto-advance** — after `updateValue` commits a single character, auto-focus the next cell in the active entry's direction:
   - Find the current cell's index within the active entry's `cells` array
   - If it's not the last cell, call `.focus()` on the next cell's ref + update `activeEntryId`
9. **Remove `lang="ja"` and `inputMode="text"`** — wanakana renders them unnecessary. Keep them for the display `<strong>` target element only.

### Test changes (`CrosswordGame.test.tsx`)
- Update IME test: instead of `fireEvent.compositionStart`/`compositionEnd`, test that typing romaji produces kana via the `onInput` path and auto-advances to the next cell.
- The "commits one character" test changes from verifying `event.target.value === '学'` after compositionEnd to verifying the value changes via `onInput` and focus moves.

## TypingBlitzGame.tsx

### Changes
1. **Import wanakana** — add `import * as wanakana from 'wanakana'`.
2. **Add `useEffect` to bind/unbind wanakana** — same pattern as `TypedAnswerPanel`:
   ```ts
   useEffect(() => {
     const el = document.getElementById('typing-blitz-input')
     if (!el) return
     wanakana.bind(el, { IMEMode: 'toHiragana' })
     return () => { wanakana.unbind(el) }
   }, [])
   ```
3. **Replace `onChange` with `onInput`** — `onChange` fires too late with wanakana. Use `onInput` to read the kana-converted value. Keep `setInput(event.currentTarget.value)` so the user sees real-time kana.
4. **Keep `onCompositionStart`/`onCompositionEnd`** and `composing` ref — still needed for OS IME kanji selection (Enter blocking during Space-bar kanji conversion).
5. **Update `submit()` comparison** — accept either the exact character match OR the kana reading match:
   ```ts
   const trimmed = input.trim()
   const targetChar = word.word.character.trim()
   const targetReading = word.word.romaji.trim()
   const isCorrect = trimmed === targetChar || wanakana.toHiragana(trimmed) === targetReading
   ```
   This lets the user type either the actual Japanese characters (via OS IME) or the kana reading (via wanakana auto-conversion).
6. **Remove `lang="ja"` and `inputMode="text"`** from the `<input>` — wanakana handles this. Keep `lang="ja"` on the display `<strong>`.

### Test changes (`TypingBlitzGame.test.tsx`)
- Update "records answers" test: verify that typing romaji (e.g. `'neko'`) via `onInput` produces kana, and submitting it as `'ねこ'` matches against target `'猫'` via the reading comparison.
- Keep the IME Enter-blocking test — still relevant since OS IME composition is preserved.

## Files Modified (no new files)
- `electron-frontend/src/features/daily-games/components/CrosswordGame.tsx`
- `electron-frontend/src/features/daily-games/components/TypingBlitzGame.tsx`
- `electron-frontend/src/features/daily-games/components/CrosswordGame.test.tsx`
- `electron-frontend/src/features/daily-games/components/TypingBlitzGame.test.tsx`

## Design Decisions

| Decision | Rationale |
|----------|-----------|
| wanakana `onFocus`/`onBlur` per crossword cell | Each cell is its own `<input>` — binding per-focus avoids managing many binds simultaneously |
| `wanakana.toHiragana(trimmed) === targetReading` for Typing Blitz | Allows kana-only input to match kanji targets without OS IME |
| Keep `composing` ref in Typing Blitz | OS IME is still needed for direct kanji input; Enter must be blocked during composition |
| Keep `event.nativeEvent.isComposing` check in Crossword | Same reason — OS IME needed for kanji cells |
| Auto-advance after character commit | Removing the extra arrow-key step speeds up play significantly |
| Remove `lang="ja"` / `inputMode="text"` from inputs | wanakana handles the conversion; the display-only elements keep `lang="ja"` for font rendering |
