# Tutor Toast Redesign — Option A: Icon-Forward Glass Toast

## Goal

Reimagine the tutor toasts to match the UI design language: add lucide icons, improve text hierarchy, add dismiss control, refine glass treatment, and align spacing/radius/shadow to existing patterns.

## Scope

Two files only:
- `electron-frontend/src/App.css` — toast CSS (lines 1537–1679, 1815–1835, 1843–1845)
- `electron-frontend/src/App.tsx` — toast JSX (lines 10801–10828) + icon import (line 23)

No changes to toast logic, state management, types, or backend.

---

## Changes

### 1. Add icon imports (App.tsx, line 23)

Add `Info`, `Sparkles`, `Trophy` to the lucide-react import. `AlertTriangle` and `X` are already imported.

```diff
- import { Activity, AlertTriangle, ... } from 'lucide-react'
+ import { Activity, AlertTriangle, ..., Info, Sparkles, Trophy } from 'lucide-react'
```

### 2. Add priority → icon mapping (App.tsx, near toast constants ~line 328)

```ts
const ASSISTANT_TOAST_ICONS: Record<AssistantToast['priority'], LucideIcon> = {
  info: Info,
  coaching: Sparkles,
  critical: AlertTriangle,
  celebration: Trophy,
}
```

### 3. Update toast JSX (App.tsx, lines 10801–10828)

Replace the current rendering with an icon-forward layout:

```tsx
<aside className="assistant-toast-anchor" aria-live="polite" aria-label="Tutor updates">
  {settings.assistantToastLimit > 0 && activeAssistantToast ? (
    <div className="assistant-toast-stack" role="status" aria-label="Tutor updates">
      <article key={activeAssistantToast.id} className={`assistant-toast assistant-toast-${activeAssistantToast.priority}`}>
        <div className="assistant-toast-header">
          <span className="assistant-toast-icon" aria-hidden="true">
            {(() => {
              const Icon = ASSISTANT_TOAST_ICONS[activeAssistantToast.priority]
              return <Icon strokeWidth={2.2} />
            })()}
          </span>
          <h3>{activeAssistantToast.title}</h3>
          <button
            type="button"
            className="assistant-toast-dismiss"
            onClick={() => setAssistantToasts((prev) => prev.filter((t) => t.id !== activeAssistantToast.id))}
            aria-label="Dismiss"
          >
            <X strokeWidth={2.2} />
          </button>
        </div>
        <p className="assistant-toast-body">{activeAssistantToast.body}</p>
        {activeAssistantToast.targetMode ? (
          <div className="assistant-toast-controls">
            <button
              type="button"
              className="assistant-toast-action"
              onClick={() => launchAssistantToastAction(activeAssistantToast)}
            >
              {activeAssistantToast.actionLabel}
            </button>
          </div>
        ) : null}
        <div className="assistant-toast-advance-track" aria-hidden="true">
          <span
            key={activeAssistantToast.id}
            className="assistant-toast-advance-fill"
            style={{ animationDuration: `${ASSISTANT_TOAST_TTL_MS}ms` }}
          />
        </div>
      </article>
    </div>
  ) : null}
</aside>
```

Key changes:
- New `.assistant-toast-header` flex row: icon + title + dismiss button
- Icon rendered from `ASSISTANT_TOAST_ICONS` map
- Dismiss button with `<X>` icon (calls `setAssistantToasts` to remove)
- `.assistant-toast-body` class on `<p>` for targeted styling
- Action button + countdown bar unchanged

### 4. Rewrite toast CSS (App.css, lines 1537–1679)

Replace the entire toast CSS block:

