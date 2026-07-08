# Plan: Final Cleanup — Button Consistency, OCR, Close Buttons, Chat Animation

**Status:** Planning. **Issues:** 4 remaining inconsistencies after cassette conversion.

---

## Issue 1: Dark Buttons in Dictionary + Control Panel + Copy Submenu

### 1a. Dictionary buttons still dark

| Button | Class | Current Background | Fix |
|--------|-------|-------------------|-----|
| Close (X) | `.dictionary-close-button` | `linear-gradient(button-bg-top, button-bg-bottom)` | `color-mix(var(--panel-bg) 84%, white)` |
| Search | `.dictionary-search-button` | Same gradient | Same light blend |
| Voice | `.dictionary-icon-action` | Same gradient | Same light blend |
| Copy | `.dictionary-icon-action` | Same gradient | Same light blend |

**File:** `App.css` — 3 CSS blocks

### 1b. Copy submenu buttons rounded (border-radius: 9px)

The `.dictionary-copy-menu` contains buttons (`.dictionary-copy-menu button` or similar). Find and square them.

**File:** `App.css` — add rule for menu buttons

### 1c. Control Panel X button dark

`.modal-close-button` uses `linear-gradient(button-bg-top, button-bg-bottom)`.

**File:** `App.css` — change background to `color-mix(var(--panel-bg) 84%, white)`

---

## Issue 2: OCR Confidence Meter + Upload Button

### 2a. OCR confidence slider

The OCR confidence range input is functional. Keep it but recolor:
- The slider track uses accent-color. Add CSS for better styling.
- Or skip if the slider is acceptable as-is.

### 2b. Upload image button pill-shaped

`.assistant-chat-upload` has `border-radius: 999px`. Change to `0`, add `box-shadow: 0 2px 0 var(--accent-ink)`.

Also check `.ocr-workbench-upload` which overrides it.

**Files:** `App.css`

---

## Issue 3: Close Button Inconsistency

Current close buttons across 6 panels:

| Panel | Class | Size | Background | Icon | Notes |
|-------|-------|------|------------|------|-------|
| Overview | `.topbar-settings-button` | ~28px | `color-mix` | 16px | **Guideline** |
| Dictionary | `.dictionary-close-button` | 34px | gradient | 16px | Dark bg |
| Tutor Chat | `.assistant-chat-close` | 26px | `color-mix` | 14px | Too small |
| OCR | `.assistant-chat-close` | 26px | `color-mix` | 14px | Too small |
| Settings | `.modal-close-button` | 32px | gradient | text "x" | Dark bg |
| Readiness | `.modal-close-btn` | auto | transparent | 16px | No border |

**Standard to apply**: 28×28px, `color-mix(var(--panel-bg) 94%, black)`, 1px border, `box-shadow: 0 1px 0 var(--accent-ink)`, 16px icon. This matches the `.cassette-panel-close` style.

### Approach:
1. Update `.dictionary-close-button` to match standard (combined with 1a fix)
2. Update `.assistant-chat-close` (and shared base) to 28×28px, 16px icon
3. Update `.modal-close-button` to match standard (combined with 1c fix)
4. Update `.modal-close-btn` to match standard
5. Keep `.topbar-settings-button` as-is (guideline)

OR simpler: have all close buttons use the existing `.cassette-panel-close` class.

**Files:** `App.css`, possibly JSX to change className

---

## Issue 4: Chat TypeAnimation Replays on Reopen

**Root cause:** `TutorChatPanel` is conditionally rendered. On close, the component unmounts. On reopen, it mounts fresh and `TypeAnimation` replays all messages.

**Fix options:**

### Option A: Keep panel mounted, use visibility
Replace `{tutor.assistantChatOpen ? <TutorChatPanel /> : null}` with `<TutorChatPanel style={{ display: assistantChatOpen ? 'block' : 'none' }} />` and pass the open state as a prop. The component stays mounted so TypeAnimation doesn't replay.

### Option B: Track animation completion
Add a ref `hasAnimatedMessages` that is set after the first render. On subsequent renders, skip TypeAnimation and render plain text. Complex and fragile.

### Option C: Use a different key strategy
Give `TypeAnimation` a key that includes a version counter that only increments when new messages arrive, not when the panel reopens. But the issue is the component unmounts entirely.

### Recommendation: Option A
Change the conditional rendering to visibility-based. `TutorChatPanel` stays mounted, TypeAnimation only replays when new content arrives. This is the simplest fix with no behavioral changes to the animation logic.

**Files:** `App.tsx` (render logic), `TutorChatPanel.tsx` (accept `visible` prop)

---

## Execution Order

1. Issue 1a-c: Lighten all dark buttons (dictionary close, search, voice, copy, modal-close)
2. Issue 1b: Square copy submenu buttons
3. Issue 2b: Square upload image button
4. Issue 3: Standardize close button sizes across all panels
5. Issue 4: Fix TypeAnimation replay (Option A)

## Validation

- `npm run build` — must succeed
- Visual check: all buttons light, submenu squared, close buttons consistent, chat animation doesn't replay on reopen
