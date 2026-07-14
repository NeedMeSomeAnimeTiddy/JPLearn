# Plan: Passages — Reading Practice for JPLearn ✅ DONE

A **"Passages"** button on the HomeView (next to JLPT Prep) that opens a reading practice view. Content from **curated Aozora Bunko** public-domain short stories (30 texts) bundled as JSON. No external API dependencies — fully self-contained. Replaces the vague "Reading Mode" concept from issue #16.

---

## Navigation Flow
```
HomeView → [📖 Passages] button (next to JLPT Prep)
       ↓
  PassageHubView (list of 30 passages, sorted by difficulty)
       ↓
  PassageReaderView (reading with furigana toggle, tap word → DictionaryPopup)
```

---

## Files (11 created, 8 modified)

| File | What |
|------|------|
| `scripts/build_passages_db.py` | One-time pipeline: downloads 5K Aozora texts, filters to 30 children's stories, generates `漢字（かんじ）` furigana via fugashi, extracts vocabulary, bundles as JSON |
| `data/external_sources/passages/aozora/passages.json` | 30 curated passages (24,151 words) — Ogawa Mimei children's stories, public domain |
| `scripts/desktop_bridge.py` | +1 handler: `passages:list` → reads bundled JSON, returns `{"passages": [...]}` |
| `src/features/passages/types.ts` | `Passage`, `ReaderSettings`, `PassageProgress` types |
| `src/features/passages/constants.ts` | Difficulty labels, default settings, font size map |
| `src/features/passages/utils.ts` | Sort by difficulty, furigana toggle helpers |
| `src/features/passages/index.ts` | Barrel exports |
| `src/features/passages/usePassages.ts` | Hook: load passages from IPC, reader state, furigana/font settings, progress tracking |
| `src/features/passages/components/PassageControls.tsx` | Toolbar: furigana toggle (Eye/EyeOff), font size cycler (S/M/L), back button |
| `src/features/passages/components/PassageReader.tsx` | Reading view: text with inline furigana, every word is a clickable span, scroll tracking |
| `src/views/PassageHubView.tsx` | Hub + reader internal routing: passage cards with progress badges, loading/error/empty states |
| `electron/ipc_handlers.cjs` | +1 handler: `passages:list` |
| `electron/preload.cjs` | +1 binding: `getPassages` |
| `src/electron.d.ts` | +2 types: `PassageItem`, `PassagesPayload`, +1 method: `getPassages` |
| `src/App.tsx` | +`passage_hub` to AppView type, render block, escape key, shortcut menu, HomeView callback |
| `src/views/HomeView.tsx` | +`onOpenPassages` prop, "Passages" button next to JLPT Prep (BookText icon) |
| `src/App.css` | ~100 lines: passage cards, skeleton, reader controls, word spans, furigana styling, header |

---

## Content Pipeline
- **Source:** `ronantakizawa/aozora-text-difficulty` HuggingFace dataset (18K+ jReadability-scored Aozora texts)
- **Filter:** NDC K (children's literature), 新字新仮名 (modern orthography), 100-4000 chars
- **Result:** 30 passages, all Beginner/Elementary, mostly Ogawa Mimei, 24,151 total words
- **Furigana:** `漢字（かんじ）` inline paren notation via fugashi, whitespace preserved
- **One-time script** — not a runtime dependency

---

## Design Decisions
| Decision | Rationale |
|----------|-----------|
| Standalone button, not a ScriptKey | ScriptKey requires ~20 file changes. A button (like JLPT Prep) is ~5. |
| New top-level view, not an overlay | Reading is a primary activity — deserves full navigation state + history. |
| Aozora only for v1 | NHK Easy is broken (JWT API, JS SPA). Aozora is public domain, bundled offline. |
| No comprehension questions | Focus on reading experience. Quiz logic adds complexity. |
| No audio | Aozora texts have no narration. NHK audio is v2. |
| Furigana as inline parens | `漢字（かんじ）` — simple regex toggle, readable plain text, no HTML needed. |
| Vocabulary: word + reading only | Definitions require a dictionary API. Deferred. |
| No word mining | User rejected. Tap-to-lookup via DictionaryPopup only. |

---

## Dependencies — Zero New
| Layer | What | Notes |
|-------|------|-------|
| Python | fugashi, unidic-lite | Already in requirements.txt, used only in the offline build pipeline |
| Node | React 19, lucide-react, motion, etc. | All already in package.json |

---

## Deferred to v2
- Comprehension questions (post-passage quizzes)
- Audio narration (TTS-generated via existing voice engine)
- Vocabulary English definitions
- NHK News Web Easy (platform migrated, all scrapers broken — needs reverse-engineering)
- User-submitted passages (import arbitrary text)
- Feature unlock gating behind `reading_mode` progression milestone
