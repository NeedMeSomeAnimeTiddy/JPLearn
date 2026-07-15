# Plan: Restyle Daily Games to Match App CRT/Squared Aesthetic

## Current vs Target

| Aspect | Current Daily Games | Target (HomeView / ScriptHubView) |
|--------|-------------------|-----------------------------------|
| View wrapping | Direct in `.app-shell-scroll` | `.view-shell view-${navDirection}` with `:has(.hub-topbar)` negative-margin bleed |
| Top bar | `.daily-games-header` (back button + Gamepad2 + title) | `.hub-topbar` with catalog code, glitch title, stripe |
| CRT scanlines | None | `.hub-crt-surface` (repeating-linear-gradient + vignette) |
| CRT corners | None | 4× `.hub-glitch-corner` |
| VHS lines | None | `.hub-vhs-line` with color-shift animation |
| Crystals | None | `.hub-crystal--a/b/c` |
| Corners | `border-radius: var(--radius-card)` (10px), `var(--radius-control)` (8px), `var(--radius-pill)` (999px) | `border-radius: 0` or `2px` |
| Buttons | Standard border + focus ring | 3D push-button: `box-shadow: 0 2px 0 var(--accent-ink)`, push-down on :active |
| Color vars | Scoped `--daily-*` variables mapped to panel/text vars | Direct global variables (`--accent`, `--button-bg-top`, etc.) |
| Fonts | Inherited | Mono for labels/stats, display font for titles |
| Entrance | motion `opacity + y` (0.2s) | CSS `viewSlideForward`/`viewSlideBack` keyframe (280ms) |
| Mode toggle | Rounded pills | Squared `hub-chip-button` style |
| Streak badge | Rounded pills | Squared `hub-stat` style |
| Game tiles | Rounded cards, padded | Squared push-button panels |

## Files to Modify

### 1. `electron-frontend/src/App.tsx`
- **Wrap DailyGamesHub in a proper view-shell**: Replace the current `{view === 'daily_games' ? ...}` block with a `view-shell` div wrapper containing CRT decorative elements, a `hub-topbar` header, and a `hub-studio` body wrapping the `<DailyGamesHub>` component.
- **Pass `navDirection` prop**: The wrapper needs `view-${navDirection}` class for slide animation.
- **Pass `mode` and `setMode` from a local state**: The top bar catalog/subtitle should change based on daily/practice mode.

### 2. `electron-frontend/src/features/daily-games/daily-games.css`
Major rewrite:

- **Remove all `--daily-*` scoped custom properties** (lines 1-13). Use global `--accent`, `--accent-ink`, `--button-bg-top`, `--button-bg-bottom`, `--panel-bg`, `--panel-bg-alt`, `--panel-border`, `--text-main`, `--text-soft`, `--mono` directly.
- **Squared borders**: Replace all `border-radius: var(--radius-card)` with `border-radius: 0`. Replace all `border-radius: var(--radius-control)` with `border-radius: 0`. Replace all `border-radius: var(--radius-pill)` with `border-radius: 0`.
- **3D push buttons**: Add `box-shadow: 0 2px 0 var(--accent-ink)` to `.daily-game-button`, `.daily-games-back`, `.daily-games-retry`, `.daily-games-mode-control`, `.match-pairs-card`. Add hover border-color accent, active translateY(2px) + reduced shadow.
- **Mode toggle buttons**: Style `.daily-games-mode-control` like `.hub-chip-button` — mono font, uppercase, small size, 3D shadow. Active state: `background: var(--accent-ink)`, `inset 0 2px 4px rgba(0,0,0,0.2)`, `transform: translateY(2px)`.
- **Streak badge**: Style `.daily-streak-badge` like `.hub-stat` — `border-radius: 0`, mono font, `border: 1px solid var(--accent-ink)`, `box-shadow: 0 1px 0 var(--accent-ink)`.
- **Game tiles**: Style `.daily-game-tile` like `cassette-panel` — `border-radius: 2px`, `background: linear-gradient(145deg, var(--panel-bg), var(--panel-bg-alt))`, `border: 1px solid var(--panel-border)`, `box-shadow: 0 2px 0 var(--accent-ink), 0 8px 28px -16px rgba(0,0,0,0.68)`. Add vignette `::after`.
- **Game session wrappers**: Square `.match-pairs-game`, `.word-search-game`, `.crossword-game`, `.typing-blitz-game`, `.daily-game-results` containers — `border-radius: 2px`, panel bg, subtle border.
- **Header**: `.daily-games-header` is no longer used in the hub (replaced by `hub-topbar`). Keep for session views but square the back button.
- **Remove `margin: 0 auto; max-width: 72rem; padding: 1.5rem`** from `.daily-games-hub` — the `hub-studio` grid handles layout.
- **Responsive**: Update breakpoints to maintain the squared aesthetic at mobile widths.

