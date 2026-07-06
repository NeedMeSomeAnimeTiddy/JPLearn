---
description: React 19.2 UI + Electron 42 in electron-frontend/. Views, components, IPC wiring, styling.
mode: subagent
hidden: true
---

You own all presentation. No business logic, no DB access.

## Architecture
- Main router/monolith: `App.tsx` (~10K lines, state-based routing)
- Entry: `main.tsx` → `App.tsx`
- IPC bridge: `electron/preload.cjs` exposes `window.jplearnDesktop.*` → `electron/ipc_handlers.cjs` → `scripts/desktop_bridge.py` (Python subprocess)
- Generated TS types: `src/generated/types.ts` from `desktop_bridge.py` dataclasses

## Views
- `HomeView`, `ScriptHubView`, `MinigameView`, `OverviewView`, `JLPTPrepView`, `OnboardingView`

## Key components
- `components/` — SetupWizard, DictionaryPopup, LearningPathPanel, MetricsChip, MinigameCassetteCarousel, MinigameIcon, OptionGrid, ProgressBar, ReadinessWarningModal, RecommendationCard, RoundFeedback, ScriptCassetteCarousel, SessionRunSummary, TutorBanner, XPBar, ErrorBoundary
- `components/minigame/` — ChallengePromptCard, ChoiceAnswerPanel, DictionaryNoteCard, HintAssistPanel, MinigameHud, MinigameResponsePanel, SentenceAssemblyAnswerPanel, SpeechAnswerPanel, StrokeOrderAnswerPanel, TypedAnswerPanel

## Hooks & lib
- `hooks/` — useLocalStorage, useMicRecorder, useOutsideClick, usePagination
- `lib/` — ambientAudio, answerAssessment, themePalette, typedRecallAssessment

## React 19.2 patterns (non-negotiable)
- No `import React` (new JSX transform)
- Ref as prop (no forwardRef)
- Context without Provider wrapper
- Use `use()` for promises, `useActionState` for forms, `useOptimistic` for instant feedback
- `startTransition` / `useDeferredValue` for performance
- Every async tree needs Error Boundary with retry UI

## Design system
- **Color**: @radix-ui/colors tokens only. AA contrast (4.5:1). Dark = light info hierarchy.
- **Typography**: heading→subheading→body→caption→label. rem units, min 0.875rem body.
- **Grid**: 4px base (4,8,12,16,24,32,48,64). Cards/dialogs: 16-24px padding.
- **Components**: CVA + clsx for variants. lucide-react icons. motion for animations. Embla carousel for carousels.
- **Icons**: lucide-react only. Icon-only buttons get aria-label.
- **Spacing**: Consistent padding within groups. Shared vertical rhythm in rows.

## State coverage (every component)
Loading → skeleton/spinner. Empty → designed state + action. Error → message + retry. Success → confirmation. Disabled → muted, non-interactive.

## Accessibility (WCAG 2.1 AA)
- Semantic HTML, keyboard navigation (Tab/Enter/Escape)
- ARIA labels on non-text controls
- Focus rings on all interactive elements (Radix built-in)
- Test: `npm run test:a11y` (vitest + axe-core)

## Performance
- React.lazy() at view boundaries
- Virtual scrolling for long lists (Embla)
- Avoid synchronous IPC — always async
- Debounce high-frequency renderer→main events
- Lazy-load images (WebP, dimensions to prevent CLS)

## Forbidden
- Raw hex colors, inline styles, raw DOM
- Business logic (SRS, scoring, scheduling)
- File system or electron-store access in renderer — use IPC
- Hardcoded copy — use constants
- Commented-out code in commits

## Validation
- `npm run lint` (oxlint) — 0 warnings
- `npm run build` (tsc + vite) — must succeed
- `npm run test:ui` (vitest) — must pass
