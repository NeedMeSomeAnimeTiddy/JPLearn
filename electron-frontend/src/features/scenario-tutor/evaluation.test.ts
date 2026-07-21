import { describe, expect, it } from 'vitest'
import { evaluateResponse, toEvaluationResult } from './evaluation'
import { normalizeJapaneseAnswer } from './utils'
import { CAFE_ORDER_SCENARIO } from '../../lib/scenarios/cafeOrder'
import { SHINJUKU_DIRECTIONS_SCENARIO } from '../../lib/scenarios/shinjukuDirections'
import type { LearnerNode } from './types'

function learnerNode(scenarioId: 'cafe' | 'directions', nodeId: string): LearnerNode {
  const scenario = scenarioId === 'cafe' ? CAFE_ORDER_SCENARIO : SHINJUKU_DIRECTIONS_SCENARIO
  const node = scenario.nodes[nodeId]
  if (node.kind !== 'learner') throw new Error(`${nodeId} is not a learner node`)
  return node
}

describe('normalizeJapaneseAnswer', () => {
  it('applies NFKC, strips punctuation/whitespace, and lowercases Latin', () => {
    expect(normalizeJapaneseAnswer('コーヒー、ください！')).toBe(normalizeJapaneseAnswer('コーヒーください'))
    expect(normalizeJapaneseAnswer('Hello World')).toBe('helloworld')
  })

  it('folds katakana to hiragana', () => {
    expect(normalizeJapaneseAnswer('コーヒー')).toBe(normalizeJapaneseAnswer('こーひー'))
  })

  it('expands the prolonged sound mark into a doubled vowel so chouon text compares equal to doubled-vowel romaji output', () => {
    expect(normalizeJapaneseAnswer('コーヒー')).toBe('こおひい')
  })

  it('folds homophone kana spellings so a learner is never wrong on spelling convention alone', () => {
    // は/わ — "konbanwa" typed as romaji produces こんばんわ.
    expect(normalizeJapaneseAnswer('こんばんわ')).toBe(normalizeJapaneseAnswer('こんばんは'))
    expect(normalizeJapaneseAnswer('こんにちわ')).toBe(normalizeJapaneseAnswer('こんにちは'))
    // を/お — "koohii o kudasai" produces おください, the phrase uses をください.
    expect(normalizeJapaneseAnswer('コーヒーおください')).toBe(normalizeJapaneseAnswer('コーヒーをください'))
    // へ/え — the direction particle typed phonetically.
    expect(normalizeJapaneseAnswer('みなみぐちえ')).toBe(normalizeJapaneseAnswer('みなみぐちへ'))
    // Distinct answers still stay distinct.
    expect(normalizeJapaneseAnswer('コーヒー')).not.toBe(normalizeJapaneseAnswer('紅茶'))
  })
})

describe('evaluateResponse — cafe-order n-order (accepted phrases, synonyms, slots)', () => {
  const node = learnerNode('cafe', 'n-order')
  const expectation = { intents: node.intents, cancelIntent: node.cancelIntent }

  it('accepts the canonical phrase as correct', () => {
    const result = evaluateResponse(expectation, 'コーヒーをください', { inputSource: 'typed' })
    expect(result.outcome).toBe('correct')
    expect(result.matchedIntentId).toBe('it-order-drink')
  })

  it('accepts a communicatively valid paraphrase that differs from the canonical example', () => {
    const result = evaluateResponse(expectation, 'ホットコーヒーお願いします', { inputSource: 'typed' })
    expect(result.outcome).toBe('correct')
  })

  it('accepts hiragana-typed input equivalent to the katakana canonical form', () => {
    const result = evaluateResponse(expectation, 'こーひーをください', { inputSource: 'typed' })
    expect(result.outcome).toBe('correct')
  })

  it('accepts romaji input converted through the same normalisation pipeline', () => {
    const result = evaluateResponse(expectation, 'koohii kudasai', { inputSource: 'typed' })
    expect(result.outcome).toBe('correct')
    expect(result.matchedIntentId).toBe('it-order-drink')
  })

  it('classifies a bare drink name (missing polite marker) as a partial mistake with a correction', () => {
    const det = evaluateResponse(expectation, 'コーヒー', { inputSource: 'typed' })
    expect(det.outcome).toBe('partial')
    expect(det.mistakeId).toBe('mistake-missing-please')
    const result = toEvaluationResult(det, expectation)
    expect(result.correction).toContain('ください')
  })

  it('routes an unrelated response to unclear (uncertain) rather than marking it wrong outright', () => {
    const result = evaluateResponse(expectation, 'てんきがいいですね', { inputSource: 'typed' })
    expect(result.outcome).toBe('unclear')
    expect(result.matchedIntentId).toBeNull()
  })

  it('recognises a side intent (ask for a recommendation) distinctly from the order intent', () => {
    const result = evaluateResponse(expectation, 'おすすめは何ですか', { inputSource: 'typed' })
    expect(result.outcome).toBe('correct')
    expect(result.matchedIntentId).toBe('it-recommend')
  })

  it('recognises the cancel intent', () => {
    const result = evaluateResponse(expectation, 'やめておきます', { inputSource: 'typed' })
    expect(result.outcome).toBe('correct')
    expect(result.matchedIntentId).toBe('it-cancel-order')
  })

  it('applies conservative fuzzy matching to a minor typo without over-matching unrelated text', () => {
    // one-character slip in a slot form, length-gated fuzzy should still accept
    const typo = evaluateResponse(expectation, 'こーひーをくたさい', { inputSource: 'typed' })
    expect(typo.outcome).not.toBe('unclear')
    const unrelated = evaluateResponse(expectation, 'あいうえおかきくけこさしすせそ', { inputSource: 'typed' })
    expect(unrelated.outcome).toBe('unclear')
  })
})

