const HIRAGANA_PAIRS: [string, string][] = [
  // 3-char (matched before 2-char alternatives)
  ['tsu', 'つ'],
  ['chi', 'ち'],
  ['shi', 'し'],
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
  ['tsu', 'ツ'],
  ['chi', 'チ'],
  ['shi', 'シ'],
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

export function romajiToKana(romaji: string, script: 'hiragana' | 'katakana'): string {
  const pairs = script === 'hiragana' ? SORTED_HIRAGANA : SORTED_KATAKANA
  const input = romaji.toLowerCase().trim()
  let result = ''
  let remaining = input

  while (remaining.length > 0) {
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
