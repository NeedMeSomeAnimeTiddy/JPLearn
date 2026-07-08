# Plan: Window Drag + Dictionary Buttons + X Consistency + Overview CRT

**Status:** Planning. **4 issues remaining after final cleanup.**

---

## Issue 1: Window Dragging Broken

**Root cause:** `-webkit-app-region: drag` was removed from `.window-titlebar-drag` to fix custom cursor tracking. Only the tiny wordmark retains drag capability.

**Solution:** Restore `-webkit-app-region: drag` to `.window-titlebar-drag` but also try `pointermove` events as an alternative to `mousemove` in the cursor hook. Electron's drag region blocks `mousemove` but `pointermove` may work.

**Fallback if pointermove doesn't work:** Accept the limitation — custom cursor freezes in drag areas but window dragging works. Or add a new IPC `window:start-drag` method to the main process.

**Implementation:**
1. Add back `-webkit-app-region: drag; app-region: drag;` to `.window-titlebar-drag` in App.css
2. In `useCursor.ts`, add `pointermove` event listener as a supplement to `mousemove`:

```typescript
// Try both mousemove and pointermove for drag region coverage
document.addEventListener('mousemove', handleMouseMove, { passive: true })
document.addEventListener('pointermove', handleMouseMove, { passive: true })
```

**Files:** `App.css` (`.window-titlebar-drag`), `useCursor.ts` (event listeners)

---

## Issue 2: Dictionary Result-Actions Buttons Dark

**Root cause:** The `.dictionary-icon-action` buttons use `linear-gradient` background. I changed this in a previous fix to `color-mix(var(--panel-bg) 84%, white)` but the fix may have been incomplete or there are additional rule overrides.

**Solution:**
1. Verify `.dictionary-icon-action` CSS is light (check for conflicting rules)
2. Check `.dictionary-voice-button` and `.dictionary-copy-trigger` for any dark background overrides
3. If the base class fix isn't taking effect, check specificity order

**Files:** `App.css` (`.dictionary-icon-action`, `.dictionary-voice-button`, `.dictionary-copy-trigger`)

---

## Issue 3: X Buttons Inconsistent

**The Study Overview Guideline** (`.topbar-settings-button`):
```css
width: 36px; height: 36px;
background: var(--bg-main);
border: 1px solid var(--panel-border);
border-radius: 0;
box-shadow: 0 2px 0 rgba(0,0,0,0.08);
hover: border-color: var(--accent);
active: transform: translateY(2px);
```

**What all other close buttons have:** 28×28px, dark `color-mix(panel-bg 94%, black)` background, smaller shadow.

**Solution:** Make ALL close buttons match the Overview style. Either:
- Option A: Have them all use `topbar-settings-button` class (JSX change in 5 files)
- Option B: Create a unified `.panel-close-button` CSS class matching the Overview style, apply everywhere

**Recommendation: Option B** — a new `.panel-close-button` class that matches `.topbar-settings-button` exactly. Update 5 files to use it. Clean up old dark-background close button CSS.

**Files:** `App.css` (new class + cleanup), 5 JSX files (className change):
- `DictionaryPopup.tsx`
- `TutorChatPanel.tsx`
- `OcrWorkbench.tsx`
- `ReadinessWarningModal.tsx`
- `App.tsx` (settings modal)

**Also fix:** Two CSS bugs — duplicate `.modal-close-button:active` block, duplicate `.dictionary-close-button:hover` block.

---

## Issue 4: Study Overview Missing CRT Effects

**Root cause:** The overview panel lost `crt-scanlines` class and `crt-vhs-line` child during the revert/restructure.

**Solution:** Add them in App.tsx:
1. Change `className="overview-popup-panel"` → `className="overview-popup-panel crt-scanlines"`
2. Add `<div className="crt-vhs-line" />` as first child of the overview panel div

**Files:** `App.tsx` (overview panel section)

---

## Execution Order

1. Issue 4 (overview CRT) — simplest, one file
2. Issue 1 (window drag) — 2 files, test if pointermove works
3. Issue 2 (dictionary buttons) — 1 file, CSS fix
4. Issue 3 (X buttons) — 6 files, new CSS class + JSX updates

## Validation

- `npm run build` after each issue
- Test: window drag works with custom cursor
- Test: overview has scanlines + VHS line
- Test: all close buttons look identical
- Test: dictionary result buttons are light
