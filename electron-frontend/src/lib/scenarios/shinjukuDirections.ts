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

export const SHINJUKU_DIRECTIONS_SCENARIO: ScenarioDefinition = {
  id: 'shinjuku-directions',
  version: 1,
  title: 'Ask for Directions in Shinjuku',
  titleJa: '新宿で道を尋ねる',
  description: 'Practice politely getting someone\'s attention, asking for directions, and confirming what they told you.',
  npc: { name: 'Passerby', role: 'stranger near the station', voiceSpeaker: 'zundamon_normal' },
  objectives: [
    { id: 'obj-attention', label: 'Get their attention politely', required: true },
    { id: 'obj-ask', label: 'Ask for directions to your destination', required: true },
    { id: 'obj-confirm', label: 'Confirm the directions by repeating them back', required: true },
    { id: 'obj-clarify', label: 'Ask what a word means (optional)', required: false },
    { id: 'obj-thanks', label: 'Thank them politely', required: true },
  ],
  startNodeId: 'n-start',
  nodes: {
    'n-start': npc(
      'n-start', 'n-attention-turn',
      { ja: '（新宿駅の近くで、人に声をかけます。）', reading: '（しんじゅくえきのちかくで、ひとにこえをかけます。）', en: '(You are near Shinjuku Station and want to ask someone for directions.)' },
      { ja: '（新宿駅の近くで、人に声をかけます。）', reading: '（しんじゅくえきのちかくで、ひとにこえをかけます。）', en: '(You are near Shinjuku Station and want to ask someone for directions.)' },
    ),
    'n-attention-turn': {
      id: 'n-attention-turn',
      kind: 'learner',
      objectiveIds: ['obj-attention'],
      prompt: 'Politely get their attention.',
      intents: [
        {
          id: 'it-attention',
          description: 'Politely get the stranger\'s attention',
          acceptedPhrases: [phrase('すみません', [
            'あの、すみません', 'ちょっとすみません', 'あのう', 'あの',
            'すいません', 'ちょっといいですか', 'すみませんちょっといいですか',
            'ちょっとよろしいですか', 'こんにちは', 'こんにちわ', 'こんばんは', 'こんばんわ',
            'お尋ねします', 'ちょっとお尋ねします',
          ])],
          branch: { correct: 'n-ask-way' },
        },
      ],
      cancelIntent: {
        id: 'it-cancel-attention',
        description: 'Decide not to ask after all',
        acceptedPhrases: [phrase('大丈夫です', [
          'やっぱりいいです', 'けっこうです', '結構です', 'もう大丈夫です',
          'すみません大丈夫です', 'やめておきます', '自分で探します',
        ])],
        branch: { correct: 'n-end-cancelled' },
      },
      hints: {
        beginner: [
          { en: 'Get their attention politely first — one word is enough.' },
          { en: 'Say "excuse me":', ja: 'すみません', reading: 'すみません', romaji: 'sumimasenn' },
        ],
        intermediate: [
          { en: 'Open politely before asking anything.', ja: 'すみません', reading: 'すみません', romaji: 'sumimasenn' },
        ],
      },
      recovery: {
        maxAttempts: 2,
        onIncorrect: line(
          { ja: 'あの、何かご用ですか？', reading: 'あの、なにかごようですか？', en: 'Um, is there something you need?' },
          { ja: 'あの、何かご用ですか？', reading: 'あの、なにかごようですか？', en: 'Um, is there something you need?' },
        ),
        onUnclear: line(
          { ja: 'すみません、もう一度お願いします。', reading: 'すみません、もういちどおねがいします。', en: 'Sorry, could you say that again?' },
          { ja: 'すみません、もう一度よろしいですか？', reading: 'すみません、もういちどよろしいですか？', en: 'Sorry, one more time?' },
        ),
        fallbackAdvance: {
          modelAnswer: 'すみません',
          modelAnswerReading: 'すみません',
          modelAnswerRomaji: 'sumimasenn',
          countsAsObjective: false,
          advanceNodeId: 'n-ask-way',
          line: line(
            { ja: 'はい、何でしょうか？', reading: 'はい、なんでしょうか？', en: 'Yes, what is it?' },
            { ja: 'はい、何でしょうか？', reading: 'はい、なんでしょうか？', en: 'Yes, what is it?' },
          ),
        },
      },
    } satisfies LearnerNode,
    'n-ask-way': npc(
      'n-ask-way', 'n-ask-way-turn',
      { ja: 'はい、何でしょうか？', reading: 'はい、なんでしょうか？', en: 'Yes, what is it?' },
      { ja: 'はい、何でしょうか？', reading: 'はい、なんでしょうか？', en: 'Yes, what is it?' },
    ),
    'n-ask-way-turn': {
      id: 'n-ask-way-turn',
      kind: 'learner',
      objectiveIds: ['obj-ask'],
      prompt: 'Ask the way to JR Shinjuku Station south exit.',
      intents: [
        {
          id: 'it-ask-way',
          description: 'Ask the way to JR Shinjuku Station south exit',
          acceptedPhrases: [
            phrase('新宿駅の南口はどちらですか', [
              'JR新宿駅の南口はどちらですか',
              '新宿駅の南口までの道を教えてください',
              '南口はどちらですか',
              '新宿駅の南口に行きたいです',
              '新宿駅の南口へ行きたいんですが',
              '南口に行きたいのですが',
              '南口までどう行けばいいですか',
              '新宿駅の南口までどう行けばいいですか',
              '南口への行き方を教えてください',
              '新宿駅の南口を探しています',
              'しんじゅくえきのみなみぐちはどちらですか',
              'みなみぐちはどちらですか',
              'みなみぐちまでどういけばいいですか',
            ]),
          ],
          slots: [
            {
              id: 'destination', label: 'Destination', required: true,
              values: [slotValue('south-exit', [
                '南口', 'みなみぐち', '新宿駅', 'しんじゅくえき', '新宿', 'しんじゅく',
                'jr新宿駅', 'サウスゲート',
              ])],
            },
          ],
          commonMistakes: [
            {
              id: 'mistake-doko-register',
              // Casual register: understood, but worth teaching どちら for a
              // stranger. Kept out of acceptedPhrases on purpose so the
              // correction still fires.
              match: ['どこですか', 'どっちですか', 'どこ'],
              classifyAs: 'partial',
              correction: '新宿駅の南口はどちらですか',
              correctionReading: 'しんじゅくえきのみなみぐちはどちらですか',
              correctionRomaji: 'shinjuku eki no minamiguchi ha dochira desu ka',
              explanation: 'どちらですか is more polite than どこですか when asking a stranger.',
            },
          ],
          branch: { correct: 'n-give-directions' },
        },
      ],
      cancelIntent: {
        id: 'it-cancel-ask',
        description: 'Decide not to ask after all',
        acceptedPhrases: [phrase('大丈夫です', [
          'やっぱりいいです', 'けっこうです', '結構です', 'もう大丈夫です',
          'すみません大丈夫です', 'やめておきます', '自分で探します',
        ])],
        branch: { correct: 'n-end-cancelled' },
      },
      hints: {
        beginner: [
          { en: 'Ask where the south exit of Shinjuku Station is.' },
          { en: 'Use dochira (which way) — it is politer than doko to a stranger.', ja: '〜はどちらですか', reading: '〜はどちらですか', romaji: '~ ha dochira desu ka' },
          { en: 'The full question:', ja: '新宿駅の南口はどちらですか', reading: 'しんじゅくえきのみなみぐちはどちらですか', romaji: 'shinjuku eki no minamiguchi ha dochira desu ka' },
        ],
        intermediate: [
          { en: 'Ask using 南口 and どちら.', ja: '新宿駅の南口はどちらですか', reading: 'しんじゅくえきのみなみぐちはどちらですか', romaji: 'shinjuku eki no minamiguchi ha dochira desu ka' },
        ],
      },
      recovery: {
        maxAttempts: 3,
        onIncorrect: line(
          { ja: 'すみません、もう一度お願いできますか？', reading: 'すみません、もういちどおねがいできますか？', en: 'Sorry, could you say that again?' },
          { ja: 'すみません、もう一度よろしいですか？', reading: 'すみません、もういちどよろしいですか？', en: 'Sorry, one more time?' },
        ),
        onUnclear: line(
          { ja: 'うまく聞き取れませんでした。もう一度お願いします。', reading: 'うまくききとれませんでした。もういちどおねがいします。', en: "I didn't quite catch that." },
          { ja: '聞き取れませんでした。もう一度お願いします。', reading: 'ききとれませんでした。もういちどおねがいします。', en: "I couldn't catch that." },
        ),
        fallbackAdvance: {
          modelAnswer: '新宿駅の南口はどちらですか',
          modelAnswerReading: 'しんじゅくえきのみなみぐちはどちらですか',
          modelAnswerRomaji: 'shinjuku eki no minamiguchi ha dochira desu ka',
          countsAsObjective: false,
          advanceNodeId: 'n-give-directions',
          line: line(
            { ja: '南口をお探しなんですね。ご案内しますね。', reading: 'みなみぐちをおさがしなんですね。ごあんないしますね。', en: "Looking for the south exit, got it. Let me guide you." },
            { ja: '南口をお探しなんですね。ご案内しますね。', reading: 'みなみぐちをおさがしなんですね。ごあんないしますね。', en: "Looking for the south exit, got it. Let me guide you." },
          ),
        },
      },
    } satisfies LearnerNode,
    'n-give-directions': npc(
      'n-give-directions', 'n-confirm-turn',
      { ja: 'まっすぐ行って、信号を右に曲がってください。', reading: 'まっすぐいって、しんごうをみぎにまがってください。', en: 'Go straight, then turn right at the traffic light.' },
      { ja: 'まっすぐ行って、信号を右に曲がってください。', reading: 'まっすぐいって、しんごうをみぎにまがってください。', en: 'Go straight, then turn right at the traffic light.' },
    ),
    'n-confirm-turn': {
      id: 'n-confirm-turn',
      kind: 'learner',
      objectiveIds: ['obj-confirm'],
      prompt: 'Repeat the directions back to confirm you understood.',
      intents: [
        {
          id: 'it-confirm',
          description: 'Repeat back the directions to confirm understanding',
          acceptedPhrases: [
            phrase('まっすぐ行って信号を右ですね', [
              '信号を右に曲がるんですね',
              'まっすぐ行って右に曲がるんですね',
              'まっすぐ行って信号を右ですか',
              'まっすぐ行って信号で右ですね',
              'まっすぐ行って交差点を右ですね',
              '信号を右ですね',
              '交差点を右に曲がるんですね',
              'まっすぐ行って右ですね',
              'まっすぐ進んで信号を右ですね',
              'つまりまっすぐ行って信号を右ですね',
              'まっすぐいってしんごうをみぎですね',
              'しんごうをみぎにまがるんですね',
            ]),
          ],
          slots: [
            {
              id: 'direction', label: 'Direction', required: true,
              values: [slotValue('straight-right', ['まっすぐ', 'まっすぐに', '真っ直ぐ', 'まっすく', '右', 'みぎ', '右側', 'みぎがわ'])],
            },
            {
              id: 'landmark', label: 'Landmark', required: true,
              values: [slotValue('traffic-light', ['信号', 'しんごう', '信号機', '交差点', 'こうさてん', '角', 'かど'])],
            },
          ],
          branch: { correct: 'n-give-directions-confirm', partial: 'n-confirm-followup' },
        },
        {
          id: 'it-clarify',
          description: 'Ask what a word means',
          acceptedPhrases: [phrase('交差点って何ですか', [
            '信号って何ですか', '交差点とは何ですか', '交差点ってなんですか',
            'それはどういう意味ですか', 'どういう意味ですか', '意味がわかりません',
            'もう少しゆっくりお願いします', 'もう一度お願いします',
          ])],
          branch: { correct: 'n-clarify-explain' },
          satisfiesObjectives: false,
        },
        {
          id: 'it-early-thanks',
          description: 'Thank them before confirming the directions',
          acceptedPhrases: [phrase('ありがとうございます', [
            'ありがとう', 'ありがとうございました', 'どうもありがとうございます',
            'どうもありがとう', 'どうも', '助かりました',
          ])],
          branch: { correct: 'n-redirect-confirm' },
          satisfiesObjectives: false,
        },
      ],
      cancelIntent: {
        id: 'it-cancel-confirm',
        description: 'Decide not to continue',
        acceptedPhrases: [phrase('大丈夫です', [
          'やっぱりいいです', 'けっこうです', '結構です', 'もう大丈夫です',
          'すみません大丈夫です', 'やめておきます', '自分で探します',
        ])],
        branch: { correct: 'n-end-cancelled' },
      },
      hints: {
        beginner: [
          { en: 'Repeat the directions back so they can confirm you understood.' },
          { en: 'You need both parts: which way, and the landmark.', ja: 'まっすぐ / 信号', reading: 'まっすぐ / しんごう', romaji: 'massugu (straight) / shingou (traffic light)' },
          { en: 'Say it back like this:', ja: 'まっすぐ行って信号を右ですね', reading: 'まっすぐいってしんごうをみぎですね', romaji: 'massugu itte shingou wo migi desu ne' },
        ],
        intermediate: [
          { en: 'Confirm what you heard in your own words.', ja: 'まっすぐ行って信号を右ですね', reading: 'まっすぐいってしんごうをみぎですね', romaji: 'massugu itte shingou wo migi desu ne' },
        ],
      },
      recovery: {
        maxAttempts: 3,
        onIncorrect: line(
          { ja: 'まっすぐ行って、信号を右です。', reading: 'まっすぐいって、しんごうをみぎです。', en: 'Go straight, then right at the traffic light.' },
          { ja: 'まっすぐ行って、信号を右です。', reading: 'まっすぐいって、しんごうをみぎです。', en: 'Go straight, then right at the traffic light.' },
        ),
        onUnclear: line(
          { ja: 'すみません、もう一度お願いします。', reading: 'すみません、もういちどおねがいします。', en: 'Sorry, one more time?' },
          { ja: 'すみません、もう一度よろしいですか？', reading: 'すみません、もういちどよろしいですか？', en: 'Sorry, one more time?' },
        ),
        fallbackAdvance: {
          modelAnswer: 'まっすぐ行って信号を右ですね',
          modelAnswerReading: 'まっすぐいってしんごうをみぎですね',
          modelAnswerRomaji: 'massugu itte shingou wo migi desu ne',
          countsAsObjective: false,
          advanceNodeId: 'n-give-directions-confirm',
          line: line(
            { ja: 'そうです、その通りです。', reading: 'そうです、そのとおりです。', en: "That's right." },
            { ja: 'そうです、その通りです。', reading: 'そうです、そのとおりです。', en: "That's right." },
          ),
        },
      },
    } satisfies LearnerNode,
    'n-confirm-followup': npc(
      'n-confirm-followup', 'n-confirm-turn',
      { ja: '信号のところも覚えていますか？', reading: 'しんごうのところもおぼえていますか？', en: 'Do you also remember the part about the traffic light?' },
      { ja: '信号のところも覚えていますか？', reading: 'しんごうのところもおぼえていますか？', en: 'Do you also remember the part about the traffic light?' },
    ),
    'n-clarify-explain': npc(
      'n-clarify-explain', 'n-confirm-turn',
      { ja: '「交差点」は道が交わる場所のことです。', reading: '「こうさてん」はみちがまじわるばしょのことです。', en: 'An "intersection" is where roads cross.' },
      { ja: '「交差点」は道が交わる場所のことです。', reading: '「こうさてん」はみちがまじわるばしょのことです。', en: 'An "intersection" is where roads cross.' },
    ),
    'n-redirect-confirm': npc(
      'n-redirect-confirm', 'n-confirm-turn',
      { ja: 'その前に、道順を確認していただけますか？', reading: 'そのまえに、みちじゅんをかくにんしていただけますか？', en: 'Before that, could you confirm the directions?' },
      { ja: 'その前に、道順を確認していただけますか？', reading: 'そのまえに、みちじゅんをかくにんしていただけますか？', en: 'Before that, could you confirm the directions?' },
    ),
    'n-give-directions-confirm': npc(
      'n-give-directions-confirm', 'n-thanks-turn',
      { ja: 'そうです、その通りです。', reading: 'そうです、そのとおりです。', en: "That's right." },
      { ja: 'そうです、その通りです。', reading: 'そうです、そのとおりです。', en: "That's right." },
    ),
    'n-thanks-turn': {
      id: 'n-thanks-turn',
      kind: 'learner',
      objectiveIds: ['obj-thanks'],
      prompt: 'Thank them politely.',
      intents: [
        {
          id: 'it-thanks',
          description: 'Thank the stranger politely',
          acceptedPhrases: [phrase('ありがとうございます', [
            'ありがとう', 'ありがとうございました', 'どうもありがとうございます',
            'どうもありがとう', 'どうも', '助かりました',
          ])],
          branch: { correct: 'n-end-success' },
        },
      ],
      cancelIntent: {
        id: 'it-cancel-thanks',
        description: 'Decide not to continue',
        acceptedPhrases: [phrase('大丈夫です', [
          'やっぱりいいです', 'けっこうです', '結構です', 'もう大丈夫です',
          'すみません大丈夫です', 'やめておきます', '自分で探します',
        ])],
        branch: { correct: 'n-end-cancelled' },
      },
      hints: {
        beginner: [
          { en: 'Thank them for helping you.' },
          { en: 'Say thank you:', ja: 'ありがとうございます', reading: 'ありがとうございます', romaji: 'arigatou gozaimasu' },
        ],
        intermediate: [
          { en: 'Close with a word of thanks.', ja: 'ありがとうございます', reading: 'ありがとうございます', romaji: 'arigatou gozaimasu' },
        ],
      },
      recovery: {
        maxAttempts: 2,
        onIncorrect: line(
          { ja: 'いえいえ、気をつけて。', reading: 'いえいえ、きをつけて。', en: 'No problem, take care.' },
          { ja: 'いえいえ、気をつけて。', reading: 'いえいえ、きをつけて。', en: 'No problem, take care.' },
        ),
        onUnclear: line(
          { ja: 'すみません、もう一度お願いします。', reading: 'すみません、もういちどおねがいします。', en: 'Sorry, one more time?' },
          { ja: 'すみません、もう一度よろしいですか？', reading: 'すみません、もういちどよろしいですか？', en: 'Sorry, one more time?' },
        ),
        fallbackAdvance: {
          modelAnswer: 'ありがとうございます',
          modelAnswerReading: 'ありがとうございます',
          modelAnswerRomaji: 'arigatou gozaimasu',
          countsAsObjective: false,
          advanceNodeId: 'n-end-success',
          line: line(
            { ja: 'いえいえ、気をつけて。', reading: 'いえいえ、きをつけて。', en: 'No problem, take care.' },
            { ja: 'いえいえ、気をつけて。', reading: 'いえいえ、きをつけて。', en: 'No problem, take care.' },
          ),
        },
      },
    } satisfies LearnerNode,
    'n-end-success': endNode('n-end-success', 'success', line(
      { ja: '気をつけて行ってらっしゃい。', reading: 'きをつけていってらっしゃい。', en: 'Take care, have a good trip.' },
      { ja: '気をつけて行ってらっしゃい。', reading: 'きをつけていってらっしゃい。', en: 'Take care, have a good trip.' },
    )),
    'n-end-cancelled': endNode('n-end-cancelled', 'cancelled', line(
      { ja: 'また何かあれば聞いてくださいね。', reading: 'またなにかあればきいてくださいね。', en: 'Feel free to ask again if you need to.' },
      { ja: 'また何かあれば聞いてくださいね。', reading: 'またなにかあればきいてくださいね。', en: 'Feel free to ask again if you need to.' },
    )),
  },
  vocabulary: [
    { id: 'vocab-sumimasen', ja: 'すみません', reading: 'すみません', en: 'excuse me', nodeIds: ['n-attention-turn'] },
    { id: 'vocab-minamiguchi', ja: '南口', reading: 'みなみぐち', en: 'south exit', nodeIds: ['n-ask-way-turn'] },
    { id: 'vocab-massugu', ja: 'まっすぐ', reading: 'まっすぐ', en: 'straight ahead', nodeIds: ['n-give-directions', 'n-confirm-turn'] },
    { id: 'vocab-shingou', ja: '信号', reading: 'しんごう', en: 'traffic light', nodeIds: ['n-give-directions', 'n-confirm-turn'] },
  ],
  grammarPoints: [
    {
      id: 'grammar-dochira-desu-ka',
      label: '〜はどちらですか',
      explanation: 'A polite way to ask "where is ~" when speaking to a stranger, more formal than どこですか.',
      nodeIds: ['n-ask-way-turn'],
    },
    {
      id: 'grammar-te-kudasai',
      label: '〜てください',
      explanation: 'Use the te-form of a verb + ください to give a polite instruction, as in 曲がってください (please turn).',
      nodeIds: ['n-give-directions'],
    },
  ],
  srsCandidates: [
    { id: 'srs-minamiguchi', trigger: { kind: 'vocabulary', vocabId: 'vocab-minamiguchi' }, front: '南口', back: 'south exit', reading: 'みなみぐち' },
    { id: 'srs-shingou', trigger: { kind: 'vocabulary', vocabId: 'vocab-shingou' }, front: '信号', back: 'traffic light', reading: 'しんごう' },
    { id: 'srs-dochira', trigger: { kind: 'grammar', grammarId: 'grammar-dochira-desu-ka' }, front: '〜はどちらですか', back: 'A polite way to ask where something is.' },
    {
      id: 'srs-doko-register',
      trigger: { kind: 'mistake', mistakeId: 'mistake-doko-register' },
      front: '新宿駅の南口はどちらですか',
      back: 'Use どちらですか instead of どこですか when speaking politely to a stranger.',
      reading: 'しんじゅくえきのみなみぐちはどちらですか',
    },
  ],
  suggestedNextSteps: [
    'Practice asking for directions to other landmarks.',
    'Review the "Order at a Cafe" scenario for more polite request practice.',
  ],
}
