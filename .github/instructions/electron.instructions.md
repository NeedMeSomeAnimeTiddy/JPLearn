---
description: Electron frontend rules
applyTo: "electron-frontend/**/*"
---

# Electron Frontend Rules

## Architecture & Separation

- **Responsibility**: UI rendering, interaction flow, and IPC client wiring only.
- Keep business logic in domain/data Python layers; do not reimplement SRS logic in frontend.
- Use typed IPC contracts and avoid ad-hoc channel strings.
- Keep preload surface minimal and follow least-privilege principles.
- Do not access SQLite or Python persistence files directly from frontend code.
- Controller logic delegates to services — no business logic inside IPC event listeners.

## React 19.2 Patterns (non-negotiable)

- Always use functional components with hooks. Class components are legacy.
- **No `import React`** — the new JSX transform handles it.
- **Ref as Prop**: pass `ref` directly as a prop — no `forwardRef` needed (React 19).
- **Context without Provider**: render `<MyContext>` directly instead of `<MyContext.Provider>` (React 19).
- **`use()` hook**: for promise handling and async data fetching with Suspense boundaries.
- **`useActionState`**: for managing form action state and submissions.
- **`useOptimistic`**: for optimistic UI updates during async operations.
- **`useFormStatus`**: for pending/loading states on form submissions.
- **`startTransition`**: for non-urgent updates to keep the UI responsive.
- **`useDeferredValue`**: for deferring expensive re-renders.
- **Error Boundaries**: wrap component trees that may throw; provide fallback UI with recovery.
- **`useEffectEvent()`**: extract non-reactive logic from effects when needed.
- Avoid mixing async/await with `.then()`. No callback mixing.

## Component & Styling Standards

- **Design tokens**: Use `@radix-ui/colors` as the color foundation. Never hardcode raw hex values — derive from the token scale.
- **Component variants**: Use `class-variance-authority` + `clsx` for all component style variants. No inline style objects.
- **Icons**: Use `lucide-react` exclusively. No raw SVGs or emoji-as-icons.
- **Animations**: Use `motion` (framer-motion fork) for enter/exit/layout animations. CSS transitions for micro-interactions only.
- **Spacing rhythm**: Follow a 4px grid (4, 8, 12, 16, 24, 32, 48). No arbitrary pixel values.
- **Typography**: Establish a clear hierarchy — heading, subheading, body, caption. Use relative units (rem).
- **Responsive**: Design mobile-first. Use CSS grid/flexbox; avoid fixed pixel widths for containers.
- **Component composition**: Prefer composition over configuration. Split large components into focused sub-components.
- **Loading states**: Every async component must have a loading skeleton or spinner. No blank screens.
- **Empty states**: Every list/collection must have a designed empty state with helpful messaging.
- **Error states**: Every data-fetching component must handle errors with user-facing messages and retry capability.
- **Focus rings**: Every interactive element must show a visible focus ring (use Radix's built-in focus handling).

## Accessibility (WCAG 2.1 AA)

- Use semantic HTML: `<button>`, `<nav>`, `<main>`, `<section>`, `<dialog>`, etc.
- All interactive elements must be keyboard accessible (Tab, Enter, Escape).
- ARIA labels on icon-only buttons and non-text controls.
- Color contrast must meet AA minimum (4.5:1 for text, 3:1 for large text).
- Test accessibility with `npm run test:a11y` (vitest + axe-core).
- Radix UI primitives handle most ARIA — do not override unless fixing a specific issue.

## Performance

- Code-split with `React.lazy()` and dynamic imports at route/view boundaries.
- Use `useMemo`/`useCallback` sparingly — React Compiler handles memoization in many cases.
- Use `motion`'s `layoutId` for shared layout animations instead of manual position calculation.
- Virtual scrolling for long lists (embla-carousel for carousels).
- Debounce high-frequency renderer → main IPC events.
- Avoid synchronous IPC (`ipcRenderer.sendSync`) — always use async.
- Images: lazy load, use WebP format, provide dimensions to prevent layout shift.

## Testing

- Component tests with `@testing-library/react` + `vitest`.
- Accessibility tests with `axe-core`.
- Test user interactions, not implementation details.
- Every form needs tests for validation errors, submission loading, and success states.
- Every async component needs tests for loading, error, and data states.

## Validation

- `npm run lint` (oxlint) — must pass with zero warnings.
- `npm run build` (tsc + vite build) — must succeed.
- `npm run test:ui` (vitest) — must pass.
- `npm run test:a11y` — must pass for new UI components.

## Forbidden

- Inline styles (use CVA + CSS modules).
- Raw DOM manipulation (use React refs and state).
- Direct electron-store or file system access in renderer (use IPC).
- Hardcoded strings for copy — use constants or a translations map.
- Commented-out code in commits.
