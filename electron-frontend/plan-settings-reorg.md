# Plan: Settings Reorganization — 3 Tabs + Slim Buttons

**Goal:** Reduce 9 settings tabs to 3 (Appearance / Assistant / System), slim down buttons, restore tab list background.

## Current State
- 9 tabs: Theme, Background, Font, Animations, Cursor, Tutor, Voice, Shortcuts, Data
- Each tab renders conditionally via `{activeSettingsTab === 'key' && (...)}`
- Tab buttons: `min-height: 38px`, `padding: 6px 8px`, `font-size: 0.76rem`, no background on parent list

## Target State
- 3 tabs: **Appearance** (5 sections), **Assistant** (4 sections), **System** (2 sections)
- Each tab renders ALL its sections stacked vertically
- Tab buttons: `min-height: 30px`, `padding: 4px 10px`, `font-size: 0.72rem`
- Tab list background restored

---

## Step 1: Update SettingsTabKey type and SETTINGS_TABS array

**File:** `App.tsx` ~line 109, 178

```typescript
// OLD
type SettingsTabKey = 'theme' | 'background' | 'font_size' | 'animations' | 'cursor' | 'tutor' | 'voice' | 'shortcuts' | 'data'

// NEW
type SettingsTabKey = 'appearance' | 'assistant' | 'system'
```

```typescript
// OLD
const SETTINGS_TABS = [
  { key: 'theme', label: 'Theme', icon: Sun },
  { key: 'background', label: 'Background', icon: House },
  ...8 more...
]

// NEW
const SETTINGS_TABS = [
  { key: 'appearance', label: 'Appearance', icon: Palette },
  { key: 'assistant', label: 'Assistant', icon: MessageCircle },
  { key: 'system', label: 'System', icon: Settings },
]
```

Add `Palette` and `Settings` to lucide-react imports (if not already). Remove unused icon imports.

## Step 2: Slim tab buttons

**File:** `App.css` — `.settings-tab-button`

```css
.settings-tab-button {
  min-height: 30px;     /* was 38px */
  padding: 4px 10px;     /* was 6px 8px */
  font-size: 0.72rem;    /* was 0.76rem */
  /* rest stays same */
}
```

## Step 3: Restore tab list background

**File:** `App.css` — `.settings-tab-list`

```css
.settings-tab-list {
  background: color-mix(in oklab, var(--panel-bg) 94%, black);
  /* was transparent */
}
```

## Step 4: Restructure tab panel rendering

**File:** `App.tsx` — replace the `{activeSettingsTab === '...' && (...)}` blocks with three top-level blocks:

### Appearance tab:
```tsx
{activeSettingsTab === 'appearance' && (
  <>
    <SettingsSection label="Theme">
      <ThemeSettingsTab {...theme} settings={settings} collapsedSettingsSections={collapsedSettingsSections} />
    </SettingsSection>
    <SettingsSection label="Background">
      <BackgroundSettingsTab background={background} />
    </SettingsSection>
    <SettingsSection label="Font">
      {/* current font_size content (font size + font family) */}
    </SettingsSection>
    <SettingsSection label="Animations">
      {/* current animations content (motion style + reduce motion) */}
    </SettingsSection>
    <SettingsSection label="Cursor">
      <CursorSettingsTab cursor={cursor} />
    </SettingsSection>
  </>
)}
```

### Assistant tab:
```tsx
{activeSettingsTab === 'assistant' && (
  <>
    <SettingsSection label="Tutor">
      <TutorSettingsTab settings={settings} setSettings={setSettings} />
    </SettingsSection>
    {/* current tutor-models, offline-dictionary, image-ocr collapsible sections (no longer conditional on tab) */}
    <SettingsSection label="Voice">
      <VoiceSettingsTab voice={voice} settings={settings} setSettings={setSettings} collapsedSettingsSections={collapsedSettingsSections} toggleThemeSectionCollapsed={toggleThemeSectionCollapsed} formatModelSize={models.formatModelSize} formatMinutes={models.formatMinutes} tutorInstallInfo={models.tutorInstallInfo} />
    </SettingsSection>
  </>
)}
```

### System tab:
```tsx
{activeSettingsTab === 'system' && (
  <>
    <SettingsSection label="Shortcuts">
      {/* current shortcuts content */}
    </SettingsSection>
    <SettingsSection label="Data">
      {/* current data content */}
    </SettingsSection>
  </>
)}
```

## Step 5: Clean up conditional rendering

The tutor-models, offline-dictionary, and image-ocr sections were previously conditional on `activeSettingsTab === 'tutor'`. After the restructure, they should be visible whenever the Assistant tab is active. Remove those conditionals.

## Step 6: Update any code referencing old tab keys

There may be state checks or effects that reference `activeSettingsTab === 'tutor'` or `activeSettingsTab === 'voice'`. These need to change to `activeSettingsTab === 'assistant'`.

Search for `activeSettingsTab === 'tutor'` and `activeSettingsTab === 'voice'` in App.tsx and update.

## Step 7: Adjust tab list grid

With 3 tabs instead of 9, the 4-column grid would be wasteful. Change to 3 columns:

```css
.settings-tab-list {
  grid-template-columns: repeat(3, minmax(0, 1fr));
}
```

Responsive: on small screens, keep 3 columns (they fit at ~30px min-height).

## Files Changed

| File | Changes |
|------|---------|
| `App.tsx` | Type definition, SETTINGS_TABS, tab rendering restructure, conditional cleanup |
| `App.css` | `.settings-tab-button` (slim), `.settings-tab-list` (background + 3-col grid) |

## Validation

- `npm run build` + `npm run lint`
- Check: all 11 sections visible under correct tabs
- Check: old conditional references updated

## Risk

Low — pure structural reorg. All section content stays the same, just grouped differently.
