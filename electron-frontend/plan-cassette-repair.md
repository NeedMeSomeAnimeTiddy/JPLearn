# Cassette Panel Repair Plan

**Status:** Planning. **Trigger:** Panels look "too flat and ugly" after Phase 1-11 conversion.  
**Strategy:** Apply scanlines + fix buttons & headers first (Batch A), then reassess remaining flatness issues.

## Root Causes

| Issue | Cause |
|-------|-------|
| **Missing CRT texture** | No scanline overlay on panels — they're just dark rectangles. Hub views have `repeating-linear-gradient` scanlines at 60% opacity. |
| Settings tab buttons ugly | `font: var(--mono)` + `textTransform: uppercase` + `color: var(--text-soft)` — devtools form, not product |
| Title bars "weird color" | `cassette-panel-header` adds a `var(--tone-ocean)` radial gradient that clashes on some themes |
| Title bars "not full width" | Header padding doesn't match panel edge — header sits inset |
| Everything at `border-radius: 2px` | Cassette body uses `4px`. No geometric contrast |
| Internal cards too flat | `inset 0 1px 3px` is barely visible. Cassette window uses `inset 0 3px 8px rgba(0,0,0,0.7)` |

---

## Execution Strategy

### Batch A (first): Scanlines + Button Fix + Header Fix
Execute R0 → R1 → R2, then pause for visual assessment.

### Batch B (if needed): Radius + Depth
Only run R3 → R4 → R5 if Batch A doesn't resolve the flatness.

---

## Batch A

### Phase R0: CRT Scanline Overlay — All Panels + Chat Log

**Reference:** Existing hub scanline code (`App.css` line ~2562):

```css
.hub-crt-surface {
  background: repeating-linear-gradient(
    0deg, transparent, transparent 2px,
    rgba(0, 0, 0, 0.06) 2px, rgba(0, 0, 0, 0.06) 3px
  );
  opacity: 0.6;
}
```

**Approach:** Add a `.crt-scanlines` utility class that panels can use as a `::before` pseudo-element overlay.

#### R0a: Shared scanline utility class

Add to App.css (near the `.cassette-panel` block):

```css
/* ── CRT scanline overlay ──────────────────────────────── */

.crt-scanlines::before {
  content: '';
  position: absolute;
  inset: 0;
  pointer-events: none;
  z-index: 98;  /* below vignette (z-index: 99), above content (z-index: 2) */
  background: repeating-linear-gradient(
    0deg,
    transparent, transparent 2px,
    rgba(0, 0, 0, 0.06) 2px, rgba(0, 0, 0, 0.06) 3px
  );
  opacity: 0.4;  /* slightly subtler than hub views (0.6) for readability */
}
```

#### R0b: Apply `.crt-scanlines` to panel shells

Add the class to these panel containers:

| Panel | Class to modify |
|-------|----------------|
| Dictionary | `.dictionary-panel` (already has `::after` for vignette) |
| Study Overview | `.overview-popup-panel` (already has `::after` for vignette) |
| Settings | `.settings-sheet` (already has `::after` for vignette) |
| Tutor Chat (popup) | `.assistant-chat-window` (already has `::after` for vignette) |
| Tutor Chat (inline) | `.assistant-chat-panel` |
| Shortcut Menu | `.titlebar-shortcut-menu` |
| Readiness Warning | `.modal-panel` base class |
| Streak/XP Popovers | `.titlebar-streak-details`, `.titlebar-xp-details` |

The CSS becomes: add `crt-scanlines` class in the HTML, or compose `::before` directly in the panel's CSS. The cleanest approach is to add the `.crt-scanlines` class to each panel element in the JSX/HTML. But since many are inline in App.tsx, CSS composition is cleaner.

**Actual implementation:** Add the `::before` scanline block directly to each panel's existing CSS definition. Example:

```css
.dictionary-panel::before {
  content: '';
  position: absolute;
  inset: 0;
  pointer-events: none;
  z-index: 98;
  background: repeating-linear-gradient(
    0deg, transparent, transparent 2px,
    rgba(0, 0, 0, 0.06) 2px, rgba(0, 0, 0, 0.06) 3px
  );
  opacity: 0.4;
}
```

This needs to be added to ~8 panel selectors. Alternatively, create one `.crt-scanlines` CSS class and add it to each panel element's className in JSX. The JSX approach is simpler and avoids CSS duplication.

**Decision: Create the `.crt-scanlines` CSS class, then add `crt-scanlines` className to each panel div in JSX.**

Files affected:
- **App.css:** ~10 lines (new `.crt-scanlines` class)
- **App.tsx:** ~6 className additions (settings sheet, overview, shortcut menu, etc.)
- **DictionaryPopup.tsx:** 1 className addition
- **TutorChatPanel.tsx:** 1 className addition
- **OcrWorkbench.tsx:** 1 className addition

#### R0c: Scanlines on chat log

The chat log (`.assistant-chat-log`) is the most CRT-like surface — it should have scanlines integrated into its background, not as a separate overlay. Use a background-image stack:

```css
.assistant-chat-log {
  background:
    repeating-linear-gradient(
      0deg, transparent, transparent 2px,
      rgba(0, 0, 0, 0.04) 2px, rgba(0, 0, 0, 0.04) 3px
    ),
    color-mix(in oklab, var(--bg-main) 96%, black);
  /* keep inset shadow for depth */
}
```

