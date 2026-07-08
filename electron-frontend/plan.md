# App.tsx Restructuring Plan — Phase 4+

**Status:** Phases 1-3 complete. Phase 4+ awaiting execution.
**Baseline:** App.tsx is 7,802 lines (down from 10,892 after Phases 1-3).

---

## Guiding Principles

1. **One system at a time** — each extraction is a self-contained, testable unit
2. **Follow the theme extraction pattern** — `src/features/<name>/` with `types.ts`, `constants.ts`, `utils.ts`, `use<Name>.ts`, `components/`, and `index.ts`
3. **Hook over context** — use a custom hook (like `useTheme`) that receives state/setters as props, avoiding persistence model changes
4. **Move code, don't rewrite** — behavior should not change; only structure changes
5. **Constants and types move with their owning feature** — they don't stay in App.tsx
6. **AppSettings interface fields belonging to a feature move to that feature's types** — e.g. `themeMode`, `theme`, `themeScope`, `activeCustomThemeId`, `customThemes` already moved (theme). Background fields (`backgroundStyle`, `backgroundBlur`, `customBackgroundDataUrl`, `customBackgroundName`) should move to background feature. Voice fields (`voiceEnabled`, `voiceSpeaker`, `ambientAudioEnabled`) to voice. Etc.
7. **collapsedSettingsSections stays in App.tsx** (shared across all settings tabs) — same pattern as theme extraction
8. **CSS stays in App.css for now** — CSS module extraction is a separate future effort

---

## Extraction Candidates (Priority-Ordered)

### 1. Background System (~300 lines logic + ~130 lines JSX)

**Priority:** Highest — next logical step after theme. Tightly related to settings panel.

**What moves:**
- `BackgroundStyle` type
- `BACKGROUND_BLUR_MIN/MAX/DEFAULT` constants
- `CUSTOM_BACKGROUND_MAX_BYTES/EDGE/DATA_URL_LENGTH` constants
- `BACKGROUND_OPTIONS` constant array
- `isBackgroundStyle()` validator
- `clampBackgroundBlur()` 
- `resolveBackgroundImageUrl()`, `createBackgroundPreviewDataUrl()`
- `normalizeCustomBackgroundDataUrl()`
- `hasSupportedImageExtension()`, `isSupportedBackgroundImageFile()`
- Background-related AppSettings fields: `backgroundStyle`, `backgroundBlur`, `customBackgroundDataUrl`, `customBackgroundName`
- Background state: `backgroundPreviewUrls`, `customBackgroundActionMessage`
- Callbacks: `openCustomBackgroundPicker`, `clearCustomBackground`, `handleCustomBackgroundFileImport`
- JSX: Background tab in settings (~lines 8279-8387)

**Feature module:** `src/features/background/`
- `types.ts` — BackgroundStyle, background-related types
- `constants.ts` — BACKGROUND_OPTIONS, blur ranges, size limits
- `utils.ts` — validators, URL resolvers, image processing
- `useBackground.ts` — custom hook returning all background state and callbacks
- `components/BackgroundSettingsTab.tsx` — the background tab JSX

**App.tsx changes:**
- Import useBackground hook
- Remove background fields from AppSettings interface (or keep, but delegate)
- Replace inline background JSX with `<BackgroundSettingsTab {...background} ... />`
- ~430 lines removed from App.tsx

**Estimated impact:** -430 lines

---

### 2. Assistant / Tutor Chat System (~1,200 lines logic + ~600 lines JSX)

**Priority:** High — largest single system. Self-contained, few cross-cutting concerns.

**What moves:**

