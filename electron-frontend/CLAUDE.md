# CLAUDE.md — electron-frontend

Frontend-specific conventions. Root `CLAUDE.md` and `.github/instructions/electron.instructions.md`
still apply — this file adds nothing that contradicts them, just keeps the common rules loaded
only when you're actually working here.

- React 19.2: no `import React`, no `forwardRef` (pass `ref` as a prop). CVA + clsx for variants,
  `@radix-ui/colors` tokens (no raw hex), `lucide-react` icons, `motion` for animation.
- **Never add a new stateful system inline in `App.tsx`.** Extract into `src/features/<name>/`
  following: `types.ts` → `constants.ts` → `utils.ts` → `use<Name>.ts` (hook) → `components/` →
  `index.ts` (barrel). `App.tsx`'s job is orchestration: import feature hooks, wire JSX, own
  top-level routing/state. (In practice `App.tsx` is ~4.9k lines and doesn't fully live up to
  this yet — don't compound it; new work still follows the rule.)
- Static data constants over ~50 lines go in `src/lib/` (e.g. `contentTemplates.ts`), not inline.
- **Check `src/types.ts` and `src/constants.tsx` before declaring a type or constant in a
  component.** Both already hold most shared app types/constants; #69 found 52 types and 25
  constants that App.tsx had redeclared locally, two of which had silently drifted from the
  shared copy.
- Pure helpers belong in `src/lib/` where they can be unit-tested — not module-private in a
  component file.
