# Japanese Voice Preset Speaker Intake

Add one folder per curated speaker here, then run:

```bash
python scripts/build_qwentts_preset_bank.py
```

This pre-encodes each speaker's reference clip into the format the qwentts.cpp
runtime (`tts-server.exe --speaker-bank`) and `electron-frontend/electron/qwentts_runtime.cjs`
expect under `data/tts/preset_bank/`.

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
- Reference clips should be clean, single-speaker, mono audio. qwen-codec
  resamples internally, but higher quality source audio produces a better
  speaker embedding.

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
