# Plan: Hub-Style Headers — Remaining Popup Menus

**Status:** Planning. **Goal:** Apply the hub-topbar header style (centered 3-column grid, noise texture, chromatic aberration title, catalog line, stripe) to all remaining popup menus.

## Already Done
- ✅ Study Overview header
- ✅ Settings header

## Remaining Popups

| Popup | Current Header Style | Action |
|-------|---------------------|--------|
| **Dictionary Popup** | Left-aligned flexbox with kicker + title + description + close | Convert to 3-column grid hub-style |
| **Tutor Chat Panel** | Flexbox with SENSEI label + subtitle + 3 action buttons | Convert to 3-column grid — title "SENSEI" centered, catalog line, buttons right-aligned |
| **OCR Workbench** | Same as Tutor Chat (shared CSS) — avatar + title + subtitle + 2 buttons | Same treatment, title "OCR Translator" or "OCR" centered |
| **Readiness Warning Modal** | No header bar — centered title + icon | Skip — no traditional titlebar to convert |

---

## Phase D1: Dictionary Popup Header

**Files:** `DictionaryPopup.tsx` (JSX), `App.css` (CSS)

### CSS Changes (App.css)

Replace `.dictionary-header` with hub-style grid layout:

```css
.dictionary-header {
  position: sticky;
  top: 0;
  z-index: 10;
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  align-items: center;
  gap: 16px;
  padding: 14px 24px 10px;
  background: var(--bg-main);
  border-bottom: 1px solid var(--panel-border);
  box-shadow: 0 2px 0 rgba(0, 0, 0, 0.04);
  overflow: hidden;
}

/* Noise texture */
.dictionary-header::before {
  content: '';
  position: absolute;
  inset: 0;
  opacity: 0.04;
  background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");
  background-size: 200px 200px;
  pointer-events: none;
  z-index: 1;
}
```

Repurpose existing CSS to match hub style:
- `.dictionary-kicker` → convert to use catalog style (or just use `.cassette-panel-header-catalog`)
- `.dictionary-header h2` → use `.cassette-panel-header-title` class directly (gets chromatic aberration + stripe)
- `.dictionary-close-button` → right-align via `justify-self: end`

Cleanup:
- Remove old `.dictionary-header-copy` (no longer needed)
- Remove old description `<p>` styling from `.dictionary-header p`

### JSX Changes (DictionaryPopup.tsx)

**Before:**
```tsx
<header className="dictionary-header">
  <div className="dictionary-header-copy">
    <span className="dictionary-kicker">
      <Search className="dictionary-kicker-icon" strokeWidth={2.2} aria-hidden="true" />
      Quick lookup
    </span>
    <h2>Dictionary</h2>
    <p>Search Japanese text, romaji, or English meanings from the offline dictionary or the loaded cards.</p>
  </div>
  <button type="button" className="dictionary-close-button" onClick={onClose} ...><X /></button>
</header>
```

**After:**
```tsx
<header className="dictionary-header">
  <div />
  <div className="cassette-panel-header-center">
    <span className="cassette-panel-header-catalog">QUICK LOOKUP</span>
    <h2 className="cassette-panel-header-title">Dictionary</h2>
  </div>
  <button type="button" className="dictionary-close-button" onClick={onClose} ...><X /></button>
</header>
```

Note: The description paragraph is removed — doesn't fit hub header format. The Search icon in the kicker is removed (catalog line is text-only). Close button stays.

---

## Phase D2: Tutor Chat Panel Header

**Files:** `TutorChatPanel.tsx` (JSX), `App.css` (CSS)

### Design Decision

The hub pattern is: catalog (tiny monospace) ABOVE title (large display-font with chromatic aberration). For the chat:

- **Catalog**: "STUDY COACH v4.2" — replaces the current SENSEI v4.2 monospace label, moves to catalog position
- **Title**: "SENSEI" — large display-font with chromatic aberration + stripe
- **Right column**: audio toggle + clear + close buttons (grouped)

The subtitle "ONLINE · HERE TO HELP" / "TYPING…" could go as a second catalog line using `.hub-topbar-catalog--sub` style, or be replaced by catalog-style status.

### CSS Changes (App.css)

Replace `.assistant-chat-header` with hub-style grid layout:

```css
.assistant-chat-header {
  position: relative;
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  align-items: center;
  gap: 16px;
  padding: 14px 24px 10px;
  background: var(--bg-main);
  border-bottom: 1px solid var(--panel-border);
  box-shadow: 0 2px 0 rgba(0, 0, 0, 0.04);
  overflow: hidden;
}

/* Keep existing noise ::before — already added */
```

Add right-alignment for action buttons:
```css
.assistant-chat-header-actions {
  justify-self: end;
  /* keep existing flex + gap */
}
```