describe('evaluateResponse — shinjuku-directions n-confirm-turn (multi-slot partial)', () => {
  const node = learnerNode('directions', 'n-confirm-turn')
  const expectation = { intents: node.intents, cancelIntent: node.cancelIntent }

  it('classifies a response with only one of two required slots as partial with the missing slot reported', () => {
    const result = evaluateResponse(expectation, 'まっすぐ行くんですね', { inputSource: 'typed' })
    expect(result.outcome).toBe('partial')
    expect(result.matchedIntentId).toBe('it-confirm')
    expect(result.missingRequiredSlots).toContain('landmark')
  })

  it('classifies a response with both required slots as correct', () => {
    const result = evaluateResponse(expectation, 'まっすぐ行って信号を右ですね', { inputSource: 'typed' })
    expect(result.outcome).toBe('correct')
    expect(result.missingRequiredSlots).toEqual([])
  })

  it('recognises the optional clarify side-intent without affecting the confirm objective', () => {
    const result = evaluateResponse(expectation, '交差点って何ですか', { inputSource: 'typed' })
    expect(result.outcome).toBe('correct')
    expect(result.matchedIntentId).toBe('it-clarify')
  })

  it('flags casual どこ register as a partial mistake suggesting どちら', () => {
    const askNode = learnerNode('directions', 'n-ask-way-turn')
    const askExpectation = { intents: askNode.intents, cancelIntent: askNode.cancelIntent }
    const det = evaluateResponse(askExpectation, '新宿駅の南口はどこですか', { inputSource: 'typed' })
    expect(det.outcome).toBe('partial')
    expect(det.mistakeId).toBe('mistake-doko-register')
  })
})