*Types & Constants:*
- `AssistantStatePayload`, `AssistantProfilePayload`, `AssistantEventPayload`
- `AssistantToast`, `AssistantChatTurn`, `AssistantChatRuntimeStatus`
- `ASSISTANT_EVENT_POLL_MS`, `ASSISTANT_TOAST_TTL_MS`, `ASSISTANT_MAX_TOASTS`
- `ASSISTANT_CHAT_USER_MEDIUM_CHAR_LIMIT`, `ASSISTANT_CHAT_MAX_IMAGE_UPLOAD_MB/BYTES`
- `ASSISTANT_CHAT_IMAGE_MAX_DIMENSION`, `ASSISTANT_CHAT_IMAGE_JPEG_QUALITY`
- `ASSISTANT_TOAST_LIMIT_OPTIONS`, `ASSISTANT_TOAST_ICONS`

*State:*
- `assistantToasts`, `assistantChatOpen`, `assistantChatInput`
- `assistantChatMessages`, `assistantChatLoading`, `assistantChatError`
- `assistantSpeakingTurnKey`, `assistantChatStatus`
- `assistantChatWarmup` (setter only), `assistantChatFallbackNote` (setter only)

*Logic callbacks:*
- `refreshAssistantChatHistory`
- `refreshAssistantChatStatus`
- `hydrateAssistantChatFromPreloaded`
- `hydrateAssistantChatFromRuntime`
- `isAssistantServerActive`
- `closeAssistantChat`, `clearAssistantChat`, `sendAssistantChat`
- `queueAssistantToast`, `trackAssistantToastInteraction`, `launchAssistantToastAction`
- `speakAssistantReply`, `replayAssistantTurn`
- `cleanAssistantChatMessage`
- Image processing: `fileToDataUrl`, `loadImageElement`, `parseDataUrl`, `prepareAssistantChatImagePayload`

*AppSettings fields:*
- `assistantToastLimit`, `assistantChatEnabled`, `assistantChatAudioEnabled`, `assistantChatOcrMinConfidence`

*JSX:*
- Assistant chat panel (~lines 9235-9409)
- Toast anchor (~lines 9452-9495)
- Chat button in titlebar (~lines 7494-7515)

*Subsystem: OCR Workbench*
- `ocrWorkbenchOpen/Busy/Error/Result` state
- `handleOcrWorkbenchImageSelected`
- `closeOcrWorkbench`
- OCR workbench JSX (~lines 8060-8204)

**Feature module:** `src/features/tutor/`
- `types.ts` — All assistant/tutor types
- `constants.ts` — Timing, limits, options, icons
- `utils.ts` — Image processing, message cleaning, download log parsing
- `useTutor.ts` — Custom hook (chat state + OCR state + all callbacks)
- `components/TutorChatPanel.tsx` — Chat dialog JSX
- `components/OcrWorkbench.tsx` — OCR translator JSX
- `components/TutorToast.tsx` — Toast component
- `components/TutorSettingsTab.tsx` — Tutor settings tab JSX (from settings panel)

**Dependencies:**
- Voice runtime (`playVoiceRuntimeAudio`, `cancelAssistantSpeech`) — needs to be injected or refactored to useVoice hook
- Settings state (for audio toggle, OCR confidence)

**Estimated impact:** -1,800 lines

---

### 4. Voice / Audio System (~600 lines logic + ~290 lines JSX)

**Priority:** High — unblocks cleaner VoiceDeps source for tutor. Self-contained playback system + voice model management.

**Feature module:** `src/features/voice/`

```
src/features/voice/
├── types.ts          (~40 lines)
├── constants.ts      (~30 lines)
├── utils.ts          (~70 lines)
├── useVoice.ts       (~380 lines)
├── components/
│   └── VoiceSettingsTab.tsx  (~290 lines)
└── index.ts          (~8 lines)
```

#### types.ts
| Item | Notes |
|------|-------|
| `VoiceSynthesisMeta` | `{ mode, profile, mixedSegmentCount, streamingAttempted, streamingFallbackUsed, elapsedMs }` |
| `SpeechSegment` | `{ text: string, language: 'ja' \| 'en' }` |
| `VoiceOptionEntry` | `{ id, name, jp, search }` |
| `VoiceStatusPayload` | `Awaited<ReturnType<...getVoiceStatus>>` |
| `VoiceSettingsFields` | `{ voiceEnabled, voiceSpeaker, ambientAudioEnabled }` |