Cleanup:
- `.assistant-chat-identity` — remove or simplify (no longer needed with centered layout)
- `.assistant-chat-terminal-label` — remove (replaced by catalog + title)
- Current `.assistant-chat-title` — already unused, can be cleaned up

### JSX Changes (TutorChatPanel.tsx)

**Before:**
```tsx
<header className="assistant-chat-header">
  <div className="assistant-chat-identity">
    <span className="assistant-chat-terminal-label">SENSEI v4.2</span>
    <span className="assistant-chat-subtitle">
      {assistantChatLoading ? 'TYPING…' : 'ONLINE · HERE TO HELP'}
    </span>
  </div>
  <div className="assistant-chat-header-actions">
    ...audio/clear/close buttons...
  </div>
</header>
```

**After:**
```tsx
<header className="assistant-chat-header">
  <div />
  <div className="cassette-panel-header-center">
    <span className="cassette-panel-header-catalog">
      {assistantChatLoading ? 'TYPING…' : 'STUDY COACH v4.2'}
    </span>
    <h2 className="cassette-panel-header-title">SENSEI</h2>
  </div>
  <div className="assistant-chat-header-actions">
    ...audio/clear/close buttons...
  </div>
</header>
```

**Tradeoff:** The catalog line shows either the version label or the typing status. When loading, "TYPING…" is more useful. When idle, "STUDY COACH v4.2" gives context.

---

## Phase D3: OCR Workbench Header

**Files:** `OcrWorkbench.tsx` (JSX), `App.css` (CSS — shares with Tutor Chat)

Same treatment as Tutor Chat since they share `.assistant-chat-header` CSS.

### JSX Changes (OcrWorkbench.tsx)

**Before:**
```tsx
<header className="assistant-chat-header">
  <div className="assistant-chat-identity">
    <span className="assistant-chat-avatar" ...><ImagePlus ... /><span className="assistant-chat-presence" /></span>
    <span className="assistant-chat-identity-text">
      <span className="assistant-chat-title">OCR Translator</span>
      <span className="assistant-chat-subtitle">...</span>
    </span>
  </div>
  <div className="assistant-chat-header-actions">
    ...clear/close buttons...
  </div>
</header>
```

**After:**
```tsx
<header className="assistant-chat-header">
  <div />
  <div className="cassette-panel-header-center">
    <span className="cassette-panel-header-catalog">IMAGE TRANSLATOR</span>
    <h2 className="cassette-panel-header-title">OCR</h2>
  </div>
  <div className="assistant-chat-header-actions">
    ...clear/close buttons...
  </div>
</header>
```

Remove the avatar circle — replaced by centered catalog + title.

---

## Phase D4: Cleanup Unused CSS

After all conversions, these CSS classes may become dead code:
- `.dictionary-header-copy` — no longer used
- `.dictionary-header p` (description text) — unused (description removed from JSX)
- `.assistant-chat-identity` — replaced by centered column
- `.assistant-chat-terminal-label` — replaced by catalog + title
- `.assistant-chat-title` — already unused (replaced earlier)
- `.assistant-chat-avatar` — removed from OCR (was already removed from Tutor Chat)
- `.assistant-chat-presence` — removed
- `.assistant-chat-identity-text` — removed from OCR

Can be cleaned up in this phase or left as harmless dead CSS.

---

## Files Changed

| File | What Changes |
|------|-------------|
| `App.css` | Rewrite `.dictionary-header` to grid layout + noise `::before`; rewrite `.assistant-chat-header` to grid layout; add `justify-self: end` to `.assistant-chat-header-actions`; cleanup dead CSS |
| `DictionaryPopup.tsx` | Restructure header JSX to centered 3-column layout |
| `TutorChatPanel.tsx` | Restructure header JSX to centered 3-column layout |
| `OcrWorkbench.tsx` | Restructure header JSX to centered 3-column layout |

No changes to:
- `ReadinessWarningModal.tsx` — no traditional titlebar
- `App.tsx` — settings already done

## Validation

- `npm run build` — must succeed
- `npm run lint` — 0 errors (18 pre-existing react-hooks warnings unchanged)

## Design Tradeoffs

1. **Dictionary description removed** — the old header had a long explanatory paragraph under the title. This doesn't fit the hub format. If help text is needed, it could move into the search bar area or a tooltip.

2. **Search icon removed from kicker** — the hub catalog line is text-only (no icons). The Search icon was decorative anyway.

3. **Chat status in catalog line** — when loading, the catalog shows "TYPING…" instead of "STUDY COACH v4.2". This prioritizes useful state info over branding.

4. **OCR workbench avatar removed** — the avatar circle was the only visual element distinguishing the OCR header from the chat header. Now both use the same centered catalog+title pattern, distinguished by text content.
