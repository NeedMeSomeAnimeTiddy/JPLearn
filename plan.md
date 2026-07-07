# Theme Engine Extraction — Execution Plan

**Goal**: Extract all theme engine code (~2,300 lines) from `App.tsx` into `src/features/theme/`, leaving App.tsx's `AppSettings` persistence model and test imports intact.

---

## File Structure (to create)

```
src/features/theme/
├── types.ts                  — ThemeKey, ThemeMode, ThemeScope, ThemeVariableKey, CustomTheme, ThemePalette, etc.
├── constants.ts              — THEME_OPTIONS, THEME_VARIABLE_KEYS, THEME_SECTION_DEFINITIONS, THEME_VARIABLE_DISPLAY, etc.
├── utils.ts                  — Pure helper functions (getThemeModeForTheme, mergeThemePalette, readThemePalette, isTheme*, normalize*, etc.)
├── useTheme.ts               — Custom hook: theme state accessors, callbacks, theme-application useEffect
└── components/
    ├── ThemeSettingsTab.tsx   — Root tab composes mode toggle + preset grid + custom sections
    ├── PresetThemeGrid.tsx    — 11 preset theme buttons filtered by mode
    ├── CustomThemePanel.tsx   — Create/export/copy/import + custom theme list
    └── CustomThemeEditor.tsx  — Name, base selection, 8 collapsible section editors
```

---

## Execution Order

### Step 1: `types.ts`
- Move type definitions (App.tsx lines ~154–253):
  - `ThemeKey`, `ThemeMode`, `ThemeScope`, `ThemeVariableKey`
  - `ThemeVariableOverrides`, `ThemePalette`, `CustomTheme`, `ThemeSection`, `CustomThemeExportPayload`
- **Note**: `AppSettings` stays in App.tsx (it mixes theme + non-theme fields)

### Step 2: `constants.ts`
- Move all theme constants (App.tsx lines ~1222–1391, ~1721–1776):
  - `THEME_OPTIONS`, `THEME_MODE_SECTIONS`, `DEFAULT_THEME_BY_MODE`, `THEME_MODE_ICON`
  - `THEME_SWATCH_ACCENT`, `THEME_KEY_SET`
  - `THEME_VARIABLE_KEYS`, `THEME_SECTION_DEFINITIONS`, `THEME_VARIABLE_SET`, `THEME_VARIABLE_DISPLAY`
- Adjacent but extracted: `FONT_SIZE_*`, `APP_FONT_OPTIONS`, `MOTION_STYLE_OPTIONS`, `BACKGROUND_*` (used by theme settings UI)

### Step 3: `utils.ts`
- Move all pure helper functions (App.tsx lines ~1586–1776, ~3338–3406):
  - `isThemeMode`, `isThemeScope`, `isThemeKey`, `isThemeVariableKey`
  - `getThemeModeForTheme`, `getThemeVariantForMode`, `getFallbackThemeForMode`
  - `createThemePalette`, `readThemePalette`, `normalizeThemeOverrides`, `normalizeCustomTheme`
  - `makeCustomThemeId`, `formatThemeVariableLabel`, `mergeThemePalette`
  - `isColorLikeValue`, `supportsColorPickerForKey`, `getColorInputValue`
  - `parseImportedCustomThemes`, `makeCustomThemeExportPayload`
- Also extract: `makeCustomThemeExportPayload` (line ~2479–2499 context)

### Step 4: `useTheme.ts`
- Extract all theme state management from App() body (App.tsx lines ~3778–3827, ~4558–5195):
  - **Inputs**: `settings: AppSettings`, `setSettings: Dispatch<SetStateAction<AppSettings>>`
  - **Outputs**:
    - `availableThemes`, `activeCustomTheme`, `effectiveTheme`, `activeBasePalette`, `customThemePreviewById`
    - `collapsedSections`, `customThemeActionMessage`, `customThemeImportInputRef`
    - All callbacks: `createCustomTheme`, `selectPresetTheme`, `selectCustomTheme`, `renameCustomTheme`, `deleteCustomTheme`, `duplicateCustomTheme`, `importCustomThemesPayload`, `exportCustomThemesToFile`, `copyCustomThemesToClipboard`, `openCustomThemeImportPicker`, `importCustomThemesFromClipboard`, `handleCustomThemeFileImport`, `updateCustomThemeBase`, `updateCustomThemeOverride`, `resetCustomThemeSection`, `toggleThemeSectionCollapsed`, `setThemeMode`
  - **Effect**: The theme-application useEffect (line ~5164) that sets `dataset.themeMode`, `dataset.theme`, applies CSS vars via `mergeThemePalette`
- **setStartupTheme**: Accept as optional callback parameter; the effect calls it when `effectiveTheme` changes

### Step 5: Component files
- Extract JSX from App.tsx (`activeSettingsTab === 'theme'` section, lines ~9300–9600):
  - `ThemeSettingsTab.tsx` — renders all theme content
  - `PresetThemeGrid.tsx` — 11 preset cards with visual accent dot + aria-label
  - `CustomThemePanel.tsx` — action buttons + theme list with select/rename/delete/duplicate
  - `CustomThemeEditor.tsx` — name input, base selection, 8 collapsible variable editors

### Step 6: Wire into App.tsx
- Remove extracted lines (~1,600 lines removed)
- Add imports: `export type * from './features/theme/types'` (if types are needed elsewhere)
- Add: `const theme = useTheme(settings, setSettings, setStartupTheme)`
- Replace theme settings JSX: `{activeSettingsTab === 'theme' && <ThemeSettingsTab {...theme} />}`
- Keep `AppSettings`, `defaultSettings()`, `loadSettings()`, persistence useEffect unchanged

### Step 7: Verify
- `npm run build` — TypeScript + Vite build
- `npm run lint` — oxlint
- `npm run test:ui` — vitest
- Check the three test files (`*.test.tsx`) still import `App` correctly

---

## Design Decisions

1. **Hook, not context** — Theme state stays in App.tsx's `useState<AppSettings>`. The hook receives `settings`/`setSettings` as parameters. This avoids changing the persistence model or introducing a new context boundary in the same refactor.

2. **CSS stays in App.css** — The extracted components reference the same classnames (`settings-theme-grid`, `settings-custom-theme-row`, etc.) from App.css. CSS Module extraction is a separate effort.

3. **`AppSettings` interface unchanged** — Theme fields remain on `AppSettings`. The hook focuses on read/write access to these fields, not on owning them.

4. **setStartupTheme** — Passed as a prop to `useTheme`. The hook's effect calls it when `effectiveTheme` changes (debounced on mount).

---

## Estimated Total Time: ~2.5 hours
| Step | Time |
|------|------|
| 1–3 (static extraction) | 40 min |
| 4 (useTheme) | 45 min |
| 5 (components) | 30 min |
| 6 (wiring) | 15 min |
| 7 (verify) | 20 min |

Delete this file after execution completes.
