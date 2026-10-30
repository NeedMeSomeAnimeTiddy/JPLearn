/**
 * Romaji Sprint grading (audit 16, F1): vocabulary readings with alternatives, brackets or `~`
 * become answerable in the missed-word review, without ever accepting a fragment; kana and
 * kanji rounds grade exactly as before.
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { assessRomajiSprintAnswer, romajiSprintCandidates } from './romajiSprintAssessment'

function vocab(character: string, reading: string, given: string) {
  return assessRomajiSprintAnswer({ answer: reading, focusText: character, deckSlug: 'vocab_n5' }, given)
}

function expectAccepts(character: string, reading: string, accepted: string[], rejected: string[]) {
  for (const given of accepted) expect(vocab(character, reading, given), `${reading}: "${given}"`).toBe('exact')
  for (const given of rejected) expect(vocab(character, reading, given), `${reading}: "${given}"`).toBe('incorrect')
}

describe('kana and kanji rounds', () => {
  it('grade as before: split on "/", spaces collapsed, never removed', () => {
    const kanji = { answer: 'ichi / itsu', focusText: '一', deckSlug: 'kanji_n5' }
    expect(assessRomajiSprintAnswer(kanji, 'ichi')).toBe('exact')
    expect(assessRomajiSprintAnswer(kanji, ' ITSU ')).toBe('exact')
    expect(assessRomajiSprintAnswer(kanji, 'i chi')).toBe('incorrect')
    expect(assessRomajiSprintAnswer(kanji, 'ni')).toBe('incorrect')
    expect(assessRomajiSprintAnswer({ answer: 'ji/di', focusText: 'ぢ', deckSlug: 'hiragana' }, 'di')).toBe('exact')
    expect(romajiSprintCandidates('ichi / itsu', '一', { vocabulary: false })).toEqual(['ichi', 'itsu'])
  })

  it('a round with no deck is not vocabulary', () => {
    expect(assessRomajiSprintAnswer({ answer: 'benkyou (suru)', focusText: '勉強' }, 'benkyou')).toBe('incorrect')
  })
})

describe('vocabulary rounds', () => {
  it('drop "~"', () => {
    expectAccepts('~区', '~ku', ['ku'], ['k'])
  })

  it('accept an optional bracketed part with or without it, never the part alone', () => {
    expectAccepts('勉強', 'benkyou (suru)', ['benkyou', 'benkyou suru', 'benkyousuru', 'Benkyou'], ['suru', 'benkyo'])
    expectAccepts('十', '(o) too', ['too', 'o too', 'otoo'], ['o'])
    expectAccepts('~(て) しまう', '~(te) shimau', ['shimau', 'te shimau', 'teshimau'], ['te'])
    expectAccepts('〜(日本) 式', '~(nihon) shiki', ['shiki', 'nihon shiki', 'nihonshiki'], ['nihon'])
  })

  it('accept a bracketed alternative word on its own', () => {
    expectAccepts('じゅうたん (カーペット)', 'juutan (kaapetto)', ['juutan', 'kaapetto'], ['juutan kaapetto', 'juutankaapetto'])
    expectAccepts('~おしまい (おわり)', '~oshimai (owari)', ['oshimai', 'owari'], ['oshimaiowari'])
  })

  it('accept only the form without a label or usage note', () => {
    expectAccepts('しまった (かん)', 'shimatta (kan)', ['shimatta'], ['shimattakan', 'shimatta kan', 'kan'])
    expectAccepts('こつ (をつかむ)', 'kotsu (otsukamu)', ['kotsu'], ['kotsuotsukamu', 'otsukamu'])
    expectAccepts('よって (よりどころ)', 'yotte (yoridokoro)', ['yotte'], ['yoridokoro', 'yotteyoridokoro'])
  })

  it('treat an unknown bracket content as a label', () => {
    expectAccepts('ねこ (どうぶつ)', 'neko (doubutsu)', ['neko'], ['doubutsu', 'neko doubutsu'])
  })

  it('split a reading into alternatives only when the written form lists as many', () => {
    expectAccepts('いい; よい', 'ii yoi', ['ii', 'yoi', 'ii yoi'], ['i'])
    expectAccepts('~くらい; ぐらい', '~kurai gurai', ['kurai', 'gurai'], ['kura'])
    expectAccepts('こうよう もみじ', 'kouyou momiji', ['kouyou', 'momiji'], [])
    expectAccepts('回る、回す', 'mawaru mawasu', ['mawaru', 'mawasu'], [])
    expectAccepts('ごめんなさい', 'gomen nasai', ['gomen nasai', 'gomennasai'], ['gomen', 'nasai'])
    expectAccepts('おはようございます', 'ohayou gozaimasu', ['ohayou gozaimasu', 'ohayougozaimasu'], ['ohayou', 'gozaimasu'])
  })

  it('take the reviewed alternatives for kanji words with no separator', () => {
    expectAccepts('行く', 'iku yuku', ['iku', 'yuku', 'iku yuku'], ['ik'])
    expectAccepts('何', 'nan nani', ['nan', 'nani'], ['na'])
    expectAccepts('毎月', 'maigetsu maitsuki', ['maigetsu', 'maitsuki'], ['mai'])
    expectAccepts('毎年', 'mainen maitoshi', ['mainen', 'maitoshi'], ['mai'])
    expectAccepts('お金持ち', 'kanemochi okanemochi', ['kanemochi', 'okanemochi'], ['o'])
    expectAccepts('さぞ (さぞや。さぞかし)', 'sazo (sazoyasazokashi)', ['sazo', 'sazoya', 'sazokashi'], ['sazoyasazokashi', 'sazosazoyasazokashi'])
  })

  it('still mark a plain wrong answer wrong', () => {
    expectAccepts('犬', 'inu', ['inu'], ['neko', 'in'])
  })
})

/** Every vocabulary reading with brackets in the corpus, with what it accepts and rejects. */
const BRACKETED_ROWS: ReadonlyArray<readonly [string, string, string[], string[]]> = [
  ['結婚', 'kekkon (suru)', ['kekkon', 'kekkon suru', 'kekkonsuru'], ['suru']],
  ['散歩', 'sampo (suru)', ['sampo', 'sampo suru'], ['suru']],
  ['掃除', 'souji (suru)', ['souji', 'soujisuru'], ['suru']],
  ['十', '(o) too', ['too', 'o too', 'otoo'], ['o']],
  ['勉強', 'benkyou (suru)', ['benkyou', 'benkyou suru', 'benkyousuru'], ['suru']],
  ['練習', 'renshuu (suru)', ['renshuu', 'renshuusuru'], ['suru']],
  ['パート (タイム)', 'paato (taimu)', ['paato', 'paato taimu', 'paatotaimu'], ['taimu']],
  ['~(て) しまう', '~(te) shimau', ['shimau', 'te shimau', 'teshimau'], ['te']],
  ['~(に) よると', '~(ni) yoruto', ['yoruto', 'ni yoruto'], ['ni']],
  ['スーパー (マーケット)', 'suupaa (maaketto)', ['suupaa', 'suupaa maaketto'], ['maaketto']],
  ['~(に) ついて', '~(ni) tsuite', ['tsuite', 'nitsuite'], ['ni']],
  ['しまった (かん)', 'shimatta (kan)', ['shimatta'], ['shimattakan', 'shimatta kan', 'kan']],
  ['すみません (かん)', 'sumimasen (kan)', ['sumimasen'], ['sumimasen kan', 'kan']],
  ['よろしく (かん)', 'yoroshiku (kan)', ['yoroshiku'], ['yoroshikukan', 'kan']],
  ['はあ (かん)', 'haa (kan)', ['haa'], ['haakan', 'kan']],
  ['〜 (まる) ごと', '(maru) goto', ['goto', 'maru goto', 'marugoto'], ['maru']],
  ['(かさを~) さす', '(kasao~) sasu', ['sasu'], ['kasao', 'kasaosasu']],
  ['〜(日本) 式', '~(nihon) shiki', ['shiki', 'nihon shiki', 'nihonshiki'], ['nihon']],
  ['~いち (にほんいち)', '~ichi (nihonichi)', ['ichi'], ['nihonichi', 'ichinihonichi']],
  ['~おしまい (おわり)', '~oshimai (owari)', ['oshimai', 'owari'], ['oshimaiowari', 'oshimai owari']],
  ['~ほう (ひかく)', '~hou (hikaku)', ['hou'], ['hikaku', 'houhikaku']],
  ['かび (~がはえる)', 'kabi (~gahaeru)', ['kabi'], ['gahaeru', 'kabigahaeru']],
  ['下品(な)', 'gehin(na)', ['gehin', 'gehinna', 'gehin na'], ['na']],
  ['しいんと (する)', 'shiinto (suru)', ['shiinto', 'shiinto suru'], ['suru']],
  ['しつれいしました (かん)', 'shitsureishimashita (kan)', ['shitsureishimashita'], ['shitsureishimashitakan', 'kan']],
  ['しめた (かん)', 'shimeta (kan)', ['shimeta'], ['shimetakan', 'kan']],
  ['じゅうたん (カーペット)', 'juutan (kaapetto)', ['juutan', 'kaapetto'], ['juutankaapetto']],
  ['しわ (かおの~)', 'shiwa (kaono~)', ['shiwa'], ['kaono', 'shiwakaono']],
  ['それはいけませんね (かん)', 'sorehaikemasenne (kan)', ['sorehaikemasenne'], ['sorehaikemasennekan', 'kan']],
  ['だいいち (とりわけ)', 'daiichi (toriwake)', ['daiichi', 'toriwake'], ['daiichitoriwake']],
  ['どういたしまして (かん)', 'douitashimashite (kan)', ['douitashimashite'], ['douitashimashitekan', 'kan']],
  ['はい (かん)', 'hai (kan)', ['hai'], ['haikan', 'kan']],
  ['朗らか(な)', 'hogaraka(na)', ['hogaraka', 'hogarakana'], ['na']],
  ['ミリ (メートル)', 'miri (meetoru)', ['miri', 'miri meetoru', 'mirimeetoru'], ['meetoru']],
  ['ございます (かん)', 'gozaimasu (kan)', ['gozaimasu'], ['gozaimasukan', 'kan']],
  ['こす (みずを~)', 'kosu (mizuo~)', ['kosu'], ['mizuo', 'kosumizuo']],
  ['こつ (をつかむ)', 'kotsu (otsukamu)', ['kotsu'], ['otsukamu', 'kotsuotsukamu']],
  ['ごらんなさい (かん)', 'gorannasai (kan)', ['gorannasai'], ['gorannasaikan', 'kan']],
  ['コンタクト (レンズ)', 'kontakuto (renzu)', ['kontakuto', 'kontakuto renzu'], ['renzu']],
  ['さきに (いぜん)', 'sakini (izen)', ['sakini', 'izen'], ['sakiniizen']],
  ['さぞ (さぞや。さぞかし)', 'sazo (sazoyasazokashi)', ['sazo', 'sazoya', 'sazokashi'], ['sazoyasazokashi', 'sazosazoyasazokashi']],
  ['さらう (こどもを~)', 'sarau (kodomoo~)', ['sarau'], ['kodomoo', 'saraukodomoo']],
  ['とげ (をさす)', 'toge (osasu)', ['toge'], ['osasu', 'togeosasu']],
  ['おおい (かん)', 'ooi (kan)', ['ooi'], ['ooikan', 'kan']],
  ['おごる (ゆうしょくを~)', 'ogoru (yuushokuo~)', ['ogoru'], ['yuushokuo', 'ogoruyuushokuo']],
  ['かく (はじを)', 'kaku (hajio)', ['kaku'], ['hajio', 'kakuhajio']],
  ['くじ (~をひく)', 'kuji (~ohiku)', ['kuji'], ['ohiku', 'kujiohiku']],
  ['あせる (こえが~)', 'aseru (koega~)', ['aseru'], ['koega', 'aserukoega']],
  ['(花を〜) 生ける、 活ける', '(hanao~) ikeru', ['ikeru'], ['hanao', 'hanaoikeru']],
  ['すくう (みずを~)', 'sukuu (mizuo~)', ['sukuu'], ['mizuo', 'sukuumizuo']],
  ['そり (~にのる)', 'sori (~ninoru)', ['sori'], ['ninoru', 'sorininoru']],
  ['つじつま (はなしの~)', 'tsujitsuma (hanashino~)', ['tsujitsuma'], ['hanashino', 'tsujitsumahanashino']],
  ['つぶる (めを~)', 'tsuburu (meo~)', ['tsuburu'], ['meo', 'tsuburumeo']],
  ['またがる (うまを~)', 'matagaru (umao~)', ['matagaru'], ['umao', 'matagaruumao']],
  ['よし (かん)', 'yoshi (kan)', ['yoshi'], ['yoshikan', 'kan']],
  ['よって (よりどころ)', 'yotte (yoridokoro)', ['yotte'], ['yoridokoro', 'yotteyoridokoro']],
  ['ひび (かべの~)', 'hibi (kabeno~)', ['hibi'], ['kabeno', 'hibikabeno']],
]

