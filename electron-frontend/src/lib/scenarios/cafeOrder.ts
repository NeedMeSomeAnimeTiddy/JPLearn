import type {
  AcceptedPhrase,
  EndNode,
  LearnerNode,
  NpcLine,
  NpcNode,
  ScenarioDefinition,
  SlotValue,
} from '../../features/scenario-tutor/types'

function line(beginner: NpcLine, intermediate: NpcLine): Record<'beginner' | 'intermediate', NpcLine> {
  return { beginner, intermediate }
}

function phrase(ja: string, variants: string[] = []): AcceptedPhrase {
  return { ja, variants }
}

function slotValue(id: string, forms: string[]): SlotValue {
  return { id, forms }
}

const npc = (id: string, next: string, beginner: NpcLine, intermediate: NpcLine): NpcNode => ({
  id,
  kind: 'npc',
  next,
  line: line(beginner, intermediate),
})

const endNode = (id: string, outcome: 'success' | 'cancelled', closing: Record<'beginner' | 'intermediate', NpcLine>): EndNode => ({
  id,
  kind: 'end',
  outcome,
  closingLine: closing,
})

export const CAFE_ORDER_SCENARIO: ScenarioDefinition = {
  id: 'cafe-order',
  version: 1,
  title: 'Order at a Cafe',
  titleJa: 'カフェで注文する',
  description: 'Practice ordering a drink, choosing a size, and deciding eat-in or takeaway at a Japanese cafe.',
  npc: { name: 'Barista', role: 'cafe staff', voiceSpeaker: 'zundamon_normal' },
  objectives: [
    { id: 'obj-greet', label: 'Greet the barista', required: false },
    { id: 'obj-order', label: 'Order a drink', required: true },
    { id: 'obj-size', label: 'Choose a size', required: true },
    { id: 'obj-dine', label: 'Say eat-in or takeaway', required: true },
    { id: 'obj-confirm', label: 'Confirm the order', required: true },
    { id: 'obj-thanks', label: 'Thank the barista', required: false },
  ],
  startNodeId: 'n-greeting',
  nodes: {
    'n-greeting': npc(
      'n-greeting', 'n-greeting-turn',
      { ja: 'いらっしゃいませ！', reading: 'いらっしゃいませ！', en: 'Welcome!' },
      { ja: 'いらっしゃいませ！', reading: 'いらっしゃいませ！', en: 'Welcome!' },
    ),
    'n-greeting-turn': {
      id: 'n-greeting-turn',
      kind: 'learner',
      objectiveIds: ['obj-greet'],
      prompt: 'Say hello to the barista.',
      intents: [
        {
          id: 'it-greet',
          description: 'Greet the barista back',
          acceptedPhrases: [phrase('こんにちは', [
            'こんにちわ', 'どうも', 'どうもこんにちは', 'ども',
            'おはようございます', 'おはよう', 'こんばんは', 'こんばんわ',
            'すみません', 'はじめまして',
          ])],
          branch: { correct: 'n-ask-order' },
        },
      ],
      cancelIntent: {
        id: 'it-cancel-greet',
        description: 'Decide not to order after all',
        acceptedPhrases: [phrase('やめておきます', [
          'けっこうです', 'やっぱりいいです', 'やめます', 'やっぱりやめます',
          'キャンセルします', 'また今度にします',
        ])],
        branch: { correct: 'n-end-cancelled' },
      },
      hints: {
        beginner: [
          { en: 'Greet them back — any normal greeting works here.' },
          { en: 'Say "hello".', ja: 'こんにちは', reading: 'こんにちは', romaji: "kon'nichiwa" },
        ],
        intermediate: [
          { en: 'Return the greeting, then move on to ordering.', ja: 'こんにちは', reading: 'こんにちは', romaji: "kon'nichiwa" },
        ],
      },
      recovery: {
        maxAttempts: 2,
        onIncorrect: line(
          { ja: 'ご注文はお決まりですか？', reading: 'ごちゅうもんはおきまりですか？', en: 'Have you decided on your order?' },
          { ja: 'ご注文はお決まりですか？', reading: 'ごちゅうもんはおきまりですか？', en: 'Have you decided on your order?' },
        ),
        onUnclear: line(
          { ja: 'すみません、もう一度お願いします。', reading: 'すみません、もういちどおねがいします。', en: 'Sorry, could you say that again?' },
          { ja: 'すみません、もう一度よろしいですか？', reading: 'すみません、もういちどよろしいですか？', en: 'Sorry, one more time?' },
        ),
        fallbackAdvance: {
          modelAnswer: 'こんにちは',
          modelAnswerReading: 'こんにちは',
          modelAnswerRomaji: "kon'nichiwa",
          countsAsObjective: false,
          advanceNodeId: 'n-ask-order',
          line: line(
            { ja: '大丈夫ですよ、ご注文からどうぞ。', reading: 'だいじょうぶですよ、ごちゅうもんからどうぞ。', en: "No worries, let's go ahead with your order." },
            { ja: '大丈夫ですよ、ご注文からどうぞ。', reading: 'だいじょうぶですよ、ごちゅうもんからどうぞ。', en: "No worries, let's go ahead with your order." },
          ),
        },
      },
    } satisfies LearnerNode,
    'n-ask-order': npc(
      'n-ask-order', 'n-order',
      { ja: 'ご注文はいかがなさいますか？', reading: 'ごちゅうもんはいかがなさいますか？', en: 'What would you like to order?' },
      { ja: 'ご注文はいかがなさいますか？', reading: 'ごちゅうもんはいかがなさいますか？', en: 'What would you like to order?' },
    ),
    'n-order': {
      id: 'n-order',
      kind: 'learner',
      objectiveIds: ['obj-order'],
      prompt: 'Order a drink.',
      intents: [
        {
          id: 'it-recommend',
          description: 'Ask for a recommendation',
          acceptedPhrases: [phrase('おすすめは何ですか', [
            'おすすめはありますか', 'おすすめですか', 'おすすめを教えてください',
            'おすすめは', '何がおすすめですか', 'なにがおすすめですか',
            'おすすめのものはありますか',
          ])],
          branch: { correct: 'n-recommend' },
          satisfiesObjectives: false,
        },
        {
          id: 'it-order-drink',
          description: 'Order a specific drink politely',
          acceptedPhrases: [
            phrase('コーヒーをください', [
              'コーヒーお願いします', 'コーヒーをお願いします', 'コーヒーください',
              'こーひーをください', 'ホットコーヒーをください', 'アイスコーヒーをください',
              'ホットコーヒーをお願いします', 'アイスコーヒーをお願いします',
              'コーヒーを一つください', 'コーヒーをひとつください', 'コーヒーを一杯ください',
              'コーヒーにします', 'コーヒーがいいです', 'コーヒーをもらえますか',
              'コーヒーをいただけますか', 'コーヒーが欲しいです', 'コーヒーをひとつお願いします',
              'こーひーをおねがいします', 'こーひーおねがいします', 'こーひーをひとつください',
              'こひください', 'こひをください', 'こひお願いします', 'こひおねがいします',
              'こおひください', 'こうひください', 'こうひをください',
            ]),
            phrase('紅茶をください', [
              '紅茶お願いします', '紅茶をお願いします', '紅茶ください', 'こうちゃをください',
              'こうちゃお願いします', '紅茶を一つください', '紅茶にします', '紅茶がいいです',
              '紅茶をもらえますか', 'お茶をください', 'ティーをください',
              'こうちゃをおねがいします', 'おちゃをください', 'こちゃください', 'こちゃをください',
            ]),
            phrase('カフェラテをください', [
              'カフェラテお願いします', 'カフェラテをお願いします', 'カフェラテください',
              'ラテをください', 'ラテお願いします', 'カフェオレをください',
              'カフェラテにします', 'カフェラテがいいです', 'カフェラテをもらえますか',
              'かふぇらてをください', 'かふぇらてをおねがいします', 'らってください', 'らってをください',
            ]),
            phrase('ココアをください', [
              'ココアお願いします', 'ココアをお願いします', 'ココアください',
              'ここあをください', 'ここあをおねがいします', 'ココアにします',
              'ココアがいいです', 'ココアをもらえますか',
            ]),
            phrase('お水をください', [
              '水をください', '水お願いします', '水をお願いします', 'お水お願いします',
              'みずをください', 'みずお願いします', 'おみずをください', '水ください',
              'お水ください', 'お水をお願いします',
            ]),
          ],
          slots: [
            {
              id: 'drink', label: 'Drink', required: true,
              values: [
                slotValue('coffee', [
                  'コーヒー', 'こーひー', 'ホットコーヒー', 'アイスコーヒー',
                  // Common vowel-length slips learners type/say for "coffee" —
                  // real Japanese always has both long vowels (koohii), but a
                  // bare short form still clearly means coffee.
                  'こひ', 'こひい', 'こおひ', 'こうひ', 'こうひい',
                ]),
                slotValue('tea', ['紅茶', 'こうちゃ', 'こちゃ', 'お茶', 'おちゃ', 'ティー']),
                slotValue('latte', ['カフェラテ', 'らて', 'らって', 'ラテ', 'カフェオレ']),
                slotValue('cocoa', ['ココア', 'ここあ', 'ホットココア']),
                slotValue('water', ['水', 'みず', 'お水', 'おみず']),
              ],
            },
          ],
          commonMistakes: [
            {
              id: 'mistake-missing-please',
              match: [
                'コーヒー', 'こーひー', 'こひ', 'こひい', 'こおひ', 'こうひ', 'こうひい',
                '紅茶', 'こうちゃ', 'こちゃ', 'カフェラテ', 'らて', 'らって',
                'ココア', 'ここあ', '水', 'みず', 'お水', 'おみず',
              ],
              classifyAs: 'partial',
              correction: 'コーヒーをください',
              correctionReading: 'こーひーをください',
              correctionRomaji: 'ko-hi- wo kudasai',
              explanation: 'Name the drink, then add ください (or お願いします) to actually ask for it.',
            },
            {
              id: 'mistake-wrong-particle',
              match: ['コーヒーがください', '紅茶がください', 'カフェラテがください', 'ココアがください'],
              classifyAs: 'partial',
              correction: 'コーヒーをください',
              correctionReading: 'こーひーをください',
              correctionRomaji: 'ko-hi- wo kudasai',
              explanation: 'Use を before ください, not が.',
            },
          ],
          branch: { correct: 'n-size', partial: 'n-order-followup' },
        },
      ],
      cancelIntent: {
        id: 'it-cancel-order',
        description: 'Cancel the order',
        acceptedPhrases: [phrase('やめておきます', [
          'けっこうです', 'やっぱりいいです', 'やめます', 'やっぱりやめます',
          'キャンセルします', 'また今度にします',
        ])],
        branch: { correct: 'n-end-cancelled' },
      },
      hints: {
        beginner: [
          { en: 'Name a drink, then ask for it politely with "kudasai" (please give me).' },
          { en: 'The pattern is: [drink] + o kudasai.', ja: '〜をください', reading: '〜をください', romaji: '~ wo kudasai' },
          { en: 'For example, to order a coffee:', ja: 'コーヒーをください', reading: 'こーひーをください', romaji: 'ko-hi- wo kudasai' },
        ],
        intermediate: [
          { en: 'Order with onegaishimasu instead of kudasai for a softer request.', ja: 'コーヒーをお願いします', reading: 'こーひーをおねがいします', romaji: 'ko-hi- wo onegaishimasu' },
        ],
      },
      recovery: {
        maxAttempts: 3,
        onIncorrect: line(
          { ja: 'すみません、もう一度お願いできますか？', reading: 'すみません、もういちどおねがいできますか？', en: 'Sorry, could you say that again?' },
          { ja: 'すみません、もう一度よろしいですか？', reading: 'すみません、もういちどよろしいですか？', en: 'Sorry, one more time?' },
        ),
        onUnclear: line(
          { ja: 'うまく聞き取れませんでした。もう一度お願いします。', reading: 'うまくききとれませんでした。もういちどおねがいします。', en: "I didn't quite catch that. Could you repeat?" },
          { ja: '聞き取れませんでした。もう一度お願いします。', reading: 'ききとれませんでした。もういちどおねがいします。', en: "I couldn't catch that. One more time?" },
        ),
        fallbackAdvance: {
          modelAnswer: 'コーヒーをください',
          modelAnswerReading: 'こーひーをください',
          modelAnswerRomaji: 'ko-hi- wo kudasai',
          countsAsObjective: false,
          advanceNodeId: 'n-size',
          line: line(
            { ja: 'では、コーヒーですね。かしこまりました。', reading: 'では、こーひーですね。かしこまりました。', en: "Alright, I'll get you a coffee." },
            { ja: 'では、コーヒーですね。かしこまりました。', reading: 'では、こーひーですね。かしこまりました。', en: "Alright, I'll get you a coffee." },
          ),
        },
      },
    } satisfies LearnerNode,
    'n-order-followup': npc(
      'n-order-followup', 'n-order',
      { ja: 'お飲み物は何になさいますか？', reading: 'おのみものはなんになさいますか？', en: 'Which drink would you like?' },
      { ja: 'お飲み物は何になさいますか？', reading: 'おのみものはなんになさいますか？', en: 'Which drink would you like?' },
    ),
    'n-recommend': npc(
      'n-recommend', 'n-order',
      { ja: '本日のおすすめはカフェラテです。', reading: 'ほんじつのおすすめはかふぇらてです。', en: "Today's recommendation is the caffe latte." },
      { ja: '本日のおすすめはカフェラテです。', reading: 'ほんじつのおすすめはかふぇらてです。', en: "Today's recommendation is the caffe latte." },
    ),
    'n-size': npc(
      'n-size', 'n-size-turn',
      { ja: 'サイズはいかがなさいますか？', reading: 'さいずはいかがなさいますか？', en: 'What size would you like?' },
      { ja: 'サイズはいかがなさいますか？', reading: 'さいずはいかがなさいますか？', en: 'What size would you like?' },
    ),
    'n-size-turn': {
      id: 'n-size-turn',
      kind: 'learner',
      objectiveIds: ['obj-size'],
      prompt: 'Choose a size.',
      intents: [
        {
          id: 'it-size',
          description: 'Choose a drink size',
          acceptedPhrases: [
            phrase('レギュラーでお願いします', [
              'レギュラーで', 'レギュラーをお願いします', 'レギュラーサイズでお願いします',
              'Mでお願いします', 'Mサイズでお願いします', 'エムサイズでお願いします',
              'ミディアムでお願いします', '普通でお願いします', 'ふつうでお願いします',
              '普通のでお願いします', '中くらいでお願いします', 'レギュラーにします',
              'れぎゅらーでおねがいします', 'ふつうでおねがいします', 'えむさいずでおねがいします',
            ]),
            phrase('小さいのでお願いします', [
              '小さいサイズでお願いします', 'ちいさいのでお願いします',
              'Sでお願いします', 'Sサイズでお願いします', 'エスサイズでお願いします',
              'スモールでお願いします', 'スモールで', '小さいのにします',
              'ちいさいのでおねがいします', 'すもーるでおねがいします',
            ]),
            phrase('大きいのでお願いします', [
              '大きいサイズでお願いします', 'おおきいのでお願いします',
              'Lでお願いします', 'Lサイズでお願いします', 'エルサイズでお願いします',
              'ラージでお願いします', 'ラージで', '大きいのにします',
              'おおきいのでおねがいします', 'らーじでおねがいします',
            ]),
          ],
          slots: [
            {
              id: 'size', label: 'Size', required: true,
              values: [
                slotValue('regular', ['レギュラー', 'Mサイズ', 'エムサイズ', 'ミディアム', '普通', 'ふつう', '中くらい']),
                slotValue('small', ['小さいの', 'ちいさいの', 'Sサイズ', 'エスサイズ', 'スモール', '小さいサイズ']),
                slotValue('large', ['大きいの', 'おおきいの', 'Lサイズ', 'エルサイズ', 'ラージ', '大きいサイズ']),
              ],
            },
          ],
          commonMistakes: [
            {
              id: 'mistake-drink-again',
              match: [
                'コーヒー', 'こーひー', 'こひ', 'こひい', 'こおひ', 'こうひ', 'こうひい',
                '紅茶', 'こうちゃ', 'こちゃ', 'カフェラテ', 'らて', 'らって',
                'ココア', 'ここあ', '水', 'みず', 'お水', 'おみず',
              ],
              classifyAs: 'incorrect',
              correction: 'レギュラーでお願いします',
              correctionReading: 'れぎゅらーでおねがいします',
              correctionRomaji: 'regyura- de onegaishimasu',
              explanation: 'This question is about the size, not the drink again.',
            },
          ],
          branch: { correct: 'n-eatin' },
        },
      ],
      cancelIntent: {
        id: 'it-cancel-size',
        description: 'Cancel the order',
        acceptedPhrases: [phrase('やめておきます', [
          'けっこうです', 'やっぱりいいです', 'やめます', 'やっぱりやめます',
          'キャンセルします', 'また今度にします',
        ])],
        branch: { correct: 'n-end-cancelled' },
      },
      hints: {
        beginner: [
          { en: 'Pick a size: small, regular (M), or large.' },
          { en: 'The pattern is: [size] + de onegaishimasu.', ja: '〜でお願いします', reading: '〜でおねがいします', romaji: '~ de onegaishimasu' },
          { en: 'For example, for a regular size:', ja: 'レギュラーでお願いします', reading: 'れぎゅらーでおねがいします', romaji: 'regyura- de onegaishimasu' },
        ],
        intermediate: [
          { en: 'Tell them the size you want.', ja: 'レギュラーでお願いします', reading: 'れぎゅらーでおねがいします', romaji: 'regyura- de onegaishimasu' },
        ],
      },
      recovery: {
        maxAttempts: 3,
        onIncorrect: line(
          { ja: 'サイズはS、M、Lからお選びいただけます。', reading: 'さいずはえす、えむ、えるからおえらびいただけます。', en: 'You can choose from S, M, or L.' },
          { ja: 'サイズはS、M、Lからお選びいただけます。', reading: 'さいずはえす、えむ、えるからおえらびいただけます。', en: 'You can choose from S, M, or L.' },
        ),
        onUnclear: line(
          { ja: 'もう一度サイズを教えてください。', reading: 'もういちどさいずをおしえてください。', en: 'Could you tell me the size again?' },
          { ja: 'もう一度サイズをお願いします。', reading: 'もういちどさいずをおねがいします。', en: 'The size again, please?' },
        ),
        fallbackAdvance: {
          modelAnswer: 'レギュラーサイズでお願いします',
          modelAnswerReading: 'れぎゅらーさいずでおねがいします',
          modelAnswerRomaji: 'regyura- saizu de onegaishimasu',
          countsAsObjective: false,
          advanceNodeId: 'n-eatin',
          line: line(
            { ja: 'レギュラーサイズですね、かしこまりました。', reading: 'れぎゅらーさいずですね、かしこまりました。', en: "Regular size, got it." },
            { ja: 'レギュラーサイズですね、かしこまりました。', reading: 'れぎゅらーさいずですね、かしこまりました。', en: "Regular size, got it." },
          ),
        },
      },
    } satisfies LearnerNode,
    'n-eatin': npc(
      'n-eatin', 'n-eatin-turn',
      { ja: 'こちらでお召し上がりですか、お持ち帰りですか？', reading: 'こちらでおめしあがりですか、おもちかえりですか？', en: 'For here or to go?' },
      { ja: 'こちらでお召し上がりですか、お持ち帰りですか？', reading: 'こちらでおめしあがりですか、おもちかえりですか？', en: 'For here or to go?' },
    ),
    'n-eatin-turn': {
      id: 'n-eatin-turn',
      kind: 'learner',
      objectiveIds: ['obj-dine'],
      prompt: 'Say eat-in or takeaway.',
      intents: [
        {
          id: 'it-eatin',
          description: 'Choose to eat in',
          acceptedPhrases: [phrase('ここで食べます', [
            '店内でお願いします', 'こちらで', 'こちらでお願いします', '店内で',
            'ここで', 'ここでお願いします', 'ここで飲みます', 'ここで食べていきます',
            'イートインで', 'イートインでお願いします', '店内でいただきます',
            'ここでたべます', 'てんないでおねがいします', 'ここでのみます',
          ])],
          branch: { correct: 'n-eatin-confirm' },
        },
        {
          id: 'it-takeaway',
          description: 'Choose takeaway',
          acceptedPhrases: [phrase('持ち帰りでお願いします', [
            'テイクアウトで', 'テイクアウトでお願いします', '持ち帰りします',
            'お持ち帰りで', 'お持ち帰りでお願いします', '持ち帰りで', '持って帰ります',
            '持ち帰りにします', 'テイクアウトにします',
            'もちかえりでおねがいします', 'もってかえります', 'ていくあうとで',
          ])],
          branch: { correct: 'n-takeaway-confirm' },
        },
      ],
      cancelIntent: {
        id: 'it-cancel-eatin',
        description: 'Cancel the order',
        acceptedPhrases: [phrase('やめておきます', [
          'けっこうです', 'やっぱりいいです', 'やめます', 'やっぱりやめます',
          'キャンセルします', 'また今度にします',
        ])],
        branch: { correct: 'n-end-cancelled' },
      },
      hints: {
        beginner: [
          { en: 'They are asking whether you will eat here or take it away.' },
          { en: 'To eat in, say:', ja: 'ここで食べます', reading: 'ここでたべます', romaji: 'koko de tabemasu' },
          { en: 'To take it away, say:', ja: '持ち帰りでお願いします', reading: 'もちかえりでおねがいします', romaji: 'mochikaeri de onegaishimasu' },
        ],
        intermediate: [
          { en: 'Say whether it is for here or to go.', ja: 'ここで食べます / 持ち帰りでお願いします', reading: 'ここでたべます / もちかえりでおねがいします', romaji: 'koko de tabemasu / mochikaeri de onegaishimasu' },
        ],
      },
      recovery: {
        maxAttempts: 2,
        onIncorrect: line(
          { ja: 'こちらで召し上がりますか、お持ち帰りになりますか？', reading: 'こちらでめしあがりますか、おもちかえりになりますか？', en: 'Will you eat here, or take it to go?' },
          { ja: 'こちらで召し上がりますか、お持ち帰りになりますか？', reading: 'こちらでめしあがりますか、おもちかえりになりますか？', en: 'Will you eat here, or take it to go?' },
        ),
        onUnclear: line(
          { ja: 'すみません、もう一度お願いします。', reading: 'すみません、もういちどおねがいします。', en: 'Sorry, one more time?' },
          { ja: 'すみません、もう一度よろしいですか？', reading: 'すみません、もういちどよろしいですか？', en: 'Sorry, one more time?' },
        ),
        fallbackAdvance: {
          modelAnswer: 'ここで食べます',
          modelAnswerReading: 'ここでたべます',
          modelAnswerRomaji: 'koko de tabemasu',
          countsAsObjective: false,
          advanceNodeId: 'n-eatin-confirm',
          line: line(
            { ja: '店内でお召し上がりですね、かしこまりました。', reading: 'てんないでおめしあがりですね、かしこまりました。', en: "For here then, got it." },
            { ja: '店内でお召し上がりですね、かしこまりました。', reading: 'てんないでおめしあがりですね、かしこまりました。', en: "For here then, got it." },
          ),
        },
      },
    } satisfies LearnerNode,
    'n-eatin-confirm': npc(
      'n-eatin-confirm', 'n-price',
      { ja: 'かしこまりました。店内でお召し上がりですね。', reading: 'かしこまりました。てんないでおめしあがりですね。', en: 'Understood, for here.' },
      { ja: 'かしこまりました。店内でお召し上がりですね。', reading: 'かしこまりました。てんないでおめしあがりですね。', en: 'Understood, for here.' },
    ),
    'n-takeaway-confirm': npc(
      'n-takeaway-confirm', 'n-price',
      { ja: 'かしこまりました。お持ち帰りですね。', reading: 'かしこまりました。おもちかえりですね。', en: 'Understood, to go.' },
      { ja: 'かしこまりました。お持ち帰りですね。', reading: 'かしこまりました。おもちかえりですね。', en: 'Understood, to go.' },
    ),
    'n-price': npc(
      'n-price', 'n-price-turn',
      { ja: '合計は500円になります。よろしいですか？', reading: 'ごうけいはごひゃくえんになります。よろしいですか？', en: 'That will be 500 yen total. Is that okay?' },
      { ja: '合計は500円になります。よろしいですか？', reading: 'ごうけいはごひゃくえんになります。よろしいですか？', en: 'That will be 500 yen total. Is that okay?' },
    ),
    'n-price-turn': {
      id: 'n-price-turn',
      kind: 'learner',
      objectiveIds: ['obj-confirm'],
      prompt: 'Confirm the order.',
      intents: [
        {
          id: 'it-confirm',
          description: 'Confirm the order and pay',
          acceptedPhrases: [phrase('はい、お願いします', [
            'はい', 'はいお願いします', 'はい大丈夫です', 'はいそれでお願いします',
            'それでお願いします', 'それで大丈夫です', 'それでいいです', 'いいです',
            'お願いします', '大丈夫です', 'カードでお願いします', 'カードで',
            '現金でお願いします', '現金で', 'クレジットカードでお願いします',
            'はいおねがいします', 'だいじょうぶです', 'かーどでおねがいします',
            'げんきんでおねがいします', 'それでおねがいします',
          ])],
          branch: { correct: 'n-thanks' },
        },
      ],
      cancelIntent: {
        id: 'it-cancel-price',
        description: 'Cancel the order',
        acceptedPhrases: [phrase('やめておきます', [
          'けっこうです', 'やっぱりいいです', 'やめます', 'やっぱりやめます',
          'キャンセルします', 'また今度にします',
        ])],
        branch: { correct: 'n-end-cancelled' },
      },
      hints: {
        beginner: [
          { en: 'They told you the total and asked if that is okay — just agree.' },
          { en: 'Say yes, please:', ja: 'はい、お願いします', reading: 'はい、おねがいします', romaji: 'hai, onegaishimasu' },
        ],
        intermediate: [
          { en: 'Agree, and mention how you are paying.', ja: 'カードでお願いします', reading: 'かーどでおねがいします', romaji: 'ka-do de onegaishimasu' },
        ],
      },
      recovery: {
        maxAttempts: 2,
        onIncorrect: line(
          { ja: 'よろしければ「はい」とお答えください。', reading: 'よろしければ「はい」とおこたえください。', en: 'Please say "yes" if that works.' },
          { ja: 'よろしければ「はい」とお答えください。', reading: 'よろしければ「はい」とおこたえください。', en: 'Please say "yes" if that works.' },
        ),
        onUnclear: line(
          { ja: 'すみません、もう一度お願いします。', reading: 'すみません、もういちどおねがいします。', en: 'Sorry, one more time?' },
          { ja: 'すみません、もう一度よろしいですか？', reading: 'すみません、もういちどよろしいですか？', en: 'Sorry, one more time?' },
        ),
        fallbackAdvance: {
          modelAnswer: 'はい、お願いします',
          modelAnswerReading: 'はい、おねがいします',
          modelAnswerRomaji: 'hai, onegaishimasu',
          countsAsObjective: false,
          advanceNodeId: 'n-thanks',
          line: line(
            { ja: 'かしこまりました。ありがとうございます。', reading: 'かしこまりました。ありがとうございます。', en: 'Understood, thank you.' },
            { ja: 'かしこまりました。ありがとうございます。', reading: 'かしこまりました。ありがとうございます。', en: 'Understood, thank you.' },
          ),
        },
      },
    } satisfies LearnerNode,
    'n-thanks': npc(
      'n-thanks', 'n-thanks-turn',
      { ja: '少々お待ちください。', reading: 'しょうしょうおまちください。', en: 'Please wait a moment.' },
      { ja: '少々お待ちください。', reading: 'しょうしょうおまちください。', en: 'Please wait a moment.' },
    ),
    'n-thanks-turn': {
      id: 'n-thanks-turn',
      kind: 'learner',
      objectiveIds: ['obj-thanks'],
      prompt: 'Thank the barista (optional).',
      intents: [
        {
          id: 'it-thanks',
          description: 'Thank the barista',
          acceptedPhrases: [phrase('ありがとうございます', [
            'ありがとう', 'ありがとうございました', 'どうもありがとうございます',
            'どうもありがとう', 'どうも',
          ])],
          branch: { correct: 'n-end-success' },
        },
      ],
      cancelIntent: {
        id: 'it-cancel-thanks',
        description: 'Cancel the order',
        acceptedPhrases: [phrase('やめておきます', [
          'けっこうです', 'やっぱりいいです', 'やめます', 'やっぱりやめます',
          'キャンセルします', 'また今度にします',
        ])],
        branch: { correct: 'n-end-cancelled' },
      },
      hints: {
        beginner: [
          { en: 'Thank them to finish the order politely.' },
          { en: 'Say thank you:', ja: 'ありがとうございます', reading: 'ありがとうございます', romaji: 'arigatou gozaimasu' },
        ],
        intermediate: [
          { en: 'Close with a word of thanks.', ja: 'ありがとうございます', reading: 'ありがとうございます', romaji: 'arigatou gozaimasu' },
        ],
      },
      recovery: {
        maxAttempts: 1,
        onIncorrect: line(
          { ja: 'それでは、またのお越しをお待ちしております。', reading: 'それでは、またのおこしをおまちしております。', en: 'We hope to see you again.' },
          { ja: 'それでは、またのお越しをお待ちしております。', reading: 'それでは、またのおこしをおまちしております。', en: 'We hope to see you again.' },
        ),
        onUnclear: line(
          { ja: 'それでは、またのお越しをお待ちしております。', reading: 'それでは、またのおこしをおまちしております。', en: 'We hope to see you again.' },
          { ja: 'それでは、またのお越しをお待ちしております。', reading: 'それでは、またのおこしをおまちしております。', en: 'We hope to see you again.' },
        ),
        fallbackAdvance: {
          modelAnswer: 'ありがとうございます',
          modelAnswerReading: 'ありがとうございます',
          modelAnswerRomaji: 'arigatou gozaimasu',
          countsAsObjective: false,
          advanceNodeId: 'n-end-success',
          line: line(
            { ja: 'こちらこそ、ありがとうございました。', reading: 'こちらこそ、ありがとうございました。', en: 'Thank you as well!' },
            { ja: 'こちらこそ、ありがとうございました。', reading: 'こちらこそ、ありがとうございました。', en: 'Thank you as well!' },
          ),
        },
      },
    } satisfies LearnerNode,
    'n-end-success': endNode('n-end-success', 'success', line(
      { ja: 'またのご来店をお待ちしております。', reading: 'またのごらいてんをおまちしております。', en: 'We look forward to your next visit.' },
      { ja: 'またのご来店をお待ちしております。', reading: 'またのごらいてんをおまちしております。', en: 'We look forward to your next visit.' },
    )),
    'n-end-cancelled': endNode('n-end-cancelled', 'cancelled', line(
      { ja: 'またのご利用をお待ちしております。', reading: 'またのごりようをおまちしております。', en: 'We hope to serve you another time.' },
      { ja: 'またのご利用をお待ちしております。', reading: 'またのごりようをおまちしております。', en: 'We hope to serve you another time.' },
    )),
  },
  vocabulary: [
    { id: 'vocab-coffee', ja: 'コーヒー', reading: 'こーひー', en: 'coffee', nodeIds: ['n-order'] },
    { id: 'vocab-please', ja: 'お願いします', reading: 'おねがいします', en: 'please (requesting something)', nodeIds: ['n-order', 'n-size'] },
    { id: 'vocab-size', ja: 'サイズ', reading: 'さいず', en: 'size', nodeIds: ['n-size', 'n-size-turn'] },
    { id: 'vocab-takeout', ja: '持ち帰り', reading: 'もちかえり', en: 'takeaway / to go', nodeIds: ['n-eatin', 'n-eatin-turn'] },
  ],
  grammarPoints: [
    {
      id: 'grammar-o-kudasai',
      label: '〜をください',
      explanation: 'Use [noun] + を + ください to politely request an item.',
      nodeIds: ['n-order'],
    },
    {
      id: 'grammar-de-onegaishimasu',
      label: '〜でお願いします',
      explanation: 'Use [noun] + で + お願いします to specify a choice, e.g. a size or payment method.',
      nodeIds: ['n-size', 'n-price'],
    },
  ],
  srsCandidates: [
    { id: 'srs-coffee', trigger: { kind: 'vocabulary', vocabId: 'vocab-coffee' }, front: 'コーヒー', back: 'coffee', reading: 'こーひー' },
    { id: 'srs-please', trigger: { kind: 'vocabulary', vocabId: 'vocab-please' }, front: 'お願いします', back: 'please (when requesting something)', reading: 'おねがいします' },
    { id: 'srs-o-kudasai', trigger: { kind: 'grammar', grammarId: 'grammar-o-kudasai' }, front: '〜をください', back: 'Please give me ~ (polite request for an item)' },
    {
      id: 'srs-missing-please',
      trigger: { kind: 'mistake', mistakeId: 'mistake-missing-please' },
      front: 'コーヒーをください',
      back: 'Remember to add ください or お願いします when ordering, not just the item name.',
      reading: 'こーひーをください',
    },
  ],
  suggestedNextSteps: [
    'Practice ordering with different drinks and sizes.',
    'Try the "Ask for Directions in Shinjuku" scenario next.',
  ],
}