#### constants.ts
| Item | Notes |
|------|-------|
| `FIXED_JAPANESE_VOICE_OPTIONS` | 8 hardcoded VOICEVOX speakers |
| `DEFAULT_VOICE_SPEAKER` | `'zundamon_normal'` (`FIXED_JAPANESE_VOICE_OPTIONS[0].id`) |
| `VOICE_SAMPLE_LINE` | `'こんにちは。いっしょにがんばりましょう。'` |

#### utils.ts
| Function | Notes |
|----------|-------|
| `splitSpeechSegments(text): SpeechSegment[]` | Splits Ja/En text for TTS routing. Exported from barrel — used by both voice hook and VoiceDeps injection. |

#### useVoice.ts — Hook Interface

```typescript
interface UseVoiceReturn {
  // State
  voiceBusy: boolean
  voiceUnavailable: boolean
  lastVoiceSynthesis: VoiceSynthesisMeta | null
  voiceOptions: VoiceOptionEntry[]
  voiceRuntimeRunning: boolean
  listeningLockReason: string | null
  speechRecognitionModelEnabled: boolean
  // Playback
  playQuestionAudio: (text: string, speaker?: string) => Promise<void>
  playVoiceRuntimeAudio: (text: string, runId: number) => Promise<boolean>
  cancelAssistantSpeech: () => void
  // Refs (for VoiceDeps injection into tutor)
  assistantSpeechRunIdRef: RefObject<number>
  // Speech model management
  speechDownloadingTier: 'fast' | 'balanced' | 'high' | 'ultra' | null
  speechDownloadProgress: number
  speechDownloadMethod: string | null
  downloadSpeechModel: (tier, options?) => Promise<void>
  selectSpeechModel: (tier) => Promise<void>
  uninstallSpeechModel: (tier) => Promise<void>
  getSpeechModelHardwareFit: (tier) => HardwareFit
  // Voice engine management
  voiceEngineDownloadingTier: '0.6b' | null
  voiceEngineDownloadProgress: number
  voiceEngineDownloadMethod: string | null
  downloadVoiceEngineModel: (tier) => Promise<void>
}

function useVoice(
  settings: VoiceSettingsFields,
  setSettings: Dispatch<SetStateAction<VoiceSettingsFields>>,
  deps: {
    tutorInstallInfo: TutorInstallInfo | null
    refreshTutorInstallInfo: () => Promise<void>
  }
): UseVoiceReturn
```

**State owned by hook:**
- `voiceBusy`, `voiceUnavailable`, `voiceStatus`, `voiceStatusChecked`, `lastVoiceSynthesis`, `voiceOptions`
- `speechDownloadingTier`, `speechDownloadProgress`, `speechDownloadMethod`, `speechModelActionTier`
- `voiceEngineDownloadingTier`, `voiceEngineDownloadProgress`, `voiceEngineDownloadMethod`

**Refs owned by hook:**
- `voiceAudioRef` (HTMLAudioElement)
- `ambientAudioRef` (AmbientAudioController)
- `assistantSpeechRunIdRef` (number) — shared with tutor via VoiceDeps injection

**Callbacks in hook:**
- `playQuestionAudio(text, speaker?)` — calls `window.jplearnDesktop.speakText`, manages audio element
- `playVoiceRuntimeAudio(text, runId)` — run-ID-gated playback for tutor chat replies
- `cancelAssistantSpeech()` — increments run ID, pauses current audio
- `refreshVoiceStatus()` — fetches via `getVoiceStatus` IPC
- `downloadSpeechModel(tier, options?)` — downloads speech recognition model
- `selectSpeechModel(tier)` / `uninstallSpeechModel(tier)` — model lifecycle
- `downloadVoiceEngineModel(tier)` — downloads VOICEVOX engine + preloads speaker
- `getSpeechModelHardwareFit(tier)` — RAM/VRAM fit computation

