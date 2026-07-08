# Plan: Unify All Action Buttons Across Popover Menus

**Status:** Planning. **Findings:** 10 inconsistencies across 6 popover menus.

## Current State Summary

| Popover | Close Button | Action Buttons | Issues |
|---------|-------------|----------------|--------|
| Study Overview | `.topbar-settings-button` (36px, light) | `.topbar-settings-button` (refresh) | Both use different class from `.panel-close-button` |
| Dictionary | `.panel-close-button` (36px) | `.dictionary-icon-action` (30px, dark) | Close misaligned, icon size wrong, action buttons wrong size/color |
| Tutor Chat | `.panel-close-button` (36px) | `.assistant-chat-audio-toggle` + `.assistant-chat-clear` (28px, dark) | Action buttons too small + dark |
| OCR Workbench | `.panel-close-button` (36px) | `.assistant-chat-clear` (28px, dark) | Same as Tutor |
| Settings | `.panel-close-button` (36px) | None | Clean |
| Readiness Warning | `.panel-close-button` (36px, absolute) | `.rwm-back-btn` + `.rwm-continue-btn` (different styles, "Continue" still rounded) | Inconsistent |

## Guideline: The Standard Look

All action buttons should match this pattern (36×36px for icon buttons, proportional for text buttons):

```css
width/height: 36px (icon) or auto (text)
background: var(--bg-main)
border: 1px solid var(--panel-border)
border-radius: 0
color: var(--text-main)
box-shadow: 0 2px 0 rgba(0, 0, 0, 0.08)
hover: border-color: var(--accent)
active: translateY(2px), shadow: 0 1px 0 rgba(0,0,0,0.08)
```

---

## Phase 1: Create `.panel-action-button` CSS Class

**File:** `App.css` — add after `.panel-close-button`

```css
/* ── Unified panel action button (matches .panel-close-button) ── */

.panel-action-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: 36px;
  height: 36px;
  border: 1px solid var(--panel-border);
  border-radius: 0;
  background: var(--bg-main);
  color: var(--text-main);
  cursor: pointer;
  box-shadow: 0 2px 0 rgba(0, 0, 0, 0.08);
  transition: transform 80ms ease, border-color 140ms ease, color 140ms ease;
  font-size: 0.7rem;      /* for text content like "Search" */
}

.panel-action-button:hover {
  border-color: var(--accent);
}

.panel-action-button:active:not(:disabled) {
  transform: translateY(2px);
  box-shadow: 0 1px 0 rgba(0, 0, 0, 0.08);
}

.panel-action-button:disabled {
  opacity: 0.45;
  cursor: default;
}

/* Danger variant — for trash/clear buttons */
.panel-action-button.is-danger:hover:not(:disabled) {
  border-color: color-mix(in oklab, var(--tone-rose) 60%, var(--panel-border));
  color: color-mix(in oklab, var(--tone-rose) 80%, var(--text-main));
}

/* Active/toggled variant — for audio button */
.panel-action-button.is-active {
  border-color: color-mix(in oklab, var(--tone-ocean) 56%, var(--panel-border));
  color: color-mix(in oklab, var(--tone-ocean) 80%, var(--text-main));
  background: color-mix(in oklab, var(--bg-main) 92%, var(--tone-ocean));
}
```

---

## Phase 2: Update Each Popover's Buttons

### 2a. Study Overview (`OverviewView.tsx`)
- Close (X): **keep `.panel-close-button`** (already correct, just switch from `.topbar-settings-button`)
- Refresh: change **`.topbar-settings-button` → `.panel-action-button`**
- Keep `className="inline-button-icon"` on the icon

### 2b. Dictionary (`DictionaryPopup.tsx`)
- Close (X): **keep `.panel-close-button`**, add wrapper with `justify-self: end`, add `size={16}` to icon
- Search button: change **`.dictionary-search-button` → `.panel-action-button`** with `style={{ width: 'auto', padding: '11px 16px', minHeight: 44, fontWeight: 700 }}` for text content
- Voice button: change **`.dictionary-icon-action dictionary-voice-button` → `.panel-action-button`**
- Copy button: change **`.dictionary-icon-action dictionary-copy-trigger` → `.panel-action-button`** (with `is-active` class when menu open)

### 2c. Tutor Chat (`TutorChatPanel.tsx`)
- Close (X): already `.panel-close-button` ✓
- Audio toggle: change **`.assistant-chat-audio-toggle` → `.panel-action-button`** with `is-active` class when audio enabled
- Clear/trash: change **`.assistant-chat-clear` → `.panel-action-button is-danger`**

### 2d. OCR Workbench (`OcrWorkbench.tsx`)
- Close (X): already `.panel-close-button` ✓
- Clear/trash: change **`.assistant-chat-clear` → `.panel-action-button is-danger`**

### 2e. Settings (`App.tsx`)
- Close (X): already `.panel-close-button` ✓
- No action buttons needed

### 2f. Readiness Warning (`ReadinessWarningModal.tsx`)
- Close (X): already `.panel-close-button` with absolute positioning ✓
- "Go back": change **`.rwm-back-btn` → `.panel-action-button`** (it's `flex: 1` for full width — add via inline style)
- "Continue anyway": change **`.rwm-continue-btn btn-primary` → `.panel-action-button`** with accent styling via inline style or separate modifier

---

## Phase 3: Fix Dictionary Close Button Alignment

In `DictionaryPopup.tsx`, the close button is a direct child of the 3-column grid `.dictionary-header`. Add `justify-self: end` inline or wrap in a `<div>` like other panels.

---

## Phase 4: Clean Up Dead CSS

Remove from `App.css`:
- `.topbar-settings-button` + hover + active (replaced by `.panel-action-button`)
- `.assistant-chat-audio-toggle` + `.assistant-chat-clear` (shared block + individual states)
- `.dictionary-icon-action` + `.dictionary-voice-button` + `.dictionary-copy-trigger` blocks
- `.dictionary-search-button` / `.dictionary-text-button` block (merged into `.panel-action-button`)
- `.rwm-back-btn` + hover (replaced)
- `.rwm-continue-btn` (replaced)
- `.dictionary-voice-button` color override
- Remove `.btn-primary` `border-radius: 10px` from the `.rwm-continue-btn` usage (the `.btn-primary` class may be used elsewhere, so keep it but don't apply `border-radius`)
- The duplicate hover/active blocks that were previously flagged

Keep:
- `.panel-close-button` (still used)
- `.panel-action-button` (new, replaces everything above)

---

## Phase 5: Files Changed

| File | Changes |
|------|---------|
| `App.css` | Add `.panel-action-button` + variants, remove ~8 old button CSS blocks |
| `OverviewView.tsx` | Change `.topbar-settings-button` → `.panel-close-button` (close) + `.panel-action-button` (refresh) |
| `DictionaryPopup.tsx` | Change voice/copy/search buttons to `.panel-action-button`, fix close alignment + icon size |
| `TutorChatPanel.tsx` | Change audio/clear buttons to `.panel-action-button` + variants |
| `OcrWorkbench.tsx` | Change clear button to `.panel-action-button is-danger` |
| `ReadinessWarningModal.tsx` | Change back/continue to `.panel-action-button` with inline width styling |

## Validation

- `npm run build` must succeed
- Visual: all action buttons (36×36 icon, proportional text) share same background, border, shadow, hover behavior
- Danger buttons (trash) turn rose on hover
- Active buttons (audio) show ocean tint
- Dictionary close button right-aligned with 16px icon
