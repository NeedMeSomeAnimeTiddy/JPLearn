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

## Folder layout

```
data/tts/speaker_intake/<speaker_id>/
    clips/*.wav       reference audio clips (candidates)
    transcripts.tsv    tab-separated: clip_filename, role, transcript_ja, notes
    metadata.json      speaker profile
```

Exactly one row in `transcripts.tsv` must have `role` set to `default` — that
row's clip is the one encoded as the speaker's reference. Other rows (role
`alternate`) are just kept for reference/future use and are not processed.

`transcripts.tsv` example:

```tsv
clip_filename	role	transcript_ja	notes
kenji_ref_01.wav	default	こんにちは。いっしょにがんばりましょう。	primary reference clip
kenji_ref_02.wav	alternate	今日はいい天気ですね。	alternate candidate
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

Each speaker only needs **one** solid reference clip (the `role: default` row
in `transcripts.tsv`). Extra `alternate` rows are optional, kept only for your
own comparison — they are not processed.

| | Requirement |
|---|---|
| Format | WAV, uncompressed PCM |
| Channels | Mono (single channel) |
| Bit depth | 16-bit PCM (`pcm_s16le`) is safest/simplest |
| Sample rate | 24 kHz or higher (44.1 kHz is a safe default); qwen-codec resamples internally to 24 kHz, so higher source quality helps more than exact rate matching |
| Duration | Roughly 10-20 seconds of continuous speech is a good target — long enough for a clean speaker embedding, short enough to stay easy to record/transcribe cleanly |
| Speaker | Single speaker only, no overlapping voices |
| Content | Natural spoken Japanese at a natural pace — avoid reading in a flat/monotone deadpan; JPLearn's voice is a coach/tutor, so a warm, clear delivery works best |
| Background | No music, no reverb/echo, no background noise |
| Audio quality | No clipping/distortion, consistent volume level throughout |
| Transcript | Must exactly match what is spoken in the clip, character for character (used for the ICL clone path) |

If a clip fails to produce usable ICL codes (`rvq.bin`), the build script falls
back to speaker-embedding-only ("x-vector") mode automatically — you'll still
get a working preset, just without the ICL quality boost.

## Output

```
data/tts/preset_bank/<speaker_id>/
    spk.bin        speaker embedding (always produced)
    rvq.bin         ICL reference codes (produced when qwen-codec's speaker
                     encoder + codec both succeed on the reference clip)
    ref_text.txt    transcript of the reference clip (present alongside rvq.bin)
    preset.json     display metadata (for future UI use, not read by the runtime)
data/tts/preset_bank/manifest_index.json
    aggregate index of every built preset, regenerated on every run
```

These files are what get bundled/seeded into the installed app's
`tts/preset_bank/` directory (see `seedBundledQwenttsPresetSpeakers` in
`electron-frontend/electron/setup_runtime.cjs`).
