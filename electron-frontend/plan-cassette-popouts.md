# Cassette Theme — Pop-Out Panel Conversion Plan

**Status:** Planning complete. Awaiting execution.

## Goal

Convert all pop-out overlay panels (Study Overview, Dictionary, OCR, Settings, Tutor Chat) plus the titlebar shortcut menu, readiness warning modal, and streak/XP popovers from their current "rounded modern" look to the Cassette aesthetic — **squared corners, hard 2D shadows, color-mix borders, monospace labels, and CRT vignette**.

## Scope — 9 Targets

| # | Panel | Current Style | Key File(s) |
|---|-------|--------------|-------------|
| 1 | Dictionary Popup | border-radius: 20px, soft glow | `DictionaryPopup.tsx`, App.css L156-192 |
| 2 | Study Overview | border-radius: 20px, soft glow | App.tsx L5608-5652, `OverviewView.tsx`, App.css L5543-5555 |
| 3 | Settings Sheet | border-radius: 24px (worst offender), soft glow | App.tsx L5671-6220, App.css L9646-9656 |
| 4 | Tutor Chat Panel | border-radius: 16-20px, soft blur, chat bubbles | `TutorChatPanel.tsx`, App.css L762-1284 |
| 5 | OCR Workbench | Shares Tutor Chat CSS, same issues | `OcrWorkbench.tsx` (shares CSS) |
| 6 | Titlebar Shortcut Menu | border-radius: 14px, soft shadow | App.tsx L4804-5040, App.css L1984-2003 |
| 7 | Readiness Warning Modal | border-radius: 20px, soft shadow | `ReadinessWarningModal.tsx`, App.css L13145-13232 |
| 8 | Streak Details Popover | border-radius: 12px, soft shadow | App.tsx L5123-5150, App.css L5784-5832 |
| 9 | XP Details Popover | border-radius: 12px, soft shadow | App.tsx L5156-5190, App.css L5888-5924 |

## Cassette Design Reference (from existing themed elements)

The TutorToast (App.css L1513-1525) is the canonical example of a cassette-styled panel:

```css
.assistant-toast {
  border-radius: 0;                          /* ← SQUARED */
  border: 1px solid var(--panel-border);     /* ← simple tinted border */
  background: var(--bg-main);                /* ← solid background */
  box-shadow:
    0 2px 0 var(--accent-ink),              /* ← hard 2D drop (no blur!) */
    0 12px 28px -18px rgba(0, 0, 0, 0.7);   /* ← tight ambient shadow */
}
```

Additional cassette patterns to apply:
- **Monospace labels:** `font-family: var(--mono)`, `text-transform: uppercase`, `letter-spacing: 0.06-0.12em`
- **CRT vignette:** `radial-gradient(ellipse at center, transparent 60%, rgba(0,0,0,0.22) 100%)` via `::after`
- **Cel-shaded buttons:** `border-radius: 0`, `box-shadow: 0 2px 0 var(--accent-ink)`, active: `translateY(2px)`
- **color-mix borders:** `color-mix(in oklab, var(--panel-border) 70%, transparent)` for depth

---

## Phase 1: Shared Cassette Panel CSS Classes (App.css)

**Goal:** Create reusable CSS classes so all 9 panels inherit the cassette look without duplicating properties.

### 1a. `.cassette-panel` — base panel class

Add after the existing `.modal-panel` block (~line 9627):

```css
/* ── Cassette panel (squared CRT aesthetic) ────────────────── */

.cassette-panel {
  position: relative;  /* for vignette ::after */
  border-radius: 2px;
  border: 1px solid color-mix(in oklab, var(--panel-border) 72%, transparent);
  background: linear-gradient(145deg, var(--panel-bg), var(--panel-bg-alt));
  box-shadow:
    0 2px 0 var(--accent-ink),
    0 8px 28px -16px rgba(0, 0, 0, 0.68);
}

/* CRT vignette overlay */
.cassette-panel::after {
  content: '';
  position: absolute;
  inset: 0;
  pointer-events: none;
  border-radius: inherit;
  background: radial-gradient(ellipse at center, transparent 58%, rgba(0, 0, 0, 0.18) 100%);
  z-index: 1;
}
```

### 1b. `.cassette-panel-header` — header row