```css
/* ── Tutor toast (icon-forward glass) ─────────────────────────────────────── */

.assistant-toast-anchor {
  position: fixed;
  bottom: 18px;
  left: 18px;
  display: flex;
  pointer-events: none;
  z-index: 920;
}

.assistant-toast-stack {
  width: min(360px, calc(100vw - 36px));
  display: grid;
  gap: 8px;
  pointer-events: none;
}

.assistant-toast {
  position: relative;
  pointer-events: auto;
  overflow: hidden;
  border-radius: var(--radius-panel);          /* 14px — aligned */
  border: 1px solid color-mix(in oklab, var(--tone-ocean) 28%, var(--panel-border));
  background:
    radial-gradient(circle at 12% 0%, color-mix(in oklab, var(--tone-streak) 24%, transparent), transparent 52%),
    radial-gradient(circle at 86% 100%, color-mix(in oklab, var(--tone-ocean) 26%, transparent), transparent 56%),
    color-mix(in oklab, var(--panel-bg-alt) 90%, white 10%);
  box-shadow:
    0 12px 28px -18px rgba(0, 0, 0, 0.7),     /* lighter than before */
    inset 0 1px 0 rgba(255, 255, 255, 0.18);
  backdrop-filter: blur(5px);
  padding: 12px 14px;                          /* 4px grid aligned */
  animation: assistantToastLifecycle 3800ms cubic-bezier(0.22, 1, 0.36, 1) both;
}

/* Header row: icon + title + dismiss */
.assistant-toast-header {
  display: flex;
  align-items: center;
  gap: 8px;
}

/* Priority icon badge */
.assistant-toast-icon {
  flex-shrink: 0;
  display: grid;
  place-items: center;
  width: 24px;
  height: 24px;
  border-radius: 8px;
  background: color-mix(in oklab, var(--tone-ocean) 18%, transparent);
  color: var(--tone-ocean);
}

.assistant-toast-coaching .assistant-toast-icon {
  background: color-mix(in oklab, var(--tone-skill) 18%, transparent);
  color: var(--tone-skill);
}

.assistant-toast-critical .assistant-toast-icon {
  background: color-mix(in oklab, var(--tone-danger) 18%, transparent);
  color: var(--tone-danger);
}

.assistant-toast-celebration .assistant-toast-icon {
  background: color-mix(in oklab, var(--tone-streak) 18%, transparent);
  color: var(--tone-streak);
}

.assistant-toast-icon svg {
  width: 14px;
  height: 14px;
}

/* Title */
.assistant-toast-header h3 {
  flex: 1;
  margin: 0;
  font-size: 0.82rem;
  font-weight: 600;
  color: var(--text-main);
  letter-spacing: 0.015em;
  line-height: 1.3;
}

/* Dismiss button */
.assistant-toast-dismiss {
  flex-shrink: 0;
  display: grid;
  place-items: center;
  width: 24px;
  height: 24px;
  border-radius: 6px;
  border: 1px solid transparent;
  background: transparent;
  color: var(--text-soft);
  cursor: pointer;
  transition: background 0.15s, color 0.15s;
}

.assistant-toast-dismiss:hover {
  background: color-mix(in oklab, var(--chip-bg) 70%, transparent);
  color: var(--text-main);
}

.assistant-toast-dismiss:focus-visible {
  outline: 2px solid var(--tone-ocean);
  outline-offset: 2px;
}

.assistant-toast-dismiss svg {
  width: 13px;
  height: 13px;
}

/* Body text */
.assistant-toast-body {
  margin: 6px 0 0;
  font-size: 0.74rem;
  line-height: 1.38;
  color: var(--text-soft);
  padding-left: 32px;                         /* aligns with title (24px icon + 8px gap) */
}

/* Controls row */
.assistant-toast-controls {
  margin-top: 9px;
  padding-left: 32px;
  display: flex;
  align-items: center;
  gap: 8px;
}

/* CTA action button — styled like resume-toast-action */
.assistant-toast-action {
  flex: 1;
  padding: 7px 14px;
  border-radius: 10px;
  border: 1px solid color-mix(in oklab, var(--tone-ocean) 36%, var(--panel-border));
  background: color-mix(in oklab, var(--tone-ocean) 14%, transparent);
  color: var(--text-main);
  font-family: var(--button-font);
  font-size: 0.76rem;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.15s, border-color 0.15s;
}

.assistant-toast-action:hover {
  background: color-mix(in oklab, var(--tone-ocean) 24%, transparent);
  border-color: color-mix(in oklab, var(--tone-ocean) 52%, var(--panel-border));
}

.assistant-toast-action:focus-visible {
  outline: 2px solid var(--tone-ocean);
  outline-offset: 2px;
}

/* Advance track — thinner, more subtle */
.assistant-toast-advance-track {
  margin-top: 9px;
  height: 4px;                                 /* was 8px */
  border-radius: 999px;
  overflow: hidden;
  background: color-mix(in oklab, var(--chip-bg) 60%, transparent);
}

.assistant-toast-advance-fill {
  display: block;
  height: 100%;
  width: 100%;
  transform-origin: left center;
  background: linear-gradient(90deg, var(--tone-amber), var(--tone-ocean));
  animation-name: feedbackAdvanceCountdown;
  animation-timing-function: linear;
  animation-fill-mode: forwards;
}

/* Priority border variants */
.assistant-toast-info {
  border-color: color-mix(in oklab, var(--tone-ocean) 45%, var(--panel-border));
}

.assistant-toast-coaching {
  border-color: color-mix(in oklab, var(--tone-skill) 46%, var(--panel-border));
}

.assistant-toast-critical {
  border-color: color-mix(in oklab, var(--tone-danger) 56%, var(--panel-border));
}

.assistant-toast-celebration {
  border-color: color-mix(in oklab, var(--tone-streak) 58%, var(--panel-border));
}
```