**Effects in hook:**
- Voice status refresh on mount + when entering script hub
- Voice status polling (3s interval) when voice settings tab is open
- Setup progress IPC handler (voice engine + speech model download progress)
- Ambient audio lifecycle (create/start/stop/dispose `AmbientAudioController`)

**Memos in hook:**
- `voiceRuntimeRunning` — VOICEVOX available + model installed + not downloading
- `listeningLockReason` — why audio minigames are locked
- `speechRecognitionModelEnabled` — speech model installed and active

#### components/VoiceSettingsTab.tsx

Props: `{ voice: UseVoiceReturn; settings: VoiceSettingsFields; setSettings: Dispatch; collapsedSettingsSections: Record; toggleCollapsed: (id: string) => void; tutorInstallInfo: TutorInstallInfo | null }`

Contains:
- Voice on/off toggle button
- Ambient audio toggle button
- Voice speaker options grid (plays sample on click via `voice.playQuestionAudio`)
- VOICEVOX runtime status display (running/not running, last error)
- Synthesis debug info (`voice.lastVoiceSynthesis`)
- Speech Recognition collapsible section (models, hardware fit, download/select/uninstall)
- VOICEVOX Runtime collapsible section (voice engine model download)

#### Key Change: VoiceDeps Now Sources From useVoice()

**Before (current App.tsx):**
```typescript
// Inline in App.tsx:
const assistantSpeechRunIdRef = useRef(0)
const cancelAssistantSpeech = useCallback(...)
const playVoiceRuntimeAudio = useCallback(...)
const splitSpeechSegments = (...) => {...}

const tutor = useTutor(settings, {
  voice: { playVoiceRuntimeAudio, cancelAssistantSpeech, assistantSpeechRunIdRef, splitSpeechSegments },
  ...
})
```

**After extraction:**
```typescript
const voice = useVoice(settings as any, setSettings as any, {
  tutorInstallInfo,
  refreshTutorInstallInfo,
})

const tutor = useTutor(settings, {
  voice: {
    playVoiceRuntimeAudio: voice.playVoiceRuntimeAudio,
    cancelAssistantSpeech: voice.cancelAssistantSpeech,
    assistantSpeechRunIdRef: voice.assistantSpeechRunIdRef,
    splitSpeechSegments, // imported from voice utils
  },
  ...
})
```

**Note:** `splitSpeechSegments` is imported from `src/features/voice` in App.tsx and passed to both the voice hook (internally) and the tutor VoiceDeps. The tutor feature's `VoiceDeps` interface and `SpeechSegment` type stay in `src/features/tutor/types.ts` — no feature-to-feature import needed. After Phase 4, the tutor types can optionally re-source `SpeechSegment` from voice types.

#### What Stays in App.tsx

| Item | Reason |
|------|--------|
| `tutorInstallInfo` state object | Model management monolith — Phase 5 |
| Model download callbacks for NON-voice models (tutor, dictionary, translation) | Phase 5 |
| `AppSettings` fields: `voiceEnabled`, `voiceSpeaker`, `ambientAudioEnabled` | Settings layer; typed from voice feature |
| Settings tab definition: `{ key: 'voice', label: 'Voice', icon: Volume2 }` | Cross-cutting |
| `speech_recall`, `listening_audio_first` minigame keys, config, coach toasts | Cross-cutting |
| `audioText`, `exampleSentenceAudioText` in `RoundState` + round-building functions | Cross-cutting |
| `minigameLockReasons` map (delegates to voice memos for voice-specific locks) | Cross-cutting |
| `reloadLocalFonts` | Font-related, not voice |
| Settings persistence for voice fields in `loadSettings()` | App settings layer |