```css
.cassette-panel-header {
  position: relative;
  z-index: 2;  /* above vignette */
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 10px 14px;
  border-bottom: 1px solid color-mix(in oklab, var(--panel-border) 68%, transparent);
  background:
    radial-gradient(circle at 12% 0%, color-mix(in oklab, var(--tone-ocean) 22%, transparent), transparent 58%),
    color-mix(in oklab, var(--panel-bg) 88%, black);
}

.cassette-panel-header-title {
  font-family: var(--display-font);
  font-size: clamp(1rem, 2vw, 1.2rem);
  font-weight: 600;
  color: var(--text-main);
  letter-spacing: -0.01em;
}

.cassette-panel-header-subtitle {
  font-family: var(--mono);
  font-size: 0.64rem;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--text-soft);
}
```

### 1c. `.cassette-panel-close` — close button

```css
.cassette-panel-close {
  flex-shrink: 0;
  width: 28px;
  height: 28px;
  border-radius: 0;
  border: 1px solid color-mix(in oklab, var(--panel-border) 64%, white 36%);
  background: color-mix(in oklab, var(--panel-bg) 94%, black);
  color: color-mix(in oklab, var(--text-main) 82%, var(--text-soft));
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  box-shadow: 0 1px 0 var(--accent-ink);
  transition: border-color 140ms ease, color 140ms ease;
}

.cassette-panel-close:hover {
  border-color: color-mix(in oklab, var(--tone-ocean) 46%, var(--panel-border));
  color: var(--text-main);
}

.cassette-panel-close:active {
  transform: translateY(1px);
  box-shadow: none;
}
```

### 1d. `.cassette-panel-body` — scrollable content area

```css
.cassette-panel-body {
  position: relative;
  z-index: 2;
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
  scrollbar-width: thin;
  scrollbar-color: var(--panel-border) transparent;
}
```

---

## Phase 2: Dictionary Popup

**Files:** `DictionaryPopup.tsx` (no change), App.css only.

### 2a. Panel container (App.css L156-192)

Change `.dictionary-panel`:
- `border-radius: 20px` → `2px`
- Add `box-shadow: 0 2px 0 var(--accent-ink), ...`
- Keep the existing `radial-gradient + linear-gradient` background (it already uses `var(--tone-ocean)` and `var(--panel-bg)` which is cassette-appropriate)
- Optional: apply `.cassette-panel` class as a mixin if adopting shared classes

### 2b. Search input wrap (App.css ~L194)

Change `.dictionary-search-input-wrap`:
- `border-radius: 14px` → `2px`
- `box-shadow: inset 0 1px 0 rgba(255,255,255,0.06)` → `inset 0 2px 4px rgba(0,0,0,0.3)` (physical depth)

### 2c. Search button (App.css ~L200)

Change `.dictionary-search-button`:
- `border-radius: 12px` → `0`
- Add `box-shadow: 0 2px 0 var(--accent-ink)`
- Add `:active { transform: translateY(2px); box-shadow: none; }`

### 2d. Result cards (App.css ~L300)

Change `.dictionary-result-card`:
- `border-radius: 14px` → `2px`

### 2e. Close button (App.css ~L156)

Change `.dictionary-close-button`:
- `border-radius: 10px` → `0`
- Add `box-shadow: 0 1px 0 var(--accent-ink)`

### 2f. Copy menu (App.css ~L350)

Change `.dictionary-copy-menu`:
- `border-radius: 14px` → `2px`

### 2g. Header

Change `.dictionary-header`:
- Keep layout, add `.cassette-panel-header` pattern (remove border-radius, use squared)
- Change `h2` font: keep `--display-font` (already cassette-consistent)

**Estimated CSS changes:** ~12 property overrides, ~1 file

---

## Phase 3: Study Overview

**Files:** `App.tsx` (inline JSX), `OverviewView.tsx`, App.css.

### 3a. Panel container (App.css L5543-5555)

Change `.overview-popup-panel`:
- `border-radius: 20px` → `2px`
- `box-shadow: ...` → add `0 2px 0 var(--accent-ink)`
- Keep `linear-gradient` background

### 3b. Internal panels (App.css ~L4404)

Change `.panel-glass.overview-collapsible-panel`:
- `border-radius: var(--radius-panel)` (14px) → `2px`

### 3c. Study plan panel (App.css ~L4600)

Change `.overview-study-plan-panel`:
- `border-radius: 22px` → `2px`

