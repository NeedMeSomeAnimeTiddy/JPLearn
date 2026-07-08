# SetupWizard Decomposition Plan

**File:** `src/components/SetupWizard.tsx` — 1,701 lines → target ~950 lines
**Approach:** Extract types, utils, styles, and sub-components into `src/components/setup/`

---

## Step 1: Create directory + types.ts

Move lines 7-136 (15 types/interfaces):
- `ModelOption`, `SystemInfo`, `SpeechModelOption`, `OcrModelOption`, `TranslationModelOption`, `TranslationProfileOption`, `VoiceModelOption`, `ProgressEvent`, `Props`, `CompactDropdownOption`
- `AppRegionStyle`, `ModelTier`, `SpeechTier`, `TranslationProfileTier`, `LlamaBackend`, `VoiceTier`, `SetupMode`, `Page`
- `LLAMA_BACKEND_OPTIONS` constant

Create `src/components/setup/types.ts` with all exported types + constant.
Remove from SetupWizard.tsx, add import.

## Step 2: Create utils.ts

Move lines 145-380 (6 helper functions):
- `formatEta()` (147-152)
- `formatSize()` (154-158)
- `formatDurationMinutes()` (159-166)
- `parseProgressMethod()` (168-174)
- `getModelHardwareFit()` (176-324)
- `getSpeechHardwareFit()` (326-380)

Create `src/components/setup/utils.ts`. Remove from SetupWizard.tsx, add import.
Note: `getModelHardwareFit` returns `{ badge, detail, isOk }` — define return type in types.

## Step 3: Create styles.ts

Move lines 1612-1700 (all CSS + CVA):
- `overlayStyle`, `cardStyle`, `dragBarStyle`, `dragBarTitleStyle`, `cardViewportStyle`, `stepDotsRowStyle`, `cardBodyStyle`
- `button` CVA config
- `btnClass()` function

Create `src/components/setup/styles.ts`. Remove from SetupWizard.tsx, add import.

## Step 4: Extract sub-components

Create 7 files in `src/components/setup/components/`:

| File | Source lines | Component |
|------|-------------|-----------|
| PageLayout.tsx | 1336-1385 | `PageLayout` |
| CheckboxOption.tsx | 1387-1395 | `CheckboxOption` |
| InfoRow.tsx | 1396-1404 | `InfoRow` |
| SummaryRow.tsx | 1405-1413 | `SummaryRow` |
| CompactDropdown.tsx | 1414-1568 | `CompactDropdown` |
| DropdownBadge.tsx | 1569-1592 | `DropdownBadge` |
| StepDots.tsx | 1593-1610 | `StepDots` |

Each component file imports types from `../types` and any utils needed.

## Step 5: Verify

1. `npm run build` — must pass
2. `npm run lint` — must pass
3. `npm run test:ui` — all tests pass
4. Commit

## Notes

- Don't change any logic — pure code extraction
- Keep all imports working (lucide-react, cva/clsx, react)
- The main SetupWizard component keeps its 25 state vars + IPC logic + JSX rendering
- No page decomposition — pages stay inline
- CompactDropdown is the largest sub-component (~155 lines) — it can standalone