#### App.tsx Impact

**Removals:** ~890 lines (types, constants, utils, state, refs, callbacks, effects, memos, JSX)

**Additions:** ~15 lines (import, hook call, deps construction, JSX component reference)

**Net:** ~-875 lines → App.tsx: 7,802 → **~6,930**

---

### 5. Model Download / Management System (~600 lines logic + ~300 lines JSX)

**Priority:** Medium — remaining model management after voice extraction. Tutor models, dictionary, translation profiles.

**What moves (updated after Phase 4):**

*State:*
- `tutorInstallInfo` (the large composite state object — now smaller after voice fields consumed by useVoice)
- `tutorDownloadingTier`, `tutorDownloadProgress`, `tutorDownloadMethod`, `tutorModelActionTier`
- `dictionaryDownloading`, `dictionaryProgress`, `dictionaryDownloadMethod`
- `translationProfileApplyingTier`, `translationProfileProgress`, `translationProfileMethod`

*Logic callbacks:*
- `refreshTutorInstallInfo`
- `downloadTutorModel`, `selectTutorModel`, `uninstallTutorModel`
- `downloadOfflineDictionary`
- `applyTranslationProfile`
- `getTutorModelHardwareFit`
- `formatModelSize`, `formatCombinedModelSize`, `formatMinutes`

*JSX:*
- Tutor models section (collapsible, inside tutor settings)
- Offline dictionary section
- Image translation section
- OCR confidence slider

**Feature module:** `src/features/models/`

**Estimated impact:** -900 lines (adjusted for voice extraction already done)

---

### 5. Settings Panel Shell (~200 lines logic + ~200 lines JSX)

**Priority:** Medium-Low — after tabs are extracted, the shell is thin.

**What moves:**

*What stays in App.tsx:*
- `showSettings`, `setShowSettings`
- `activeSettingsTab`, `setActiveSettingsTab`
- `collapsedSettingsSections`, `setCollapsedSettingsSections`
- `SettingsCollapsibleSection` component (shared by all tabs)
- `SETTINGS_TABS` constant
- Settings modal backdrop JSX (~lines 8208-8261, the tab bar and panel wrapper)

*What moves:*
- Individual tab panels → into their respective feature components
- Font tab JSX → stays inline for now (too small to justify a feature module, ~60 lines)
- Animations tab JSX → could go into a `src/features/animations/` (small ~60 lines)
- Shortcuts tab JSX → `src/features/shortcuts/` (~50 lines)
- Data/Reset tab JSX → stays inline (small ~50 lines)

**Recommendation:** Don't extract settings shell — the remaining inline tabs (font, animations, shortcuts, data) are small enough to leave in place. Once background/tutor/voice tabs move to their features, the settings panel will be significantly smaller.

**Estimated impact:** -0 lines (deferred; individual tab extractions cover this)

---

### 6. Data Loading & Persistence Layer (~400 lines logic)

**Priority:** Lower — utility functions, not a UI feature. Can be extracted as a pure data concern.

**What moves:**
- `loadSettings()`, `defaultSettings()` — ~400 lines combined
- `loadSavedStats()` / `defaultStatsByScript()`
- `loadCardScores()`
- `loadSummarySnapshot()` / `saveSummarySnapshot()`
- Storage key constants
- `PersistedSession`, `PersistedSessionRestore` interfaces

**Feature module:** `src/lib/settingsStore.ts` and `src/lib/statsStore.ts` (or `src/features/persistence/`)

**Estimated impact:** -400 lines

---

### 7. Session / Round System (~1,200 lines logic)

**Priority:** Lower — complex interdependencies with deck loading, round building, and views. Risky extraction.