### 3d. Panel toggle buttons (App.css ~L4350)

Change `.overview-panel-toggle`:
- Keep layout, square any rounded corners on hover/focus states

### 3e. Header (inline in App.tsx)

The overview panel header is simple `h2` text in App.tsx. Add monospace subtitle:

```tsx
<div className="cassette-panel-header">
  <div>
    <h2 className="cassette-panel-header-title">Study Overview</h2>
    <span className="cassette-panel-header-subtitle">DECK STATUS</span>
  </div>
  <button className="cassette-panel-close" onClick={closeOverview}>...</button>
</div>
```

**Estimated changes:** ~8 CSS overrides + ~8 lines JSX, 3 files

---

## Phase 4: Settings Sheet

**Files:** App.tsx (inline JSX, ~550 lines), App.css.

### 4a. Sheet container (App.css L9646-9656)

Change `.settings-sheet`:
- `border-radius: 24px` → `2px`
- Add `box-shadow: 0 2px 0 var(--accent-ink), 0 0 40px -20px rgba(0,0,0,0.8)`
- Media query: `border-radius: 22px` → `2px`

### 4b. Modal header (App.css ~L10967)

Change `.settings-modal-header`:
- Square any rounded corners
- Change title: keep `--display-font`, add cassette header pattern

### 4c. Tab buttons (App.css ~L10980)

Change `.settings-tab-button`:
- `border-radius: var(--radius-control)` (8px) → `0`
- Add `box-shadow: 0 1px 0 var(--accent-ink)` on active
- Change font to `var(--mono)` with uppercase + letter-spacing

### 4d. Settings sections (App.css ~L10990)

Change `.settings-section` / `.settings-control-row`:
- `border-radius: 14px` → `2px`
- `background: color-mix(...)` → keep, it's already translucent-dark

### 4e. Section label (App.css)

Change `.settings-section-label`:
- Already uses `text-transform: uppercase; letter-spacing: 0.1em` → keep (already cassette!)
- Change font to `var(--mono)` to match

### 4f. Close button

Use `.cassette-panel-close` class.

### 4g. JSX changes in App.tsx

Replace the settings header JSX with:

```tsx
<header className="cassette-panel-header settings-modal-header">
  <div>
    <span className="cassette-panel-header-title">Control Panel</span>
    <span className="cassette-panel-header-subtitle">QUICK APP CONTROLS</span>
  </div>
  <button className="cassette-panel-close" onClick={() => setShowSettings(false)}>...</button>
</header>
```

**Estimated changes:** ~12 CSS overrides + ~10 lines JSX, 2 files

---

## Phase 5: Tutor Chat — Clean Squared Cards

**Files:** `TutorChatPanel.tsx`, App.css.

The panel itself (squared corners, hard shadow, CRT vignette) carries the cassette identity. Messages inside use clean squared cards with monospace role labels — no glow gimmicks, no monospace body text, no terminal aesthetic. Simple and readable.

### 5a. Panel container (App.css L762-795, L9633-9644)

Change both `.assistant-chat-panel` (inline mode) and `.assistant-chat-window` (popup mode):
- `border-radius: 16px / 20px` → `2px`
- `box-shadow` → `0 2px 0 var(--accent-ink), 0 8px 28px -16px rgba(0, 0, 0, 0.68)`
- Add CRT vignette via `::after`:
  ```css
  .assistant-chat-panel::after,
  .assistant-chat-window::after {
    content: '';
    position: absolute; inset: 0;
    pointer-events: none;
    border-radius: inherit;
    background: radial-gradient(ellipse at center, transparent 58%, rgba(0, 0, 0, 0.18) 100%);
    z-index: 1;
  }
  ```

### 5b. Header (App.css L797-809, L811-887)

Redesign `.assistant-chat-header`:
- `border-top-left-radius: 16px; border-top-right-radius: 16px` → `0`
- Title: change to `var(--mono)`, uppercase `SENSEI v4.2`
- Subtitle: monospace status `ONLINE · HERE TO HELP` / `TYPING…`
- Remove avatar circle → replace with inline monospace label `SENSEI v4.2` in accent color
- Action buttons (audio, clear, close):
  - `border-radius: 999px` → `0`
  - Add `box-shadow: 0 1px 0 var(--accent-ink)`
  - `:active { transform: translateY(1px); box-shadow: none; }`