describe('evaluateResponse — broadened learner phrasing', () => {
  function expectationFor(scenario: 'cafe' | 'directions', nodeId: string) {
    const node = learnerNode(scenario, nodeId)
    return { intents: node.intents, cancelIntent: node.cancelIntent }
  }

  it.each([
    'こんにちは',
    'こんばんは',
    'こんばんわ',
    'おはようございます',
    'どうも',
    'すみません',
    'konnichiwa',
    'konbanwa',
  ])('accepts %s as a greeting', (input) => {
    const result = evaluateResponse(expectationFor('cafe', 'n-greeting-turn'), input, { inputSource: 'typed' })
    expect(result.outcome).toBe('correct')
    expect(result.matchedIntentId).toBe('it-greet')
  })

  it.each([
    'コーヒーをください',
    'ホットコーヒーをお願いします',
    'アイスコーヒーをください',
    'コーヒーを一つください',
    'コーヒーにします',
    'コーヒーをもらえますか',
    'カフェオレをください',
    'お茶をください',
    'こーひーをおねがいします',
    'koohii o kudasai',
  ])('accepts %s as a drink order', (input) => {
    const result = evaluateResponse(expectationFor('cafe', 'n-order'), input, { inputSource: 'typed' })
    expect(result.outcome).toBe('correct')
    expect(result.matchedIntentId).toBe('it-order-drink')
  })

  it.each([
    'レギュラーでお願いします',
    'Mサイズでお願いします',
    'ミディアムでお願いします',
    '普通のでお願いします',
    'ラージでお願いします',
    'スモールで',
  ])('accepts %s as a size choice', (input) => {
    const result = evaluateResponse(expectationFor('cafe', 'n-size-turn'), input, { inputSource: 'typed' })
    expect(result.outcome).toBe('correct')
  })

  it.each([
    'ここで食べます',
    'ここで',
    'イートインでお願いします',
    '店内でいただきます',
  ])('accepts %s as eat-in', (input) => {
    const result = evaluateResponse(expectationFor('cafe', 'n-eatin-turn'), input, { inputSource: 'typed' })
    expect(result.matchedIntentId).toBe('it-eatin')
  })

  it.each([
    '持ち帰りでお願いします',
    'テイクアウトで',
    '持って帰ります',
  ])('accepts %s as takeaway', (input) => {
    const result = evaluateResponse(expectationFor('cafe', 'n-eatin-turn'), input, { inputSource: 'typed' })
    expect(result.matchedIntentId).toBe('it-takeaway')
  })

  it.each([
    'はい、お願いします',
    'はい大丈夫です',
    'カードでお願いします',
    '現金で',
    'それでいいです',
  ])('accepts %s when confirming the order', (input) => {
    const result = evaluateResponse(expectationFor('cafe', 'n-price-turn'), input, { inputSource: 'typed' })
    expect(result.outcome).toBe('correct')
  })

  it.each([
    'すみません',
    'あのう',
    'ちょっといいですか',
    'こんばんは',
    'sumimasen',
  ])('accepts %s when getting a stranger\'s attention', (input) => {
    const result = evaluateResponse(expectationFor('directions', 'n-attention-turn'), input, { inputSource: 'typed' })
    expect(result.outcome).toBe('correct')
  })

  it.each([
    '新宿駅の南口はどちらですか',
    '南口までどう行けばいいですか',
    '新宿駅の南口に行きたいです',
    '南口への行き方を教えてください',
  ])('accepts %s when asking the way', (input) => {
    const result = evaluateResponse(expectationFor('directions', 'n-ask-way-turn'), input, { inputSource: 'typed' })
    expect(result.outcome).toBe('correct')
    expect(result.matchedIntentId).toBe('it-ask-way')
  })

  it.each([
    'まっすぐ行って信号を右ですね',
    'まっすぐ行って交差点を右ですね',
    'まっすぐ進んで信号を右ですね',
    '信号を右に曲がるんですね',
  ])('accepts %s when repeating the directions back', (input) => {
    const result = evaluateResponse(expectationFor('directions', 'n-confirm-turn'), input, { inputSource: 'typed' })
    expect(result.outcome).toBe('correct')
  })

  it('still teaches register rather than silently accepting casual forms', () => {
    const casual = evaluateResponse(expectationFor('directions', 'n-ask-way-turn'), '南口はどっちですか', { inputSource: 'typed' })
    expect(casual.outcome).toBe('partial')
    expect(casual.mistakeId).toBe('mistake-doko-register')

    const bareDrink = evaluateResponse(expectationFor('cafe', 'n-order'), 'コーヒー', { inputSource: 'typed' })
    expect(bareDrink.outcome).toBe('partial')
    expect(bareDrink.mistakeId).toBe('mistake-missing-please')
  })

  it('still routes genuinely unrelated input to unclear rather than guessing', () => {
    const result = evaluateResponse(expectationFor('cafe', 'n-order'), '今日は天気がいいですね', { inputSource: 'typed' })
    expect(result.outcome).toBe('unclear')
  })

  // Regression: a learner typing "kohi" (a very common way to romanise
  // "coffee" without the correct long vowels) converts via the romaji IME to
  // こひ, which previously matched nothing at all — the field showed the
  // response but evaluation came back 'unclear' ("didn't catch that"), even
  // though the intent is unambiguous. Same for "mizu" (water), which wasn't
  // a recognised drink in the scenario at all.
  it.each(['こひ', 'こひい', 'こおひ', 'こうひ'])('recognises the short/imperfect coffee reading %s instead of unclear', (input) => {
    const result = evaluateResponse(expectationFor('cafe', 'n-order'), input, { inputSource: 'typed' })
    expect(result.outcome).not.toBe('unclear')
    expect(result.matchedIntentId).toBe('it-order-drink')
  })

  it.each(['こひください', 'こひをください', 'こおひください'])('accepts the polite short-reading form %s outright', (input) => {
    const result = evaluateResponse(expectationFor('cafe', 'n-order'), input, { inputSource: 'typed' })
    expect(result.outcome).toBe('correct')
  })

  it.each(['みず', '水', 'おみず'])('recognises water (%s) as a real drink order, not unclear', (input) => {
    const result = evaluateResponse(expectationFor('cafe', 'n-order'), input, { inputSource: 'typed' })
    expect(result.outcome).not.toBe('unclear')
    expect(result.matchedIntentId).toBe('it-order-drink')
  })

  it.each(['水をください', 'みずをください', 'お水お願いします'])('accepts a polite water order (%s) as correct with the water slot filled', (input) => {
    const result = evaluateResponse(expectationFor('cafe', 'n-order'), input, { inputSource: 'typed' })
    expect(result.outcome).toBe('correct')
    expect(result.matchedSlots).toContain('drink')
  })
})