**What would move:**
- Session state: `sessionActive`, `sessionScore`, `sessionRounds`, `sessionPoints`, `sessionStreak`, etc.
- Round state: `roundState`, `roundInput`, `roundFeedback*`, `isRoundResolving`, etc.
- `startSession`, `nextRound`, `submitAnswer`, `skipFeedback`
- `buildRound`, `buildRoundWithBridge`, `buildBridgeGrammarRound`
- `getSurprisePrompt`, `nextRoundMode`
- `hydrateRoundCycle`, `resetRoundCycle`, `nextCardIndex`
- `computePointComboBonus`
- `SessionRunReport` type
- `resumeRequest`, `showResumeToast`, `resumeData`, lifecycle

**Risks:**
- Tight coupling with `deckCards`, `blockProgress`, `activeScript`, `activeGame`
- `SessionContext` already wraps view rendering
- Many cross-cutting refs (seenCardIds, wrongCardIds, etc.)

**Recommendation:** Extract last. Consider leaving session logic in App.tsx if views are already well-abstracted via SessionContext.

**Estimated impact:** -1,200 lines (but high risk)

---

### 8. Content Generation Data (~500 lines of static data)

**Priority:** Lowest — static data, not logic. Moves as a dependency when other systems move.

**What:**
- `SCRIPT_MODE_PROMPT_PACKS` (~250 lines)
- `CLOZE_TEMPLATES` (~85 lines)
- `STORY_CHAPTERS` (~140 lines)
- `TAG_PROMPT_PACKS` (~20 lines)

**Module:** `src/lib/contentTemplates.ts` or `src/features/content/constants.ts`

**Estimated impact:** -500 lines (but not a priority; low impact on complexity)

---

## Execution Progress

| Phase | System | Est. Lines | Actual | App.tsx After |
|-------|--------|-----------|--------|---------------|
| 1 ✅ | Theme | -1,378 | -1,378 | 9,514 |
| 2 ✅ | Background | -456 | -458 | 9,056 |
| 3 ✅ | Tutor Chat + OCR | -1,800 | -1,275 | 7,781 |
| 4 ✅ | Voice + Audio | -875 | -703 | 7,078 |
| 5 ✅ | Model Management | -900 | -381 | 6,697 |
| 6 | Data Persistence | -400 | — | ~5,600 |
| 7 | Content Templates | -500 | — | ~5,100 |
| 8 | Session/Round (risky) | -1,200 | — | ~3,900 |

**Target:** Get App.tsx under 4,000 lines. After Phase 8 (or without it), remaining ~4,000 lines would be:
- Navigation/view routing (~200 lines)
- Settings panel shell with remaining tabs (font, animations, shortcuts, data) (~400 lines)
- Effect/event handlers (IPC listeners, lifecycle) (~300 lines)
- JSX render: shell structure, views delegation (~1,500 lines)
- Session logic (~1,200 lines, if not extracted)
- Remaining small utilities and bridge code

---

## Cross-Cutting Concerns

### Settings Panel Architecture

After multiple extractions, the settings panel becomes:

```tsx
// In App.tsx - just the shell
{showSettings ? (
  <SettingsPanelShell onClose={...} activeTab={activeSettingsTab} onTabChange={...}>
    {activeSettingsTab === 'theme' && <ThemeSettingsTab {...theme} settings={settings} collapsedSections={collapsedSettingsSections} />}
    {activeSettingsTab === 'background' && <BackgroundSettingsTab {...background} />}
    {activeSettingsTab === 'font_size' && <FontSettingsTab settings={settings} setSettings={setSettings} />}
    {activeSettingsTab === 'animations' && <AnimationsSettingsTab settings={settings} setSettings={setSettings} />}
    {activeSettingsTab === 'tutor' && <TutorSettingsTab {...tutor} {...models} settings={settings} setSettings={setSettings} collapsedSections={collapsedSettingsSections} />}
    {activeSettingsTab === 'voice' && <VoiceSettingsTab {...voice} {...models} settings={settings} setSettings={setSettings} collapsedSections={collapsedSettingsSections} />}
    {activeSettingsTab === 'shortcuts' && <ShortcutsSettingsTab settings={settings} setSettings={setSettings} />}
    {activeSettingsTab === 'data' && <DataSettingsTab {...reset} />}
  </SettingsPanelShell>
) : null}
```