### 5c. Chat log area (App.css L954-969)

Redesign `.assistant-chat-log`:
```css
.assistant-chat-log {
  position: relative;
  z-index: 2;  /* above vignette */
  flex: 1;
  min-height: 180px;
  overflow: auto;
  display: grid;
  gap: 8px;
  align-content: start;
  padding: 12px;
  margin: 0;
  border-radius: 0;
  border: none;
  background: color-mix(in oklab, var(--bg-main) 96%, black);
  box-shadow: inset 0 2px 8px rgba(0, 0, 0, 0.45);
  scrollbar-width: thin;
  scrollbar-color: color-mix(in oklab, var(--panel-border) 50%, var(--tone-ocean)) transparent;
}
```

### 5d. Message cards (REPLACE bubble CSS, App.css L997-1133)

**REMOVE** all bubble CSS (~20 lines):
- `.assistant-chat-turn p` with `border-radius: 16px` / `border-top-left-radius: 7px`
- `.assistant-chat-turn-assistant p` background/border
- `.assistant-chat-turn-user p` background/border
- `.assistant-chat-turn-role` with `border-radius: 999px`

**ADD** squared card styles:
```css
/* ── Squared message cards ──────────────────────────────── */

.assistant-chat-turn {
  display: flex;
  flex-direction: column;
  gap: 0;
  max-width: min(84%, 460px);
}

.assistant-chat-turn-assistant {
  align-items: flex-start;
  justify-self: start;
}

.assistant-chat-turn-user {
  align-items: flex-end;
  justify-self: end;
}

/* Message card — recessed CRT depth */
.assistant-chat-message-card {
  border-radius: 2px;
  border: 1px solid color-mix(in oklab, var(--panel-border) 62%, transparent);
  background: color-mix(in oklab, var(--panel-bg) 97%, black);
  box-shadow: inset 0 1px 3px rgba(0, 0, 0, 0.3);
  padding: 8px 10px;
}

/* Coach card — ocean-tinted */
.assistant-chat-turn-assistant .assistant-chat-message-card {
  border-color: color-mix(in oklab, var(--tone-ocean) 42%, var(--panel-border));
}

/* Card header row: role label + replay button */
.assistant-chat-card-header {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 4px;
}

/* Monospace role label */
.assistant-chat-role-label {
  font-family: var(--mono);
  text-transform: uppercase;
  letter-spacing: 0.06em;
  font-weight: 600;
  font-size: 0.62rem;
}

.assistant-chat-turn-assistant .assistant-chat-role-label {
  color: var(--tone-ocean);
}

.assistant-chat-turn-user .assistant-chat-role-label {
  color: var(--text-soft);
}

/* Message text — clean, readable */
.assistant-chat-message-text {
  margin: 0;
  font-size: 0.8rem;
  line-height: 1.45;
  color: var(--text-main);
  white-space: pre-wrap;
}

/* Replay button — squared, cassette-style */
.assistant-chat-turn-replay {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid color-mix(in oklab, var(--panel-border) 64%, white 36%);
  background: color-mix(in oklab, var(--panel-bg) 94%, black);
  color: var(--text-soft);
  border-radius: 0;
  width: 20px;
  height: 20px;
  padding: 0;
  cursor: pointer;
  box-shadow: 0 1px 0 var(--accent-ink);
}
.assistant-chat-turn-replay:hover:not(:disabled) {
  border-color: color-mix(in oklab, var(--tone-ocean) 52%, var(--panel-border));
  color: color-mix(in oklab, var(--tone-ocean) 80%, var(--text-main));
}
.assistant-chat-turn-replay.is-speaking {
  border-color: color-mix(in oklab, var(--tone-ocean) 62%, var(--panel-border));
  color: color-mix(in oklab, var(--tone-ocean) 86%, var(--text-main));
  background: color-mix(in oklab, var(--panel-bg) 82%, var(--tone-ocean) 18%);
}

/* Typing indicator — blinking cursor block */
.assistant-chat-typing {
  display: inline;
  color: var(--text-soft);
}
.assistant-chat-typing::after {
  content: '▊';
  color: var(--tone-ocean);
  animation: cassette-cursor-blink 1s step-end infinite;
}
@keyframes cassette-cursor-blink {
  0%, 100% { opacity: 1; }
  50% { opacity: 0; }
}
```

