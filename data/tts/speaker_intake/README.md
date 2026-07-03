# Japanese Voice Preset Speaker Intake

Four speaker folders are already scaffolded here (`male_kenji`, `male_haru`,
`female_aya`, `female_mina` — matching the original 4-preset target). Drop
your reference clip into each speaker's `clips/` folder, fill in
`transcripts.tsv` and `metadata.json`, then run:

```bash
python scripts/build_qwentts_preset_bank.py
```

This pre-encodes each speaker's reference clip into the format the qwentts.cpp
runtime (`tts-server.exe --speaker-bank`) and `electron-frontend/electron/qwentts_runtime.cjs`
expect under `data/tts/preset_bank/`. Rename the folders or edit `metadata.json`
freely if you want different speakers, genders, or names than the scaffolded
defaults — the folder name is what becomes the in-app voice ID.

The current builder now uses every WAV in `clips/` to build a stronger
multi-clip speaker embedding (`spk.bin`), while still using exactly one TSV
`default` row as the transcript-aligned reference for `rvq.bin` /
`ref_text.txt`.

Important: `role` is a JPLearn builder concept, not an upstream qwentts.cpp
feature. qwentts.cpp only consumes the built `spk.bin` plus optional
`rvq.bin` and `ref_text.txt`; it does not read `transcripts.tsv` directly and
does not document any built-in role taxonomy for cross-lingual tuning.

## Folder layout

```text
data/tts/speaker_intake/<speaker_id>/
    clips/*.wav       reference audio clips (candidates)
    transcripts.tsv    tab-separated: clip_filename, role, transcript_ja, notes
    metadata.json      speaker profile
```

Exactly one row in `transcripts.tsv` should have `role` set to `default` —
that row's clip is the one used as the transcript-aligned ICL/reference
source. Other supported builder-local roles are:

- `alternate`: include this clip in the aggregate `spk.bin` embedding.
- `embedding` or `embedding_only`: include this clip in `spk.bin`, but never
  treat it as the primary ICL/reference clip.
- `exclude`: ignore this clip completely, even if the WAV exists in `clips/`.

For backwards compatibility, unlisted WAVs are still included in `spk.bin`
unless you build with `--only-listed-clips`.

`transcripts.tsv` example:

```text
clip_filename    role         transcript_ja                     notes
kenji_ref_01.wav default      こんにちは。いっしょにがんばりましょう。 primary reference clip
kenji_ref_02.wav alternate    今日はいい天気ですね。               alternate candidate
kenji_ref_03.wav embedding    ゆっくり落ち着いた声で話します。     embedding-only extra clip
kenji_bad_take.wav exclude                                      clipped recording, do not use
```

`metadata.json` example:

```json
{
  "speakerId": "male_kenji",
  "displayName": "Kenji",
  "gender": "male",
  "language": "ja",
  "description": "Neutral Japanese male voice.",
  "searchTerms": ["neutral", "male", "tokyo accent"]
}
```

## Requirements

- A Base-mode talker GGUF and the shared tokenizer GGUF must already be
  installed (run the Setup Wizard's Japanese Voice step first), or pass
  `--talker <path>` / `--codec <path>` explicitly.
- `tools/qwentts.cpp/build/Release/qwen-codec.exe` must exist (run
  `scripts/build_qwentts_cpp.ps1` first), or pass `--qwen-codec <path>`.

## Reference clip specs

Each speaker still needs **one** solid transcript-aligned reference clip (the
`role: default` row in `transcripts.tsv`) for `rvq.bin` / `ref_text.txt`.
But now the rest of the WAV clips matter too: the builder aggregates them into
the final `spk.bin` speaker embedding. The builder also weights the default
clip more heavily than the rest, and downweights `_en` clips by default so
cross-lingual samples can borrow some English pronunciation cues without
letting a small English subset dominate the speaker identity.

Useful builder flags:

- `--max-english-clips 4`: cap how many `_en` clips are allowed into
  `spk.bin`.
- `--english-embedding-weight 0.35`: reduce or raise how much `_en` clips
  influence the final speaker embedding.
- `--default-embedding-weight 3.0`: keep the main reference clip anchored more
  strongly in `spk.bin`.
- `--only-listed-clips`: use `transcripts.tsv` as the authoritative curation
  list instead of sweeping in every WAV under `clips/`.

- Format: WAV, uncompressed PCM
- Channels: mono (single channel)
- Bit depth: 16-bit PCM (`pcm_s16le`) is safest/simplest
- Sample rate: 24 kHz or higher (44.1 kHz is a safe default); qwen-codec resamples internally to 24 kHz, so higher source quality helps more than exact rate matching
- Duration: roughly 10-20 seconds of continuous speech is a good target - long enough for a clean speaker embedding, short enough to stay easy to record/transcribe cleanly
- Speaker: single speaker only, no overlapping voices
- Content: natural spoken Japanese at a natural pace - avoid reading in a flat/monotone deadpan; JPLearn's voice is a coach/tutor, so a warm, clear delivery works best
- Background: no music, no reverb/echo, no background noise
- Audio quality: no clipping/distortion, consistent volume level throughout
- Transcript: must exactly match what is spoken in the clip, character for character (used for the ICL clone path)

If a clip fails to produce usable ICL codes (`rvq.bin`), the build script falls
back to speaker-embedding-only ("x-vector") mode automatically — you'll still
get a working preset, just without the ICL quality boost.

## Output

```text
data/tts/preset_bank/<speaker_id>/
    spk.bin        averaged multi-clip speaker embedding (always produced)
    rvq.bin         ICL reference codes (produced when qwen-codec's speaker
             encoder + codec both succeed on the default reference clip)
    ref_text.txt    transcript of the default reference clip (present alongside rvq.bin)
    preset.json     display metadata (for future UI use, not read by the runtime)
data/tts/preset_bank/manifest_index.json
    aggregate index of every built preset, regenerated on every run
```

These files are what get bundled/seeded into the installed app's
`tts/preset_bank/` directory (see `seedBundledQwenttsPresetSpeakers` in
`electron-frontend/electron/setup_runtime.cjs`).