The chat log scanlines are even subtler (0.04 vs 0.06) since text is read there.

---

### Phase R1: Fix Settings Tab Buttons

**File:** App.css (`.settings-tab-button` block)

**Before (current, bad):**
```css
.settings-tab-button {
  font-family: var(--mono);          /* monospace — looks like devtools */
  font-size: 0.7rem;
  text-transform: uppercase;         /* form-like */
  letter-spacing: 0.04em;
  font-weight: 600;
  color: var(--text-soft);           /* muted — hard to read */
  border-radius: 0;
  box-shadow: 0 1px 0 var(--accent-ink);
}
```

**After:**
```css
.settings-tab-button {
  font-family: var(--button-font);   /* Kaisei Decol — matches UI buttons */
  font-size: 0.76rem;
  font-weight: 600;
  color: var(--text-main);           /* dark text — legible */
  border: 1px solid var(--chip-border);
  border-radius: 0;
  background: var(--chip-bg);
  box-shadow: 0 2px 0 var(--accent-ink);  /* thicker extrusion */
  cursor: pointer;
  transition: border-color 140ms ease, background-color 140ms ease, color 140ms ease, transform 80ms ease, box-shadow 80ms ease;
}

.settings-tab-button:hover {
  border-color: color-mix(in oklab, var(--accent) 52%, var(--chip-border));
  color: var(--text-main);
}

.settings-tab-button:active {
  transform: translateY(1px);
  box-shadow: 0 1px 0 var(--accent-ink);
}

.settings-tab-button.is-active {
  border-color: color-mix(in oklab, var(--accent) 68%, var(--chip-border));
  color: var(--text-main);
  background: color-mix(in oklab, var(--accent) 16%, var(--chip-bg));
  box-shadow: inset 0 2px 4px rgba(0, 0, 0, 0.2);  /* pressed-in */
  transform: translateY(2px);
}
```

---

### Phase R2: Fix Header Bars

#### R2a. `.cassette-panel-header` — remove ocean tint

**File:** App.css

```css
.cassette-panel-header {
  position: relative;
  z-index: 2;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 10px 14px;
  margin: 0;
  border-bottom: 1px solid color-mix(in oklab, var(--panel-border) 68%, transparent);
  /* REPLACE: radial-gradient with var(--tone-ocean) → simple panel-bg */
  background: color-mix(in oklab, var(--panel-bg) 88%, black);
}
```

#### R2b. `.settings-modal-header` — remove standalone bottom margin

**File:** App.css

The `.settings-modal-header` currently has `margin-bottom: 18px` which pushes the tab list down. Remove it — the panel's internal padding should handle spacing. Keep `display: flex; justify-content: space-between; align-items: flex-start; gap: 12px;` and the padding/border from `.cassette-panel-header`.

```css
.settings-modal-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 12px;
  /* margin-bottom: 18px;  ← REMOVE */
  /* padding + bg + border inherit from cassette-panel-header */
}
```

#### R2c. `.overview-popup-header` — ensure full-width

The overview header already correctly uses `position: sticky; top: 0; z-index: 10;` plus `cassette-panel-header`. After R2a (removing ocean tint), it should look clean.

#### R2d. `.dictionary-header` — simplify background

Change from `background: linear-gradient(180deg, var(--panel-bg) 82%, transparent)` to solid `background: color-mix(in oklab, var(--panel-bg) 88%, black)` — consistent with cassette-panel-header.

---

## Batch A — Validation

After R0 → R1 → R2:
- `npm run build`
- Visual check: scanlines visible, tab buttons readable, headers clean

## Reassessment Decision Point

After Batch A validation, decide:

| If panels still feel flat... | Then run Batch B |
|---|---|
| No geometric depth | R3: border-radius 2px → 4px |
| Cards feel like CSS rectangles | R4: deeper inset shadows |
| Edges too dark/muddy | R5: reduce vignette opacity |

---

## Batch B (Conditional — only if needed after Batch A)

### Phase R3: Panel Shell Rounding — 2px → 4px

Change `border-radius: 2px` → `4px` on 6 selectors:
`.cassette-panel`, `.dictionary-panel`, `.overview-popup-panel`, `.settings-sheet`, `.assistant-chat-panel`, `.assistant-chat-window`, `.modal-panel`

Keep `2px` on internal elements (cards, inputs) for geometric contrast.

### Phase R4: Internal Card Depth — Subtler Recess

- Chat message cards: `inset 0 2px 5px rgba(0,0,0,0.45)` + bottom light catch
- Settings sections: `border-radius: 4px`
- Dictionary search: `inset 0 2px 5px rgba(0,0,0,0.35)`

### Phase R5: Reduce Vignette Opacity

Change `rgba(0,0,0,0.15-0.18)` → `rgba(0,0,0,0.10)` on all panel `::after` vignettes.

---

## Summary

| Batch | Phases | Files | Risk |
|-------|--------|-------|------|
| A | R0 (scanlines) + R1 (tab buttons) + R2 (headers) | App.css, App.tsx, DictionaryPopup.tsx, TutorChatPanel.tsx, OcrWorkbench.tsx | Low |
| B | R3 (radius) + R4 (depth) + R5 (vignette) | App.css only | Low |

**Batch A is the minimum viable fix.** Batch B is refinement if the core issues (missing CRT texture, ugly buttons, weird headers) are resolved by Batch A.