/** Bracket contents that are a whole other word, the only ones that may be a candidate alone. */
const ALTERNATIVE_WORDS = new Set(['kaapetto', 'owari', 'toriwake', 'izen'])

/**
 * The vocabulary corpus as the decks are built: the generated level lists (the five CSVs after
 * import, which turns ',' into '、') plus the hand-written supplement rows.
 */
function loadVocabularyCorpus(): Array<{ character: string; reading: string }> {
  const repoRoot = resolve(process.cwd(), '..')
  const rowPattern = /^\s*\((['"])(.*?)\1, (['"])(.*?)\3, /gm
  const generated = readFileSync(resolve(repoRoot, 'domain/external_deck_data.py'), 'utf8')
  const vocabLists = generated.slice(generated.indexOf('VOCAB_N5_EXTERNAL_DATA'), generated.indexOf('GRAMMAR_PATTERNS_EXTERNAL_DATA'))
  const supplements = readFileSync(resolve(repoRoot, 'domain/deck_supplements.py'), 'utf8')
  const vocabSupplement = supplements.slice(supplements.indexOf('VOCAB_SUPPLEMENT'), supplements.indexOf('KANJI_SUPPLEMENT'))
  const rows = [...vocabLists.matchAll(rowPattern), ...vocabSupplement.matchAll(rowPattern)]
    .map((match) => ({ character: match[2], reading: match[4] }))
  expect(rows.length).toBeGreaterThan(8000)
  return rows
}

describe('the bracketed vocabulary readings', () => {
  it.each(BRACKETED_ROWS)('%s "%s" accepts and rejects as reviewed', (character, reading, accepted, rejected) => {
    expectAccepts(character, reading, accepted, rejected)
  })
})

describe('the whole vocabulary corpus', () => {
  const corpus = loadVocabularyCorpus()

  it('has exactly the reviewed bracketed rows', () => {
    const bracketed = corpus.filter((row) => row.reading.includes('('))
    expect(bracketed.map((row) => `${row.character}|${row.reading}`).sort())
      .toEqual(BRACKETED_ROWS.map(([character, reading]) => `${character}|${reading}`).sort())
  })

  it('gives every card a candidate the learner can type, and no bracket content alone unless it is a whole word', () => {
    for (const { character, reading } of corpus) {
      const candidates = romajiSprintCandidates(reading, character, { vocabulary: true })
      expect(candidates.some((candidate) => /^[a-z]+( [a-z]+)*$/.test(candidate)), `${character} ${reading}`).toBe(true)
      for (const match of reading.matchAll(/\(([^()]*)\)/g)) {
        const content = match[1].replace(/[~〜]/g, '').trim().toLowerCase()
        if (ALTERNATIVE_WORDS.has(content)) continue
        expect(candidates, `${character} ${reading}`).not.toContain(content)
      }
    }
  })
})