### 5e. Composer / Input area (App.css L1215-1284)

Change `.assistant-chat-input-wrap`:
- `border-radius: 18px` → `2px`
- Add `> ` prompt prefix via `::before`:
  ```css
  .assistant-chat-input-wrap::before {
    content: '> ';
    color: var(--tone-ocean);
    font-family: var(--mono);
    font-size: 0.78rem;
    font-weight: 600;
    align-self: center;
  }
  ```

Send button `.assistant-chat-send`:
- `border-radius: 50%` → `0`
- Add `box-shadow: 0 2px 0 var(--accent-ink)`
- `:active { transform: translateY(2px); box-shadow: none; }`

### 5f. JSX changes in TutorChatPanel.tsx

**Header** — replace avatar circle with monospace label:
```tsx
<header className="assistant-chat-header">
  <div className="assistant-chat-identity">
    <span className="assistant-chat-role-label" style={{ color: 'var(--tone-ocean)' }}>
      SENSEI v4.2
    </span>
    <span className="assistant-chat-subtitle">
      {assistantChatLoading ? 'TYPING…' : 'ONLINE · HERE TO HELP'}
    </span>
  </div>
  ...actions
</header>
```

**Message rendering** — replace `article` bubble with squared card:
```tsx
{assistantChatMessages.map((turn, index) => {
  const turnKey = `${turn.created_at_utc}-${index}`
  const isReplaySpeaking = assistantSpeakingTurnKey === turnKey
  return (
    <div key={turnKey} className={`assistant-chat-turn assistant-chat-turn-${turn.role}`}>
      <div className="assistant-chat-message-card">
        <div className="assistant-chat-card-header">
          <span className="assistant-chat-role-label">
            {turn.role === 'assistant' ? 'SENSEI' : 'YOU'}
          </span>
          {turn.role === 'assistant' && (
            <button
              type="button"
              className={`assistant-chat-turn-replay ${isReplaySpeaking ? 'is-speaking' : ''}`}
              onClick={() => {
                if (isReplaySpeaking) { cancelAssistantSpeech(); return }
                replayAssistantTurn(turn.content, turnKey)
              }}
              disabled={!settings.assistantChatAudioEnabled}
              aria-label={settings.assistantChatAudioEnabled ? (isReplaySpeaking ? 'Stop audio' : 'Replay audio') : 'Enable chat audio'}
            >
              <Volume2 size={12} strokeWidth={2.2} aria-hidden="true" />
            </button>
          )}
        </div>
        <p className="assistant-chat-message-text">
          {turn.role === 'assistant' ? (
            <TypeAnimation key={turnKey} sequence={[turn.content]} speed={12} cursor={false} style={{ display: 'inline' }} />
          ) : turn.content}
        </p>
      </div>
    </div>
  )
})}
```

**Typing indicator:**
```tsx
{assistantChatLoading && (
  <div className="assistant-chat-turn assistant-chat-turn-assistant">
    <div className="assistant-chat-message-card">
      <span className="assistant-chat-role-label">SENSEI</span>
      <p className="assistant-chat-message-text">
        <span className="assistant-chat-typing">Thinking</span>
      </p>
    </div>
  </div>
)}
```

**Estimated changes:** ~20 CSS lines removed, ~45 CSS lines added, ~25 JSX lines changed, 2 files

---

## Phase 6: OCR Workbench

**Files:** `OcrWorkbench.tsx`, App.css.

Since OCR Workbench shares `.assistant-chat-panel` and `.assistant-chat-window` classes with Tutor Chat, most of the heavy lifting is done in Phase 5.

### 6a. Panel
Already handled by Phase 5's `border-radius: 2px` changes.

### 6b. OCR result cards (App.css ~L1185-1213)

Change `.assistant-chat-ocr-summary`:
- `border-radius: 10px` → `2px`

Change `.assistant-chat-ocr-summary-clear`:
- `border-radius: 999px` → `0`
- Add `box-shadow: 0 1px 0 var(--accent-ink)`

### 6c. OCR workbench content boxes

The Japanese/English result boxes: check if they use any rounded corners. If so, square them.

**Estimated changes:** ~4 CSS overrides, 1 file

---

## Phase 7: Titlebar Shortcut Menu

**Files:** App.tsx (inline JSX), App.css.

