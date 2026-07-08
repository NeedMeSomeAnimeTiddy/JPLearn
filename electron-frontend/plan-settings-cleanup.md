# Plan: Settings Panel — Square & Lighten Remaining Elements

**Status:** Planning. **Findings:** 25+ settings UI elements still have rounded corners (>2px) and/or dark backgrounds.

## Elements Needing Fix — By Category

### A. Buttons (border-radius: 10px → 0, dark → light bg)

| Class | Current Style | Fix |
|-------|--------------|-----|
| `.settings-inline-button` | 10px, `linear-gradient(button-bg)` | 0, `color-mix(panel-bg 84%, white)` |
| `.settings-inline-icon-button` | 10px, dark gradient | 0, light bg |
| `.settings-card-icon-button` | 10px, dark gradient | 0, light bg |
| `.settings-option-button` | 10px, dark gradient | 0, light bg |
| `.settings-reset-button` | 10px, dark gradient | 0, light bg |
| `.settings-mode-icon-button` | 10px, dark gradient | 0, light bg |
| `.settings-voice-step-button` | 10px, `panel-bg-alt 70%` | 2px, light bg |
| `.settings-theme-chip` | 10px, dark gradient | 2px, keep colored border |
| `.jlpt-action-btn` | Already fixed — light bg, 0 radius | — |

### B. Cards / Panels (border-radius: 12px → 2px)

| Class | Current Style | Fix |
|-------|--------------|-----|
| `.settings-icon-entry` | 12px, dark bg | 2px, `panel-bg-alt 60%` |
| `.settings-icon-tile` | 12px, dark gradient | 2px, lighter gradient |
| `.settings-theme-card` | 12px, `panel-bg-alt 58%` | 2px, lighter bg |
| `.settings-collapsible-card` | `var(--radius-control)`, dark | 2px, lighter bg |
| `.settings-theme-section-editor` | 12px, dark | 2px, lighter |
| `.settings-background-preview` | 10px, transparent | 2px |

### C. Inputs / Fields (border-radius: 10px → 2px)

| Class | Current Style | Fix |
|-------|--------------|-----|
| `.settings-text-input`, `.settings-select` | 10px, dark | 2px, light bg |
| `.settings-theme-select` | 10px, dark gradient | 2px, light bg |
| `.settings-theme-variable-field` | 10px, dark | 2px, light |

### D. Chips / Pills (border-radius: 999px/10px → 2px)

| Class | Current Style | Fix |
|-------|--------------|-----|
| `.settings-state-pill` | 999px | 2px |
| `.settings-theme-chip-core` | 999px | 2px |

### E. Progress Bar (border-radius: 3px → 2px)

| Class | Current Style | Fix |
|-------|--------------|-----|
| `.settings-progress-track` | 3px | 2px |
| `.settings-progress-fill` | 3px | 2px |

### F. Toggle Switch — SPECIAL CASE

| Class | Current Style | Decision |
|-------|--------------|----------|
| `.settings-toggle` | 10px, transparent bg | Square to 2px, keep transparent |
| `.toggle-indicator` | 999px pill, dark bg | **KEEP ROUND** — toggle is a physical switch control, round is appropriate |
| `.toggle-indicator::after` | 50% knob | **KEEP ROUND** — switch knob is circular by design |

### G. Inline Styles in JSX (needs file edits)

| Location | File | Line | Fix |
|----------|------|------|-----|
| Cursor color picker | `CursorSettingsTab.tsx` | 55 | `borderRadius: '2px'` |
| Speech model cards (×2) | `VoiceSettingsTab.tsx` | 141, 347 | `borderRadius: '2px'`, lighter bg |
| Tutor model cards | `App.tsx` | 5945 | `borderRadius: '2px'`, lighter bg |
| OCR translation cards | `App.tsx` | 6112 | `borderRadius: '2px'`, lighter bg |

---

## Background Lightening Strategy

All dark button backgrounds should use the same light blend already applied to `.settings-tab-button`:
```css
background: color-mix(in oklab, var(--panel-bg) 84%, white);
```

For cards/panels, use a slightly more transparent variant:
```css
background: color-mix(in oklab, var(--panel-bg-alt) 60%, transparent);
```

For accent-tinted buttons (is-active states), keep the accent color but lighten the base:
```css
/* OLD */ background: color-mix(in oklab, var(--accent) 16%, var(--chip-bg));
/* NEW */ background: color-mix(in oklab, var(--panel-bg) 74%, var(--accent));
```

---

## Execution Order

1. **CSS batch**: Update all App.css classes (A-F) in one pass
2. **JSX batch**: Update inline styles in CursorSettingsTab.tsx, VoiceSettingsTab.tsx, App.tsx (model cards)
3. **Validate**: `npm run build` + `npm run lint`

## Files Touched

| File | Changes |
|------|---------|
| `App.css` | ~20 CSS blocks modified |
| `App.tsx` | 2 inline style blocks (Tutor models, OCR cards) |
| `VoiceSettingsTab.tsx` | 2 inline style blocks (speech models, voice models) |
| `CursorSettingsTab.tsx` | 1 inline style block (color picker) |

## Risk

Low — pure visual styling changes. Toggle switch kept round (functional control).
