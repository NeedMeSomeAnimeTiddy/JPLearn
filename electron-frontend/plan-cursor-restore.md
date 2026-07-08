# Plan: Restore Custom Cursor Integration in App.tsx

**Status:** Planning. **Problem:** Cursor feature module exists (just committed) but App.tsx integration was lost during git checkout revert.

## What's Missing

The `useCursor` hook and `CursorFollower` component are completely absent from App.tsx.

## What Needs to Happen

### Step 1: Import cursor feature

```tsx
import { useCursor } from './features/cursor'
import { CursorFollower } from './features/cursor'
```

### Step 2: Add cursor settings to AppSettings interface

The `useCursor` hook expects `settings.cursor: CursorSettings` where `CursorSettings` is:
```typescript
{ mode: 'system' | 'custom' | 'animated', theme: 'classic' | 'sakura' | 'ink_brush' | 'neon_dot', size: number, color: string | null }
```

Add to AppSettings:
```typescript
cursorMode: 'system' | 'custom' | 'animated'
cursorTheme: 'classic' | 'sakura' | 'ink_brush' | 'neon_dot'
cursorSize: number
cursorColor: string | null
```

### Step 3: Add defaults in defaultSettings()

```typescript
cursorMode: 'system',
cursorTheme: 'classic',
cursorSize: 1,
cursorColor: null,
```

### Step 4: Call useCursor hook

```typescript
const cursor = useCursor(settings, setSettings)
```

Note: The hook signature is `useCursor(settings: { cursor: CursorSettings }, setSettings)`. We need to check if `settings.cursor` matches what the hook expects, or if we need a wrapper.

Actually, looking at the hook code: `const { mode, theme, size, color: cursorColor } = settings.cursor`. So `settings` needs a `.cursor` property. Our AppSettings can either:
- Have flat cursor fields: `cursorMode`, `cursorTheme`, `cursorSize`, `cursorColor`
- OR have a nested cursor object

The hook expects `{ cursor: { mode, theme, size, color } }`. We need to either:
- Adapt the call: `useCursor({ cursor: { mode: settings.cursorMode, theme: settings.cursorTheme, ... }}, ...)`
- OR add a nested cursor to AppSettings

Easiest: adapt the call with a wrapper object.

### Step 5: Render CursorFollower via portal

```tsx
{cursor.cursorMode === 'animated' && createPortal(<CursorFollower {...cursor} />, document.body)}
```

This goes near other portal renders (like the char-detail-card overlay).

### Step 6: Add CursorSettingsTab to Appearance tab in settings

Already in the settings area. We need to render it under Appearance:
```tsx
<SettingsSection label="Cursor">
  <CursorSettingsTab cursor={cursor} />
</SettingsSection>
```

But currently there's no `SettingsSection` component — settings sections use `<div className="settings-section settings-control-row ...">` pattern. We can add it inline.

### Step 7: Persist cursor settings

If cursor settings need to persist (survive reload), they need to be in `loadSettings()` / `defaultSettings()` and saved.

## Files Changed

| File | Changes |
|------|---------|
| `App.tsx` | Import, state, hook call, render, settings tab |

## Validation

- `npm run build` — must succeed
- Custom cursor should appear when mode is 'animated'
- Cursor settings tab should work in Appearance section