### 7a. Menu container (App.css L1984-2003)

Change `.titlebar-shortcut-menu`:
- `border-radius: 14px` → `2px`
- `box-shadow: 0 18px 34px -20px ...` → add `0 2px 0 var(--accent-ink), 0 12px 24px -16px rgba(0,0,0,0.8)`
- Keep the `radial-gradient + linear-gradient` background (already good)

### 7b. Menu items (App.css ~L2050)

Change `.titlebar-shortcut-item`:
- `border-radius: 10px` → `0`
- Change font: keep `--button-font` (already cassette-friendly: Kaisei Decol)

### 7c. Right-tree flyout (App.css ~L2080)

Same as menu container → `border-radius: 2px`, hard shadow.

**Estimated changes:** ~4 CSS overrides, 1 file (App.css only, no JSX changes needed)

---

## Phase 8: Readiness Warning Modal

**Files:** `ReadinessWarningModal.tsx`, App.css.

### 8a. Modal panel (inherits `.modal-panel`)

`.modal-panel` has `border-radius: 20px`. Change to `2px`. Since this is the shared modal-panel base, this affects ALL modals — which is correct for cassette consistency.

BUT: change `.modal-panel` carefully. The `.modal-panel` class is used by:
- Readiness warning modal ✅ (want squared)
- Possibly other modals → all should be squared for consistency

### 8b. Action buttons (App.css L13145-13232)

Change `.rwm-back-btn`:
- `border-radius: 10px` → `0`
- Add `box-shadow: 0 2px 0 var(--accent-ink)`
- Add `:active { transform: translateY(2px); box-shadow: none; }`

Change `.rwm-continue-btn`:
- `border-radius: 10px` → `0`
- Same shadow treatment

### 8c. Close button (App.css)

Change `.modal-close-btn`:
- `border-radius: 6px` → `0`

**Estimated changes:** ~6 CSS overrides, 2 files

---

## Phase 9: Streak/XP Popovers

**Files:** App.tsx (inline JSX), App.css.

### 9a. Streak details (App.css L5784-5832)

Change `.titlebar-streak-details`:
- `border-radius: 12px` → `2px`
- `box-shadow: 0 18px 36px -22px ...` → `0 2px 0 var(--accent-ink), 0 12px 24px -16px rgba(0,0,0,0.75)`

### 9b. XP details (App.css L5888-5924)

Change `.titlebar-xp-details`:
- `border-radius: 12px` → `2px`
- Same shadow treatment

**Estimated changes:** ~4 CSS overrides, 1 file

---

## Phase 10: Global `.modal-panel` Update

The shared `.modal-panel` class (App.css L9619-9627) currently has `border-radius: 20px`. After all panels are converted, update this base class:

```css
.modal-panel {
  border-radius: 2px;    /* was 20px */
  box-shadow: 0 2px 0 var(--accent-ink), 0 0 60px -20px rgba(0, 0, 0, 0.9);
}
```

This ensures any modal we missed gets the squared treatment. Test: quick scan for all `.modal-panel` usages.

---

## Phase 11: Validation

### Per-phase validation
- `npm run build` (typecheck + vite build) — must succeed
- `npm run lint` (oxlint) — must pass zero warnings
- Manual smoke test: open each panel, verify squared corners, vignette visible, no visual regressions

