const HIRAGANA_PAIRS: [string, string][] = [
  // 3-char yoon (must be matched before any 2-char split would eat the 'y')
  ['kya', 'きゃ'], ['kyu', 'きゅ'], ['kyo', 'きょ'],
  ['sha', 'しゃ'], ['shu', 'しゅ'], ['sho', 'しょ'],
  ['sya', 'しゃ'], ['syu', 'しゅ'], ['syo', 'しょ'],
  ['cha', 'ちゃ'], ['chu', 'ちゅ'], ['cho', 'ちょ'],
  ['tya', 'ちゃ'], ['tyu', 'ちゅ'], ['tyo', 'ちょ'],
  ['nya', 'にゃ'], ['nyu', 'にゅ'], ['nyo', 'にょ'],
  ['hya', 'ひゃ'], ['hyu', 'ひゅ'], ['hyo', 'ひょ'],
  ['mya', 'みゃ'], ['myu', 'みゅ'], ['myo', 'みょ'],
  ['rya', 'りゃ'], ['ryu', 'りゅ'], ['ryo', 'りょ'],
  ['gya', 'ぎゃ'], ['gyu', 'ぎゅ'], ['gyo', 'ぎょ'],
  ['bya', 'びゃ'], ['byu', 'びゅ'], ['byo', 'びょ'],
  ['pya', 'ぴゃ'], ['pyu', 'ぴゅ'], ['pyo', 'ぴょ'],
  ['jya', 'じゃ'], ['jyu', 'じゅ'], ['jyo', 'じょ'],
  // 3-char (matched before 2-char alternatives)
  ['tsu', 'つ'],
  ['chi', 'ち'],
  ['shi', 'し'],
  // 2-char yoon written with a bare j (ja/ju/jo)
  ['ja', 'じゃ'], ['ju', 'じゅ'], ['jo', 'じょ'],
  // 2-char dakuten/handakuten
  ['ga', 'が'], ['gi', 'ぎ'], ['gu', 'ぐ'], ['ge', 'げ'], ['go', 'ご'],
  ['za', 'ざ'], ['zi', 'じ'], ['ji', 'じ'], ['zu', 'ず'], ['ze', 'ぜ'], ['zo', 'ぞ'],
  ['da', 'だ'], ['di', 'ぢ'], ['du', 'づ'], ['de', 'で'], ['do', 'ど'],
  ['ba', 'ば'], ['bi', 'び'], ['bu', 'ぶ'], ['be', 'べ'], ['bo', 'ぼ'],
  ['pa', 'ぱ'], ['pi', 'ぴ'], ['pu', 'ぷ'], ['pe', 'ぺ'], ['po', 'ぽ'],
  // 2-char standard
  ['ka', 'か'],
  ['ki', 'き'],
  ['ku', 'く'],
  ['ke', 'け'],
  ['ko', 'こ'],
  ['sa', 'さ'],
  ['si', 'し'],
  ['su', 'す'],
  ['se', 'せ'],
  ['so', 'そ'],
  ['ta', 'た'],
  ['ti', 'ち'],
  ['tu', 'つ'],
  ['te', 'て'],
  ['to', 'と'],
  ['na', 'な'],
  ['ni', 'に'],
  ['nu', 'ぬ'],
  ['ne', 'ね'],
  ['no', 'の'],
  ['ha', 'は'],
  ['hi', 'ひ'],
  ['fu', 'ふ'],
  ['he', 'へ'],
  ['ho', 'ほ'],
  ['hu', 'ふ'],
  ['ma', 'ま'],
  ['mi', 'み'],
  ['mu', 'む'],
  ['me', 'め'],
  ['mo', 'も'],
  ['ya', 'や'],
  ['yu', 'ゆ'],
  ['yo', 'よ'],
  ['ra', 'ら'],
  ['ri', 'り'],
  ['ru', 'る'],
  ['re', 'れ'],
  ['ro', 'ろ'],
  ['wa', 'わ'],
  ['wo', 'を'],
  // 1-char
  ['a', 'あ'],
  ['i', 'い'],
  ['u', 'う'],
  ['e', 'え'],
  ['o', 'お'],
  ['n', 'ん'],
]