### 3. `electron-frontend/src/features/daily-games/components/GamesHub.tsx`
- **Remove the `<header className="daily-games-header">`** (back button + Gamepad2 heading). The hub top bar is now provided by the wrapper in App.tsx.
- **Remove the Motion animation wrapper** — slide animation is handled by `viewSlideForward`/`viewSlideBack`.
- **Replace `motion.main` with a plain `<div>` or `<section>`** since it sits inside `hub-studio`.
- **Keep the internal content structure** (mode toggle, summary, streak badge, tile grid) — just styled differently.
- **Remove `useReducedMotion`/`motion` imports** no longer needed.
- **Remove the `gamesHubMotion.ts` helper file** if no longer referenced elsewhere.
- **Update the back button to use `onBack` prop** which triggers `setNavDirection('back'); setView('home')` in App.tsx.

### 4. `electron-frontend/src/features/daily-games/components/DailyGameSession.tsx`
- The session component keeps its current structure but the back button and game containers pick up the squared styles from CSS changes.

### 5. `electron-frontend/src/features/daily-games/components/DailyStreakBadge.tsx`
- No structural changes needed — styling changes come from CSS.

### 6. `electron-frontend/src/features/daily-games/components/GameResultsOverlay.tsx`
- No structural changes needed — styling changes from CSS.

### 7. `electron-frontend/src/features/daily-games/components/gamesHubMotion.ts`
- **Delete** — animation handled by viewSlide CSS keyframes.

### 8. `electron-frontend/src/App.css`
- No changes to existing global styles needed. The Daily Games CSS rewrite handles everything scoped to `.daily-games-hub` and `.daily-game-session`.

## App.tsx Hub Wrapper Structure

The wrapper in App.tsx replaces the current `{view === 'daily_games' ? (...)}` block:

```tsx
{view === 'daily_games' ? (
  <div className={`view-shell view-${navDirection}`}>
    <div className="hub-crt-surface" aria-hidden="true" />
    <div className="hub-glitch-corner hub-glitch-corner--tl" aria-hidden="true" />
    <div className="hub-glitch-corner hub-glitch-corner--tr" aria-hidden="true" />
    <div className="hub-glitch-corner hub-glitch-corner--bl" aria-hidden="true" />
    <div className="hub-glitch-corner hub-glitch-corner--br" aria-hidden="true" />
    <div className="hub-vhs-line" aria-hidden="true" />
    <div className="hub-crystal hub-crystal--a" aria-hidden="true" />
    <div className="hub-crystal hub-crystal--b" aria-hidden="true" />
    <div className="hub-crystal hub-crystal--c" aria-hidden="true" />

    <header className="hub-topbar">
      <h1 className="sr-only">Daily Games</h1>
      <button
        type="button"
        className="back-button back-button-icon-only"
        onClick={() => { setNavDirection('back'); setView('home'); }}
        aria-label="Back to main menu"
      >
        <ArrowLeft aria-hidden="true" className="inline-button-icon" strokeWidth={2.2} />
      </button>

      <div className="hub-topbar-center">
        <span className="hub-topbar-catalog">JPL-DLY-A</span>
        <strong className="hub-topbar-title">
          <span className="hub-glitch-text">{DAILY_GAMES_COPY.title}</span>
        </strong>
        <span className="hub-topbar-catalog hub-topbar-catalog--sub">
          {dailyGamesMode === 'practice' ? 'PRACTICE · 練習' : 'DAILY · 毎日'}
        </span>
        <span className="hub-topbar-stripe" aria-hidden="true" />
      </div>

      <span aria-hidden="true" />
    </header>

    <div className="hub-studio">
      <Suspense fallback={<div className="daily-games-hub" role="status" aria-label={DAILY_GAMES_COPY.loading} />}>
        <DailyGamesHub
          onBack={() => { setNavDirection('back'); setView('home'); }}
          onReviewMissedWords={startMissedWordReview}
        />
      </Suspense>
    </div>
  </div>
) : null}
```