### State Ownership Pattern

Following the theme extraction pattern:
1. Feature's state is managed by its custom hook, called from App component
2. Hook receives `settings` and `setSettings` (or specific slices)
3. Hook returns state, memos, callbacks, and a component or component props
4. App.tsx destructures the hook result and passes props to feature components

### IPC/Dependencies Between Systems

- **Tutor chat needs voice** → `useTutor` should accept voice callbacks (`playVoiceRuntimeAudio`, `cancelAssistantSpeech`) from `useVoice`
- **Model management shared by tutor and voice** → `useModels` is standalone; both `useTutor` and `useVoice` consume it
- **OCR workbench uses model management** → embedded within `useTutor` since it's part of the tutor system
- **Round feedback uses voice** → for playing question audio; `useVoice` provides this

### AppSettings Field Migration

**Already moved to feature types (AppSettings still holds fields, typed from feature):**
- Theme: `themeMode`, `theme`, `themeScope`, `activeCustomThemeId`, `customThemes`
- Background: `backgroundStyle`, `backgroundBlur`, `customBackgroundDataUrl`, `customBackgroundName` (typed from `src/features/background`)
- Tutor: `assistantToastLimit`, `assistantChatEnabled`, `assistantChatAudioEnabled`, `assistantChatOcrMinConfidence` (typed from `src/features/tutor`)
- To move: Voice: `voiceEnabled`, `voiceSpeaker`, `ambientAudioEnabled`
- Staying: `reducedMotion`, `fontSize`, `appFont`, `motionStyle`, `showKeyboardPrompts`

---

## Phase 3 Architecture Decision: Voice Injection Pattern

The tutor/OCR system needs voice playback functions (`playVoiceRuntimeAudio`, `cancelAssistantSpeech`, `splitSpeechSegments`, `assistantSpeechRunIdRef`). Since voice hasn't been extracted yet (Phase 4), these are **injected** into the `useTutor` hook via a `VoiceDeps` interface rather than imported from a voice feature module.

```typescript
interface VoiceDeps {
  playVoiceRuntimeAudio: (text: string, runId: number) => Promise<boolean>
  cancelAssistantSpeech: () => void
  assistantSpeechRunIdRef: React.RefObject<number>
  splitSpeechSegments: (text: string) => SpeechSegment[]
}
```

When Phase 4 (Voice) is complete, the `VoiceDeps` object in App.tsx simply sources its values from `useVoice()` return values instead of inline callbacks. The hook interface doesn't change.

---

## Notes

- The `SettingsCollapsibleSection` component should stay in App.tsx since it's shared across all non-theme settings tabs.
- `MinigameIcon` component is trivial; keep inline.
- `PETAL_STREAM`, `SURPRISE_PROMPTS`, `POINT_COMBO_THRESHOLDS` are small constants; no need to extract yet.
- `replaceAll` on setter names (e.g. `setAssistantChatOpen` → `tutor.setAssistantChatOpen`) can corrupt previously-prefixed instances into `tutor.tutor.*`. Always follow with a `tutor.tutor.` → `tutor.` cleanup.
- `trackAssistantToastInteraction` uses `(window.jplearnDesktop as any)?.trackAssistantToastInteraction?.()` in the hook because the method isn't in the DesktopApi type definition.
- `AppSettings` interface will shrink with each extraction but should remain in App.tsx until fully decomposed. Consider a partial type for remaining fields.
- Electron main process and preload — zero changes expected across all phases (same as theme extraction).
- Test files — update imports and add tests for new hooks/components per phase. No existing test behavior should change.
- `sessionActive`, `resumeRequest`, `showResumeToast` are closely tied to both session logic AND view routing — careful extraction needed.