const KATAKANA_PAIRS: [string, string][] = [
  ['kya', 'キャ'], ['kyu', 'キュ'], ['kyo', 'キョ'],
  ['sha', 'シャ'], ['shu', 'シュ'], ['sho', 'ショ'],
  ['sya', 'シャ'], ['syu', 'シュ'], ['syo', 'ショ'],
  ['cha', 'チャ'], ['chu', 'チュ'], ['cho', 'チョ'],
  ['tya', 'チャ'], ['tyu', 'チュ'], ['tyo', 'チョ'],
  ['nya', 'ニャ'], ['nyu', 'ニュ'], ['nyo', 'ニョ'],
  ['hya', 'ヒャ'], ['hyu', 'ヒュ'], ['hyo', 'ヒョ'],
  ['mya', 'ミャ'], ['myu', 'ミュ'], ['myo', 'ミョ'],
  ['rya', 'リャ'], ['ryu', 'リュ'], ['ryo', 'リョ'],
  ['gya', 'ギャ'], ['gyu', 'ギュ'], ['gyo', 'ギョ'],
  ['bya', 'ビャ'], ['byu', 'ビュ'], ['byo', 'ビョ'],
  ['pya', 'ピャ'], ['pyu', 'ピュ'], ['pyo', 'ピョ'],
  ['jya', 'ジャ'], ['jyu', 'ジュ'], ['jyo', 'ジョ'],
  ['tsu', 'ツ'],
  ['chi', 'チ'],
  ['shi', 'シ'],
  ['ja', 'ジャ'], ['ju', 'ジュ'], ['jo', 'ジョ'],
  ['ga', 'ガ'], ['gi', 'ギ'], ['gu', 'グ'], ['ge', 'ゲ'], ['go', 'ゴ'],
  ['za', 'ザ'], ['zi', 'ジ'], ['ji', 'ジ'], ['zu', 'ズ'], ['ze', 'ゼ'], ['zo', 'ゾ'],
  ['da', 'ダ'], ['di', 'ヂ'], ['du', 'ヅ'], ['de', 'デ'], ['do', 'ド'],
  ['ba', 'バ'], ['bi', 'ビ'], ['bu', 'ブ'], ['be', 'ベ'], ['bo', 'ボ'],
  ['pa', 'パ'], ['pi', 'ピ'], ['pu', 'プ'], ['pe', 'ペ'], ['po', 'ポ'],
  ['ka', 'カ'],
  ['ki', 'キ'],
  ['ku', 'ク'],
  ['ke', 'ケ'],
  ['ko', 'コ'],
  ['sa', 'サ'],
  ['si', 'シ'],
  ['su', 'ス'],
  ['se', 'セ'],
  ['so', 'ソ'],
  ['ta', 'タ'],
  ['ti', 'チ'],
  ['tu', 'ツ'],
  ['te', 'テ'],
  ['to', 'ト'],
  ['na', 'ナ'],
  ['ni', 'ニ'],
  ['nu', 'ヌ'],
  ['ne', 'ネ'],
  ['no', 'ノ'],
  ['ha', 'ハ'],
  ['hi', 'ヒ'],
  ['fu', 'フ'],
  ['he', 'ヘ'],
  ['ho', 'ホ'],
  ['hu', 'フ'],
  ['ma', 'マ'],
  ['mi', 'ミ'],
  ['mu', 'ム'],
  ['me', 'メ'],
  ['mo', 'モ'],
  ['ya', 'ヤ'],
  ['yu', 'ユ'],
  ['yo', 'ヨ'],
  ['ra', 'ラ'],
  ['ri', 'リ'],
  ['ru', 'ル'],
  ['re', 'レ'],
  ['ro', 'ロ'],
  ['wa', 'ワ'],
  ['wo', 'ヲ'],
  ['a', 'ア'],
  ['i', 'イ'],
  ['u', 'ウ'],
  ['e', 'エ'],
  ['o', 'オ'],
  ['n', 'ン'],
]

const SORTED_HIRAGANA = [...HIRAGANA_PAIRS].sort((a, b) => b[0].length - a[0].length)
const SORTED_KATAKANA = [...KATAKANA_PAIRS].sort((a, b) => b[0].length - a[0].length)

const SOKUON_CONSONANTS = new Set(['b', 'c', 'd', 'f', 'g', 'h', 'j', 'k', 'p', 'r', 's', 't', 'z'])

/**
 * Converts romaji to kana, handling doubled consonants (sokuon, e.g. "kitte"
 * -> きって), yōon combinations (kya/sho/ryu, see the pair tables above), and
 * ん written as a bare "n", "n'" (apostrophe-disambiguated), or doubled "nn"
 * (e.g. "kon'nichiwa" / "konnichiwa" -> こんにちは). Conservative: unmatched
 * characters (stray apostrophes, punctuation) are dropped rather than
 * guessed at.
 */
export function romajiToKana(romaji: string, script: 'hiragana' | 'katakana'): string {
  const pairs = script === 'hiragana' ? SORTED_HIRAGANA : SORTED_KATAKANA
  const nKana = script === 'hiragana' ? 'ん' : 'ン'
  const sokuonKana = script === 'hiragana' ? 'っ' : 'ッ'
  const input = romaji.toLowerCase().trim()
  let result = ''
  let remaining = input

  while (remaining.length > 0) {
    // "nn" -> a single ん, consuming only one of the two n's so the second
    // can still combine with a following vowel (e.g. "annai" -> あんない).
    if (remaining.startsWith('nn')) {
      result += nKana
      remaining = remaining.slice(1)
      continue
    }
    // Doubled consonant (excluding n, handled above) -> sokuon, consuming
    // only the first copy so the second starts the next syllable normally.
    if (
      remaining.length >= 2
      && remaining[0] === remaining[1]
      && SOKUON_CONSONANTS.has(remaining[0])
    ) {
      result += sokuonKana
      remaining = remaining.slice(1)
      continue
    }

    let matched = false
    for (const [pattern, kana] of pairs) {
      if (remaining.startsWith(pattern)) {
        result += kana
        remaining = remaining.slice(pattern.length)
        matched = true
        break
      }
    }
    if (!matched) {
      remaining = remaining.slice(1)
    }
  }

  return result
}