### 5. Update keyframes (App.css, lines 1815–1835)

Change entrance direction from top-slide to left-slide (matches bottom-left positioning):

```css
@keyframes assistantToastLifecycle {
  0% {
    opacity: 0;
    transform: translateX(-12px) scale(0.97);
  }

  10% {
    opacity: 1;
    transform: translateX(0) scale(1);
  }

  80% {
    opacity: 1;
    transform: translateX(0) scale(1);
  }

  100% {
    opacity: 0;
    transform: translateX(-8px) scale(0.98);
  }
}
```

### 6. Clean up dead CSS (App.css, lines 1495–1535, 1847–1849)

Remove the orphaned `.assistant-status-chip` block and its responsive override — it's never referenced in any TSX file.

---

## Summary of visual changes

| Element | Before | After |
|---------|--------|-------|
| **Icon** | None (tiny 7px `::after` dot) | 24×24px lucide icon in tone-colored badge |
| **Title** | Plain h3, 0.82rem | Bold h3, 0.82rem, font-weight: 600 |
| **Body** | Plain p, 0.75rem | `.assistant-toast-body`, 0.74rem, left-padded to align with title |
| **Dismiss** | None | 24×24px × button with hover/focus states |
| **Action button** | Pill (999px radius, 30px height) | Rounded rect (10px radius, matching resume-toast-action) |
| **Countdown bar** | 8px gradient | 4px gradient, more subtle |
| **Border-radius** | 16px | 14px (`--radius-panel`) |
| **Box-shadow** | `0 16px 30px -22px rgba(0,0,0,0.82)` | `0 12px 28px -18px rgba(0,0,0,0.7)` |
| **Entrance animation** | Slide from top (translateY) | Slide from left (translateX) |
| **Priority indicator** | Border color only | Border color + icon badge color |

## What stays the same

- Glassmorphism background (radial gradients + panel-bg-alt)
- `backdrop-filter: blur(5px)`
- Auto-dismiss TTL (3800ms)
- `assistantToastLifecycle` timing structure (enter/hold/exit percentages)
- All toast logic, state, types, polling, and tracking
- Priority → border-color mapping
- `aria-live="polite"` and `role="status"` accessibility
- Mobile responsive width override
- Advance track gradient (amber → ocean)

## Files touched

1. `electron-frontend/src/App.tsx` — import 3 icons, add icon map, rewrite JSX (~20 lines changed)
2. `electron-frontend/src/App.css` — rewrite toast CSS block (~140 lines), update keyframes (~10 lines), remove dead CSS (~45 lines)

## Verification

1. `npm run lint` — must pass with 0 warnings
2. `npm run build` — must succeed
3. `npm run test:ui` — must pass
4. Visual check: start Electron (`npm run start`), trigger a tutor toast (complete a round in minigame), verify:
   - Icon appears in colored badge
   - Title is bold, body is muted
   - Dismiss button works
   - Action button (if present) navigates correctly
   - Countdown bar is thin and subtle
   - Toast slides in from left, not top
   - Priority colors distinguish info/coaching/critical/celebration
