# Offline handwriting data and runtime notices

The handwriting minigame uses no network or CDN request at runtime. It bundles a
verified subset of character data listed in `manifest.json` and loads it through
Hanzi Writer's local `charDataLoader` hook.

- Runtime: [Hanzi Writer](https://github.com/chanind/hanzi-writer), version
  `3.6.0`, MIT. Its full notice is in `licenses/hanzi-writer-MIT.txt`.
- Data aggregator: [hanzi-writer-data-youyin](https://github.com/madladsquad/hanzi-writer-data-youyin), revision
  `7d4aaeebe35b4cd9c251ecf17d0bbb6742644327`, MIT. Its notice is in
  `licenses/hanzi-writer-data-youyin-MIT.txt`.
- Japanese source data: [hanzi-writer-data-jp](https://github.com/chanind/hanzi-writer-data-jp), revision
  `efbea0cb93ba0301475ae92f9d3e512b9e4cd2ca`. Its README, AnimCJK LGPL notice,
  and Arphic Public Licence notices are copied under `licenses/hanzi-writer-data-jp/`.

`licenses/ATTRIBUTION.md` records the upstream data lineage. The generator at
`scripts/build_handwriting_assets.py` verifies every eligible single Unicode
character from the currently supported hiragana, katakana, and JLPT kanji decks
before these assets are committed.
