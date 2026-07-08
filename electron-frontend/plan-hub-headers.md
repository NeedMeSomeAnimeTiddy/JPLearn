# Plan: Hub-Stlye Header Bars for Popup Menus

**Goal:** Make popup panel headers look like the hub topbar — noise texture, chromatic aberration on titles, and decorative accent stripe.

## Hub Topbar Signature Elements

| Element | CSS | What It Does |
|---------|-----|-------------|
| `::before` | SVG `feTurbulence` at 4% opacity | Subtle grain texture on header surface |
| `.hub-topbar-title` | `text-shadow: 1px 0 1px var(--tone-rose)..., -1px 0 1px var(--tone-teal)..., 0 0 20px var(--accent-soft)..., 0 2px 4px rgba(0,0,0,0.6)` | Chromatic aberration + glow on title text |
| `.hub-topbar-stripe` | 60×2px `linear-gradient` line with accent colors | Decorative bar under the title |

## What We Already Have

- ✅ Dark background
- ✅ Monospace subtitles (`.cassette-panel-header-subtitle`)
- ✅ Glitch corners (via `crt-scanlines::before`)
- ✅ CRT vignette (via `::after` on most panels)
- ✅ VHS tracking line (`crt-vhs-line`)
- ✅ CRT scanlines (via `crt-scanlines::before`)

## What's Missing — 3 Changes

### Step 1: Noise Texture on Header Background

Add `::before` to `.cassette-panel-header` with the same SVG `feTurbulence` noise as `.hub-topbar::before`.

```css
.cassette-panel-header::before {
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

**Note:** `.cassette-panel-header` currently uses `position: relative; z-index: 2`. The `::before` needs to sit above the background but below text content.

**Affects:** All panels using `.cassette-panel-header` — Overview, Settings, and any others.

**Also apply to:** `.assistant-chat-header` (Tutor Chat / OCR Workbench) which doesn't use `.cassette-panel-header`.

### Step 2: Chromatic Aberration on Header Titles

Apply the hub title's `text-shadow` to `.cassette-panel-header-title`:

```css
.cassette-panel-header-title {
  font-family: var(--display-font);
  font-size: clamp(1rem, 2vw, 1.2rem);
  font-weight: 600;
  color: var(--text-main);
  letter-spacing: 0.04em;
  margin: 0;
  /* Chromatic aberration — same as .hub-topbar-title */
  text-shadow:
    1px 0 1px color-mix(in oklab, var(--tone-rose) 30%, transparent),
    -1px 0 1px color-mix(in oklab, var(--tone-teal) 30%, transparent),
    0 0 20px color-mix(in oklab, var(--accent-soft) 20%, transparent),
    0 2px 4px rgba(0, 0, 0, 0.6);
}
```

**Also apply to:** `.settings-modal-title` (settings panel uses a different title class) and `.assistant-chat-title` (tutor chat header title).

### Step 3: Decorative Accent Stripe

Add a subtle horizontal line under the title text, styled like `.hub-topbar-stripe`:

```css
.cassette-panel-header-stripe {
  display: block;
  width: 48px;
  height: 1px;
  margin-top: 2px;
  background: linear-gradient(
    90deg,
    transparent,
    var(--accent-soft) 30%,
    var(--accent) 70%,
    transparent
  );
  opacity: 0.6;
}
```

This stripe goes between the title and subtitle in the JSX of panels that use the cassette header. Each panel's JSX would need a `<span className="cassette-panel-header-stripe" />` added.

**Affected JSX files:**
- `OverviewView.tsx` — add stripe after title
- `App.tsx` — settings header needs stripe

**Alternatively:** Add the stripe via CSS `::after` on the title element, avoiding JSX changes. But `.cassette-panel-header-title` already has its text-shadow (no pseudo-elements used), so `::after` is available.

```css
.cassette-panel-header-title::after {
  content: '';
  display: block;
  width: 48px;
  height: 1px;
  margin-top: 4px;
  background: linear-gradient(90deg, transparent, var(--accent-soft) 30%, var(--accent) 70%, transparent);
  opacity: 0.6;
}
```

CSS-only approach is preferred — no JSX changes.

## Files Touched

| File | Changes |
|------|---------|
| `App.css` | Add `::before` noise to `.cassette-panel-header`; add chromatic aberration to `.cassette-panel-header-title`; add `::after` stripe to `.cassette-panel-header-title` |
| `App.css` | Add noise `::before` to `.assistant-chat-header` |
| `App.css` | Add chromatic aberration to `.settings-modal-title` and `.assistant-chat-title` |

## Potential Conflicts

- `.cassette-panel-header` already uses `::before` for... nothing currently (it was removed when we cleaned up the ocean tint in R2). So `::before` is free.
- `.cassette-panel-header-title` doesn't use any pseudo-elements, so `::after` for the stripe is safe.
- The noise texture at 4% opacity is extremely subtle — it adds surface grain without being visible as a pattern.

## Validation

- `npm run build` + `npm run lint`
- Visual check: headers should have subtle grain texture, titles should have slight color fringe
