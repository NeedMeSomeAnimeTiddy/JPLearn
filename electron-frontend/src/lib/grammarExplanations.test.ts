import { describe, expect, it } from 'vitest'
import { GRAMMAR_EXPLANATIONS, lookupGrammarExplanation } from './grammarExplanations'

// The `character` strings of every card in the Python `grammar_patterns` deck
// (`domain/decks.py::_GRAMMAR_PATTERNS_DATA`), captured verbatim. Explanations are keyed on
// these, so a key that drifts out of this set would silently never render.
const DECK_PATTERNS: readonly string[] = [
  '〜は〜です', '〜は〜ではありません', '〜は〜ですか', '〜は〜だ', '〜があります', '〜がいます',
  '〜は', '〜が', '〜を', '〜に', '〜で', '〜へ', '〜と', '〜の', '〜も', '〜から', '〜まで',
  '〜や〜など', '〜か〜', '〜ます', '〜ません', '〜ました', '〜ませんでした', '〜ますか',
  '〜ましょう', '〜ましょうか', '〜てください', '〜ています', '〜てもいいですか',
  '〜てはいけません', '〜ないでください', '〜い (present)', '〜くない', '〜かった',
  '〜くなかった', '〜な (before noun)', '〜です (na-adj)', '〜ではありません (na-adj)',
  'なに/なん', 'だれ', 'どの〜', 'どんな〜', 'どうやって', 'なぜ/どうして', '〜から (reason)',
  '〜が (contrast)', '〜けど/けれど', '〜そして', '〜でも', '〜をください', '〜がほしい', '〜たい',
  '〜に行きます', '〜で行きます', 'どうぞよろしく', '〜はどうですか', '〜はいくらですか',
  '〜はどこですか', '〜はなんじですか', '〜ましたか', '〜じゃない', '〜だった',
  '〜て (connective)', '〜ていません', '〜から〜まで', '〜ね', '〜よ', '〜と言います',
  '〜が好きです', '〜が嫌いです', '〜がわかります', '〜はどうでしたか', '〜てから', '〜ながら',
  '〜ことができます', '〜てみます', '〜てしまいます', '〜たことがあります', '〜と思います',
  '〜かもしれません', '〜なければなりません', '〜てもいいです', '〜だけです', '〜ようです',
  '〜たら', '〜てあげます', '〜てくれます', '〜てもらいます',
]

describe('grammarExplanations', () => {
  it('keys every explanation on a real deck pattern', () => {
    const deckPatterns = new Set(DECK_PATTERNS)
    const orphans = Object.keys(GRAMMAR_EXPLANATIONS).filter((key) => !deckPatterns.has(key))
    expect(orphans).toEqual([])
  })

  it('explains every pattern in the deck', () => {
    const uncovered = DECK_PATTERNS.filter((pattern) => !(pattern in GRAMMAR_EXPLANATIONS))
    expect(uncovered).toEqual([])
  })

  it('gives every entry a name, formation, two examples, and a common mistake', () => {
    for (const [key, entry] of Object.entries(GRAMMAR_EXPLANATIONS)) {
      expect(entry.name.trim(), `${key} name`).not.toBe('')
      expect(entry.formation.trim(), `${key} formation`).not.toBe('')
      expect(entry.commonMistake.trim(), `${key} commonMistake`).not.toBe('')
      expect(entry.examples, `${key} examples`).toHaveLength(2)
      for (const example of entry.examples) {
        expect(example.jp.trim(), `${key} example jp`).not.toBe('')
        expect(example.romaji.trim(), `${key} example romaji`).not.toBe('')
        expect(example.en.trim(), `${key} example en`).not.toBe('')
      }
    }
  })

  it('keeps the two example sentences distinct within an entry', () => {
    for (const [key, entry] of Object.entries(GRAMMAR_EXPLANATIONS)) {
      expect(entry.examples[0].jp, `${key} duplicate example`).not.toBe(entry.examples[1].jp)
    }
  })

  it('looks patterns up by exact deck string, ignoring surrounding whitespace', () => {
    expect(lookupGrammarExplanation('〜を')).toBe(GRAMMAR_EXPLANATIONS['〜を'])
    expect(lookupGrammarExplanation('  〜を  ')).toBe(GRAMMAR_EXPLANATIONS['〜を'])
  })

  it('keeps patterns the deck disambiguates by parenthetical separate', () => {
    expect(lookupGrammarExplanation('〜から')).toBe(GRAMMAR_EXPLANATIONS['〜から'])
    expect(lookupGrammarExplanation('〜から (reason)')).toBe(GRAMMAR_EXPLANATIONS['〜から (reason)'])
    expect(lookupGrammarExplanation('〜から')).not.toBe(lookupGrammarExplanation('〜から (reason)'))

    expect(lookupGrammarExplanation('〜が')).toBe(GRAMMAR_EXPLANATIONS['〜が'])
    expect(lookupGrammarExplanation('〜が (contrast)')).toBe(GRAMMAR_EXPLANATIONS['〜が (contrast)'])
    expect(lookupGrammarExplanation('〜が')).not.toBe(lookupGrammarExplanation('〜が (contrast)'))
  })

  it('does not match on a stripped 〜 or a stripped parenthetical', () => {
    expect(lookupGrammarExplanation('を')).toBeNull()
    expect(lookupGrammarExplanation('〜です')).toBeNull()
  })

  it('returns null for non-deck input', () => {
    // `sentence_examples` cards carry the `grammar` tag too, but their character is a whole
    // sentence rather than a pattern — those must find nothing.
    expect(lookupGrammarExplanation('これは ほんです。')).toBeNull()
    expect(lookupGrammarExplanation('猫')).toBeNull()
    expect(lookupGrammarExplanation('')).toBeNull()
    expect(lookupGrammarExplanation(null)).toBeNull()
    expect(lookupGrammarExplanation(undefined)).toBeNull()
  })
})