### Full validation
- `npm run test:ui` — all existing tests pass
- `npm run test:a11y` — must pass (squared corners don't affect accessibility)

### Performance check
- No layout shift or animation jank from the vignette `::after` pseudo-elements
- Verify `pointer-events: none` on vignette overlays so clicks pass through

---

## CSS Insertion Strategy

All new cassette CSS classes go into **App.css** in a single block near the existing modal/panel definitions (~line 9627, after `.modal-panel`).

Existing classes are modified **in-place** at their current line locations — no reorganization.

### File: App.css (only CSS file touched)
- Add: ~80 lines (shared cassette classes)
- Modify: ~70 property overrides across 9 component sections
- Remove: ~20 lines (old bubble CSS, replaced not deleted — overridden with new values)

### Files with JSX changes
- **TutorChatPanel.tsx** — ~30 lines changed (message rendering structure)
- **App.tsx** — ~10 lines changed (settings header template)

### Files with NO changes
- DictionaryPopup.tsx (CSS-only changes)
- OcrWorkbench.tsx (CSS-only changes)
- OverviewView.tsx (CSS-only changes; may need minimal JSX if header changes)
- ReadinessWarningModal.tsx (CSS-only changes)
- All feature hooks (useTutor, useVoice, useTheme, useBackground, useModels)

---

## Execution Order & Dependencies

Phases are independent **except** Phase 10 (global modal-panel) should run last to catch any stragglers.

Recommended order:
1. **Phase 1** — Shared CSS classes (foundation, no risk)
2. **Phase 7** — Titlebar shortcut menu (small, easy win)
3. **Phase 8** — Readiness warning (small, builds confidence)
4. **Phase 9** — Streak/XP popovers (small)
5. **Phase 2** — Dictionary (moderate, good test of panel system)
6. **Phase 3** — Study overview (moderate)
7. **Phase 4** — Settings (large but straightforward CSS)
8. **Phase 5** — Tutor Chat clean squared cards (largest, most impactful, save for when patterns are solidified)
9. **Phase 6** — OCR workbench (small, follows Phase 5)
10. **Phase 10** — Global modal-panel update (safety net)
11. **Phase 11** — Full validation

Phase 5 (Tutor Chat) is the only phase with significant JSX changes. All others are CSS-only.

---

## Design Tradeoffs & Notes

1. **No physical cassette objects** (screws, reels, tape holes) — these wouldn't make sense on overlay panels that appear/disappear. The core aesthetic (squared, hard shadows, monospace labels, CRT vignette) is achievable and consistent.

2. **No scanlines on panels** — scanlines would interfere with text readability in small panels. CRT vignette (dark edges) provides depth without reducing legibility. Hub views keep their full CRT scanlines.

3. **Clean squared cards over chat bubbles** — squared message cards with monospace role labels (`[SENSEI]` / `[YOU]`) and Kiwi Maru body text. No bubble tail geometry, no glow gimmicks. The panel carries the cassette aesthetic; messages just need to not clash.

4. **`color-mix()` borders everywhere** — consistent with the cassette carousel and hub controls. These adapt automatically to all 22 themes via CSS variable references.

5. **Monospace-only for labels, not body text** — Japanese text in Kiwi Maru (serif) is already part of the cassette identity. Body text in chat retains its readable font; only HUD/label elements switch to monospace.

6. **Animations preserved** — `enterUp`, `dictionaryDockIn`, `assistantPanelIn` animations are kept but their transform values stay the same. The visual change is in the static styling, not the motion.

---

## Appendix: Complete Cassette CSS Reference Card

```css
/* SQUARED CORNERS */
border-radius: 0;   /* buttons, chips, input wraps */
border-radius: 2px; /* panels, cards, modals */

/* HARD SHADOWS (cel-shaded) */
box-shadow: 0 2px 0 var(--accent-ink);                                    /* button press */
box-shadow: 0 2px 0 var(--accent-ink), 0 8px 28px -16px rgba(0,0,0,0.68); /* panel lift */

/* BUTTON ACTIVE STATE */
:active { transform: translateY(2px); box-shadow: none; }

/* CRT VIGNETTE */
position: relative;
&::after {
  content: '';
  position: absolute; inset: 0; pointer-events: none; border-radius: inherit;
  background: radial-gradient(ellipse at center, transparent 58%, rgba(0,0,0,0.18) 100%);
  z-index: 1;
}

/* MONOSPACE LABEL */
font-family: var(--mono);
text-transform: uppercase;
letter-spacing: 0.08em;
font-weight: 600;
font-size: 0.64rem;

/* COLOR-MIX BORDER */
border: 1px solid color-mix(in oklab, var(--panel-border) 72%, transparent);

/* PHYSICAL DEPTH (inset) */
box-shadow: inset 0 2px 6px rgba(0,0,0,0.4);
```

---

## Summary Statistics

| Metric | Value |
|--------|-------|
| Panels themed | 9 |
| CSS files touched | 1 (App.css) |
| TSX files touched | 2 (TutorChatPanel.tsx, App.tsx) |
| New CSS added | ~75 lines |
| CSS modified | ~70 property overrides |
| CSS removed | ~20 lines (bubble styles) |
| JSX changed | ~35 lines |
| Risk level | Low (styling only, no logic changes) |
| Breaking changes | None (visual only) |