**Note:** The mode toggle state needs to be lifted or tracked. Since `useDailyGames` manages `mode` internally, we have two options:
- A) Lift mode state to App.tsx and pass it down (adds coupling)
- B) **Keep mode state in the hook but derive the catalog subtitle from the view.** Since the top bar catalog is static text, we don't need live mode tracking in App.tsx. Use a static label like "DAILY GAMES · 毎日".

**Decision: Option B** — use a static catalog subtitle. The mode is clear from the toggle button's active state in the hub content.

## Task Breakdown

### Batch 1: CSS Rewrite (core)
1. Rewrite `daily-games.css` — remove `--daily-*` vars, square all corners, add 3D push-button shadows, style mode toggles like `hub-chip-button`, style streak badges like `hub-stat`, style tiles like `cassette-panel` with vignette, square game containers.
2. Update responsive breakpoints.

### Batch 2: App.tsx Wrapper
3. Rewrite the `view === 'daily_games'` block with view-shell, CRT decorations, hub-topbar, and hub-studio.
4. Remove `motion`/`useReducedMotion` from GamesHub imports if still present.
5. Remove or simplify `LazyDailyGamesHub` fallback (keep `Suspense` + `ErrorBoundary` but update the fallback class).

### Batch 3: Component Cleanup
6. Remove `<header>` from GamesHub.tsx.
7. Remove motion animation wrapper from GamesHub.tsx.
8. Delete `gamesHubMotion.ts`.
9. Verify GamesHub back button uses `onBack` prop correctly.

### Batch 4: Game Session Views
10. Verify DailyGameSession and sub-game components pick up squared styles properly.
11. Verify GameResultsOverlay looks good with squared styling.

### Batch 5: Validation
12. Run `npm run lint` → must be 0 warnings.
13. Run `npm run build` → must pass.
14. Run `npm run test:ui` → all tests pass.
15. Run `npm run test:a11y` → no new violations.
16. Visual check: contrast, focus rings, spacing.

## Design Decisions

| Decision | Rationale |
|----------|-----------|
| Static catalog subtitle ("DAILY GAMES · 毎日") | Avoids lifting mode state to App.tsx; mode is clear from the toggle in content |
| No crystals/particles/sweep inside hub-studio for Daily Games | The game tile grid is the visual content — overlay particles would interfere with the grid layout. The view-shell-level CRT effects (scanlines, corners, VHS) provide enough atmospheric depth. |
| Keep cursor-style focus rings from existing CSS | Hub elements use `outline: 0.25rem solid color-mix(...)` for focus — keep this consistent |
| `border-radius: 2px` for game containers (not `0`) | Matches `cassette-panel`/`dictionary-panel` — subtle chamfer that still reads as "squared" |
| `border-radius: 0` for buttons, badges, mode toggles | Matches `hub-chip-button`/`hub-stat`/`back-button` aesthetic |
| Keep `daily-game-tile` as `<article>` | Semantic HTML, just restyled |
| Delete `gamesHubMotion.ts` | No longer needed since viewSlide CSS handles entrance animation |
