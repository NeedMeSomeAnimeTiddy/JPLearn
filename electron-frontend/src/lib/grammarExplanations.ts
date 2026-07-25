// Inline grammar explanations shown when a grammar drill is answered wrong (issue #25).
//
// Keys are the exact `character` string of a card in the Python `grammar_patterns` deck
// (`domain/decks.py`). The deck disambiguates overloaded patterns with a parenthetical —
// `〜から` (starting point) vs `〜から (reason)`, `〜が` (subject) vs `〜が (contrast)` — so
// lookups match the full string verbatim. Stripping the parenthetical or the `〜` would
// collapse two distinct patterns onto one entry and explain the wrong grammar.
//
// Entries are ordered to match the deck, and cover all 88 of its patterns; a test asserts
// both halves of that correspondence. Cards outside the deck that still carry the `grammar`
// tag (the `sentence_examples` deck does) simply find no entry and render nothing.

export interface GrammarExplanationExample {
  jp: string
  romaji: string
  en: string
}

export interface GrammarExplanation {
  /** Display name of the pattern, e.g. "〜から — reason". */
  name: string
  /** How the pattern is built, in plain language. */
  formation: string
  /** Two short model sentences. */
  examples: readonly [GrammarExplanationExample, GrammarExplanationExample]
  /** The mistake learners actually make with this pattern. */
  commonMistake: string
}

export const GRAMMAR_EXPLANATIONS: Record<string, GrammarExplanation> = {
  // --- Sentence frames and existence ---
  '〜は〜です': {
    name: '〜は〜です — X is Y (polite)',
    formation: 'Topic + は + noun + です. です is the polite copula: it carries politeness, and its past is でした.',
    examples: [
      { jp: 'わたしは たなかです。', romaji: 'watashi wa Tanaka desu.', en: 'I am Tanaka.' },
      { jp: 'これは ほんです。', romaji: 'kore wa hon desu.', en: 'This is a book.' },
    ],
    commonMistake: 'Treating です as a verb "to be" that can follow another verb — いきます です. Only nouns and adjectives take です.',
  },
  '〜は〜ではありません': {
    name: '〜は〜ではありません — X is not Y (polite)',
    formation: 'Topic + は + noun + ではありません. じゃありません and じゃないです are the everyday spoken versions.',
    examples: [
      { jp: 'わたしは がくせいでは ありません。', romaji: 'watashi wa gakusei dewa arimasen.', en: 'I am not a student.' },
      { jp: 'これは わたしの かばんでは ありません。', romaji: 'kore wa watashi no kaban dewa arimasen.', en: 'This is not my bag.' },
    ],
    commonMistake: 'Keeping です in front — がくせいです ではありません. ではありません replaces です rather than following it.',
  },
  '〜は〜ですか': {
    name: '〜は〜ですか — Is X Y?',
    formation: 'Take the statement and add か. Word order does not change, so a question mark is optional in writing.',
    examples: [
      { jp: 'たなかさんは がくせいですか。', romaji: 'Tanaka-san wa gakusei desu ka.', en: 'Is Tanaka a student?' },
      { jp: 'これは あなたの ほんですか。', romaji: 'kore wa anata no hon desu ka.', en: 'Is this your book?' },
    ],
    commonMistake: 'Inverting the word order the way English does. Japanese only appends か — the rest of the sentence stays put.',
  },
  '〜は〜だ': {
    name: '〜は〜だ — X is Y (casual)',
    formation: 'Topic + は + noun + だ. The plain-form copula, used with friends and family; です is its polite counterpart.',
    examples: [
      { jp: 'あれは ぼくの じてんしゃだ。', romaji: 'are wa boku no jitensha da.', en: 'That is my bike.' },
      { jp: 'きょうは やすみだ。', romaji: 'kyou wa yasumi da.', en: 'Today is a day off.' },
    ],
    commonMistake: 'Adding だ after a regular adjective — たかいだ. Those stand on their own: たかい.',
  },
  '〜があります': {
    name: '〜があります — there is (objects)',
    formation: 'Noun + が + あります. Used for objects, plants, and scheduled events. The negative is ありません.',
    examples: [
      { jp: 'つくえの うえに ほんが あります。', romaji: 'tsukue no ue ni hon ga arimasu.', en: 'There is a book on the desk.' },
      { jp: 'あした テストが あります。', romaji: 'ashita tesuto ga arimasu.', en: 'There is a test tomorrow.' },
    ],
    commonMistake: 'Using あります for people or animals. Anything that moves under its own power takes います.',
  },
  '〜がいます': {
    name: '〜がいます — there is (people, animals)',
    formation: 'Noun + が + います. Used for people and animals. The negative is いません.',
    examples: [
      { jp: 'こうえんに こどもが います。', romaji: 'kouen ni kodomo ga imasu.', en: 'There are children in the park.' },
      { jp: 'いえに ねこが います。', romaji: 'ie ni neko ga imasu.', en: 'I have a cat at home.' },
    ],
    commonMistake: 'Marking the thing that exists with を. Both あります and います take が.',
  },

  // --- Particles ---
  '〜は': {
    name: '〜は — topic marker',
    formation: 'Noun + は. Written with the hiragana は but pronounced "wa". Marks what the sentence is about, not necessarily who does the action.',
    examples: [
      { jp: 'わたしは がくせいです。', romaji: 'watashi wa gakusei desu.', en: 'As for me, I am a student.' },
      { jp: 'にほんごは むずかしいです。', romaji: 'nihongo wa muzukashii desu.', en: 'Japanese is difficult.' },
    ],
    commonMistake: 'Using は where が belongs. は presents known or contrasted information; が introduces something new or answers "who/what exactly?".',
  },
  '〜が': {
    name: '〜が — subject marker',
    formation: 'Noun + が. Marks the grammatical subject, and is the particle used with あります/います, 好き, 上手, and question words.',
    examples: [
      { jp: 'だれが きましたか。', romaji: 'dare ga kimashita ka.', en: 'Who came?' },
      { jp: 'ねこが います。', romaji: 'neko ga imasu.', en: 'There is a cat.' },
    ],
    commonMistake: 'A question word can never take は — だれは is always wrong. Use だれが, なにが, どれが.',
  },
  '〜を': {
    name: '〜を — direct object marker',
    formation: 'Noun + を. Marks the thing the verb acts on. Written with the を character, pronounced "o".',
    examples: [
      { jp: 'ごはんを たべます。', romaji: 'gohan o tabemasu.', en: 'I eat rice.' },
      { jp: 'ほんを よみました。', romaji: 'hon o yomimashita.', en: 'I read a book.' },
    ],
    commonMistake: 'Intransitive verbs take が, not を — わたしが おきます, not わたしを おきます.',
  },
  '〜に': {
    name: '〜に — destination, time, existence',
    formation: 'Noun + に. Marks where something exists, where movement arrives, when something happens, or the recipient of an action.',
    examples: [
      { jp: 'がっこうに いきます。', romaji: 'gakkou ni ikimasu.', en: 'I go to school.' },
      { jp: 'しちじに おきます。', romaji: 'shichi-ji ni okimasu.', en: 'I get up at seven.' },
    ],
    commonMistake: 'に marks where something *is*; で marks where something *happens*. いえに います (I am at home) vs いえで たべます (I eat at home).',
  },
  '〜で': {
    name: '〜で — place of action, means',
    formation: 'Noun + で. Marks where an action takes place, or the tool, method, or transport used to do it.',
    examples: [
      { jp: 'としょかんで べんきょうします。', romaji: 'toshokan de benkyou shimasu.', en: 'I study at the library.' },
      { jp: 'でんしゃで いきます。', romaji: 'densha de ikimasu.', en: 'I go by train.' },
    ],
    commonMistake: 'Swapping で and に with movement verbs. Destinations take に or へ — がっこうで いきます is wrong.',
  },
  '〜へ': {
    name: '〜へ — direction',
    formation: 'Noun + へ. Written with the へ character, pronounced "e". Points movement toward somewhere, with less emphasis on arriving than に.',
    examples: [
      { jp: 'とうきょうへ いきます。', romaji: 'toukyou e ikimasu.', en: 'I am heading to Tokyo.' },
      { jp: 'うちへ かえります。', romaji: 'uchi e kaerimasu.', en: 'I am going back home.' },
    ],
    commonMistake: 'Reading へ as "he" when it is a particle. As a particle it is always "e".',
  },
  '〜と': {
    name: '〜と — and, with, quotation',
    formation: 'Noun + と + noun for an exhaustive "and", or noun + と for "together with". It also marks quoted words before 言います and 思います.',
    examples: [
      { jp: 'パンと たまごを かいました。', romaji: 'pan to tamago o kaimashita.', en: 'I bought bread and eggs.' },
      { jp: 'ともだちと いきます。', romaji: 'tomodachi to ikimasu.', en: 'I will go with a friend.' },
    ],
    commonMistake: 'Using と to join adjectives or clauses. It links nouns only — for "and then" between actions, use the て-form.',
  },
  '〜の': {
    name: '〜の — possessive, noun linking',
    formation: 'Noun + の + noun. The first noun modifies the second: owner, origin, type, or material.',
    examples: [
      { jp: 'わたしの ほんです。', romaji: 'watashi no hon desu.', en: 'It is my book.' },
      { jp: 'にほんごの ほんです。', romaji: 'nihongo no hon desu.', en: 'It is a Japanese-language book.' },
    ],
    commonMistake: 'Reversing the order the way English says "book of mine". The modifier always comes first: わたしの ほん.',
  },
  '〜も': {
    name: '〜も — also, too',
    formation: 'Noun + も, replacing は, が, or を rather than stacking with them.',
    examples: [
      { jp: 'わたしも がくせいです。', romaji: 'watashi mo gakusei desu.', en: 'I am a student too.' },
      { jp: 'みずも のみます。', romaji: 'mizu mo nomimasu.', en: 'I drink water as well.' },
    ],
    commonMistake: 'Writing わたしはも or ごはんをも. も takes the place of は/が/を — it does not follow them.',
  },
  '〜から': {
    name: '〜から — from (starting point)',
    formation: 'Noun + から. Marks where or when something starts, usually paired with まで for the endpoint.',
    examples: [
      { jp: 'くじから はたらきます。', romaji: 'ku-ji kara hatarakimasu.', en: 'I work from nine.' },
      { jp: 'とうきょうから きました。', romaji: 'toukyou kara kimashita.', en: 'I came from Tokyo.' },
    ],
    commonMistake: 'This から follows a noun. The から that means "because" follows a whole clause — see 〜から (reason).',
  },
  '〜まで': {
    name: '〜まで — until, as far as',
    formation: 'Noun + まで. Marks the endpoint in time or space, usually paired with から for the starting point.',
    examples: [
      { jp: 'ごじまで はたらきます。', romaji: 'go-ji made hatarakimasu.', en: 'I work until five.' },
      { jp: 'えきまで あるきます。', romaji: 'eki made arukimasu.', en: 'I will walk as far as the station.' },
    ],
    commonMistake: 'Confusing まで with までに. まで means continuously up to a point; までに is a deadline — "by then at the latest".',
  },
  '〜や〜など': {
    name: '〜や〜など — and so on',
    formation: 'Noun + や + noun, optionally closed with など. Lists examples rather than everything, unlike と.',
    examples: [
      { jp: 'りんごや みかんを かいました。', romaji: 'ringo ya mikan o kaimashita.', en: 'I bought apples and oranges, among other things.' },
      { jp: 'ほんや ノートなどが あります。', romaji: 'hon ya nooto nado ga arimasu.', en: 'There are books, notebooks, and so on.' },
    ],
    commonMistake: 'Using や for a complete list. If those are the only items, use と.',
  },
  '〜か〜': {
    name: '〜か〜 — or',
    formation: 'Noun + か + noun. Offers a choice between the listed nouns.',
    examples: [
      { jp: 'コーヒーか おちゃを のみます。', romaji: 'koohii ka ocha o nomimasu.', en: 'I will drink coffee or tea.' },
      { jp: 'でんしゃか バスで いきます。', romaji: 'densha ka basu de ikimasu.', en: 'I will go by train or bus.' },
    ],
    commonMistake: 'Confusing it with sentence-final か, which forms a question. Between two nouns, か means "or".',
  },

  // --- Polite verb forms ---
  '〜ます': {
    name: '〜ます — polite present / future',
    formation: 'Verb stem + ます. Covers both habitual actions and things that have not happened yet; Japanese does not separate present from future here.',
    examples: [
      { jp: 'まいにち べんきょうします。', romaji: 'mainichi benkyou shimasu.', en: 'I study every day.' },
      { jp: 'あした いきます。', romaji: 'ashita ikimasu.', en: 'I will go tomorrow.' },
    ],
    commonMistake: 'Looking for a separate future tense. あした いきます is the future — the time word carries it, not the verb.',
  },
  '〜ません': {
    name: '〜ません — polite negative',
    formation: 'Verb stem + ません. The negative of 〜ます; its past is 〜ませんでした.',
    examples: [
      { jp: 'おさけを のみません。', romaji: 'osake o nomimasen.', en: 'I do not drink alcohol.' },
      { jp: 'あした いきません。', romaji: 'ashita ikimasen.', en: 'I will not go tomorrow.' },
    ],
    commonMistake: 'Building it from the dictionary form — のむません. It attaches to the ます stem: のみません.',
  },
  '〜ました': {
    name: '〜ました — polite past',
    formation: 'Verb stem + ました. The past form of 〜ます; its negative is 〜ませんでした.',
    examples: [
      { jp: 'えいがを みました。', romaji: 'eiga o mimashita.', en: 'I watched a film.' },
      { jp: 'ともだちに あいました。', romaji: 'tomodachi ni aimashita.', en: 'I met a friend.' },
    ],
    commonMistake: 'Forming the past negative as ませんかった. It is ませんでした.',
  },
  '〜ませんでした': {
    name: '〜ませんでした — polite past negative',
    formation: 'Verb stem + ませんでした — ません plus the past copula でした.',
    examples: [
      { jp: 'きのう べんきょうしませんでした。', romaji: 'kinou benkyou shimasen deshita.', en: 'I did not study yesterday.' },
      { jp: 'だれも きませんでした。', romaji: 'dare mo kimasen deshita.', en: 'Nobody came.' },
    ],
    commonMistake: 'Writing ませんかった by analogy with adjectives. Verbs use ませんでした.',
  },
  '〜ますか': {
    name: '〜ますか — polite question',
    formation: 'Verb in 〜ます form + か. Asks about the listener’s action or intention.',
    examples: [
      { jp: 'コーヒーを のみますか。', romaji: 'koohii o nomimasu ka.', en: 'Will you have coffee?' },
      { jp: 'あした きますか。', romaji: 'ashita kimasu ka.', en: 'Are you coming tomorrow?' },
    ],
    commonMistake: 'Reaching for ましょうか to ask what the other person will do. ましょうか offers your own help instead.',
  },
  '〜ましょう': {
    name: '〜ましょう — let’s',
    formation: 'Verb stem + ましょう. Suggests doing something together. Adding か makes it an offer rather than a decision.',
    examples: [
      { jp: 'いっしょに いきましょう。', romaji: 'issho ni ikimashou.', en: 'Let’s go together.' },
      { jp: 'てつだいましょうか。', romaji: 'tetsudaimashou ka.', en: 'Shall I help you?' },
    ],
    commonMistake: 'Using ましょう to ask about the listener’s own plan. For that, 〜ますか is the right form.',
  },
  '〜ましょうか': {
    name: '〜ましょうか — shall I / shall we',
    formation: 'Verb stem + ましょうか. Offers to do something yourself, or floats a suggestion and waits for agreement.',
    examples: [
      { jp: 'まどを あけましょうか。', romaji: 'mado o akemashou ka.', en: 'Shall I open the window?' },
      { jp: 'そろそろ いきましょうか。', romaji: 'sorosoro ikimashou ka.', en: 'Shall we get going?' },
    ],
    commonMistake: 'Using it to ask about the listener’s plans. That is 〜ますか — ましょうか always involves you doing something.',
  },

  // --- て-form requests and permissions ---
  '〜てください': {
    name: '〜てください — please do',
    formation: 'Verb in て-form + ください. A polite request or instruction. The negative is 〜ないでください.',
    examples: [
      { jp: 'まってください。', romaji: 'matte kudasai.', en: 'Please wait.' },
      { jp: 'もういちど いってください。', romaji: 'mou ichido itte kudasai.', en: 'Please say that once more.' },
    ],
    commonMistake: 'Using the ます stem — たべますください. It must be the て-form: たべてください.',
  },
  '〜ています': {
    name: '〜ています — ongoing action or resulting state',
    formation: 'Verb in て-form + います. Either an action in progress, or a state that has continued since it happened.',
    examples: [
      { jp: 'いま たべています。', romaji: 'ima tabete imasu.', en: 'I am eating right now.' },
      { jp: 'とうきょうに すんでいます。', romaji: 'toukyou ni sunde imasu.', en: 'I live in Tokyo.' },
    ],
    commonMistake: 'Reading すんでいます or しっています as "am living/am knowing". With these verbs the form is a present state, not an action in progress.',
  },
  '〜てもいいですか': {
    name: '〜てもいいですか — may I',
    formation: 'Verb in て-form + もいいですか. Asks permission; the statement version is 〜てもいいです.',
    examples: [
      { jp: 'ここに すわっても いいですか。', romaji: 'koko ni suwatte mo ii desu ka.', en: 'May I sit here?' },
      { jp: 'しゃしんを とっても いいですか。', romaji: 'shashin o totte mo ii desu ka.', en: 'May I take a photo?' },
    ],
    commonMistake: 'Using the ます stem — すわりますも いいですか. It must be the て-form: すわっても.',
  },
  '〜てはいけません': {
    name: '〜てはいけません — must not',
    formation: 'Verb in て-form + はいけません. A firm prohibition, common on signs and from someone in authority. Contracts to 〜ちゃいけません in speech.',
    examples: [
      { jp: 'ここで たばこを すっては いけません。', romaji: 'koko de tabako o sutte wa ikemasen.', en: 'You must not smoke here.' },
      { jp: 'はいっては いけません。', romaji: 'haitte wa ikemasen.', en: 'You must not enter.' },
    ],
    commonMistake: 'Confusing it with 〜なければなりません. This forbids someone else from acting; that one is an obligation on you.',
  },
  '〜ないでください': {
    name: '〜ないでください — please don’t',
    formation: 'Verb in ない-form + でください. The negative counterpart of 〜てください.',
    examples: [
      { jp: 'ここに ごみを すてないで ください。', romaji: 'koko ni gomi o sutenai de kudasai.', en: 'Please do not throw rubbish here.' },
      { jp: 'しんぱいしないで ください。', romaji: 'shinpai shinai de kudasai.', en: 'Please do not worry.' },
    ],
    commonMistake: 'Building it from the て-form — たべなくて ください. The ない-form takes で directly: たべないで ください.',
  },

  // --- Adjectives ---
  '〜い (present)': {
    name: '〜い — regular adjective, base form',
    formation: 'The dictionary form already means "is ~". Adding です makes it polite without changing the meaning.',
    examples: [
      { jp: 'この ケーキは おいしいです。', romaji: 'kono keeki wa oishii desu.', en: 'This cake is delicious.' },
      { jp: 'きょうは さむい。', romaji: 'kyou wa samui.', en: 'It is cold today.' },
    ],
    commonMistake: 'Inserting だ before です — おいしいだです. Regular adjectives never take だ.',
  },
  '〜くない': {
    name: '〜くない — regular adjective, negative',
    formation: 'Drop the final い and add くない. たかい → たかくない. Add です for polite speech.',
    examples: [
      { jp: 'この ほんは たかくないです。', romaji: 'kono hon wa takakunai desu.', en: 'This book is not expensive.' },
      { jp: 'さむくないですか。', romaji: 'samukunai desu ka.', en: 'Are you not cold?' },
    ],
    commonMistake: 'Treating いい as regular. Its negative is よくない, built from the older form よい.',
  },
  '〜かった': {
    name: '〜かった — regular adjective, past',
    formation: 'Drop the final い and add かった. たかい → たかかった. Add です for polite speech.',
    examples: [
      { jp: 'えいがは おもしろかったです。', romaji: 'eiga wa omoshirokatta desu.', en: 'The film was interesting.' },
      { jp: 'きのうは さむかったです。', romaji: 'kinou wa samukatta desu.', en: 'Yesterday was cold.' },
    ],
    commonMistake: 'Adding でした on top — おもしろかったでした. The adjective already carries the past tense; です alone is enough.',
  },
  '〜くなかった': {
    name: '〜くなかった — regular adjective, past negative',
    formation: 'Drop the final い and add くなかった. たかい → たかくなかった. Add です for polite speech.',
    examples: [
      { jp: 'えいがは おもしろく なかったです。', romaji: 'eiga wa omoshiroku nakatta desu.', en: 'The film was not interesting.' },
      { jp: 'きのうは さむく なかった。', romaji: 'kinou wa samuku nakatta.', en: 'Yesterday was not cold.' },
    ],
    commonMistake: 'Reaching for でした — おもしろくない でした. The adjective carries the past itself: おもしろくなかったです.',
  },
  '〜な (before noun)': {
    name: '〜な — descriptive adjective before a noun',
    formation: 'Descriptive (na-) adjective + な + noun. The な appears only when the adjective sits directly in front of the noun.',
    examples: [
      { jp: 'きれいな はなですね。', romaji: 'kirei na hana desu ne.', en: 'What a pretty flower.' },
      { jp: 'しずかな まちが すきです。', romaji: 'shizuka na machi ga suki desu.', en: 'I like quiet towns.' },
    ],
    commonMistake: 'Keeping な at the end of a sentence — はなは きれいなです. Drop it there: はなは きれいです.',
  },
  '〜です (na-adj)': {
    name: '〜です — descriptive adjective, polite',
    formation: 'Descriptive (na-) adjective + です. These adjectives have no い to conjugate, so です carries the tense: でした for past.',
    examples: [
      { jp: 'この へやは しずかです。', romaji: 'kono heya wa shizuka desu.', en: 'This room is quiet.' },
      { jp: 'まちは にぎやかでした。', romaji: 'machi wa nigiyaka deshita.', en: 'The town was lively.' },
    ],
    commonMistake: 'Conjugating them like regular adjectives — しずかくない. The negative is しずかではありません / しずかじゃないです.',
  },
  '〜ではありません (na-adj)': {
    name: '〜ではありません — descriptive adjective, polite negative',
    formation: 'Descriptive (na-) adjective + ではありません. じゃありません and じゃないです are the everyday spoken versions.',
    examples: [
      { jp: 'この へやは しずかでは ありません。', romaji: 'kono heya wa shizuka dewa arimasen.', en: 'This room is not quiet.' },
      { jp: 'べんりでは ありません。', romaji: 'benri dewa arimasen.', en: 'It is not convenient.' },
    ],
    commonMistake: 'Conjugating it like a regular adjective — しずかくない. Descriptive adjectives have no い to drop.',
  },

  // --- Question words ---
  'なに/なん': {
    name: 'なに / なん — what',
    formation: 'なに before most particles; なん before です, の, counters, and words starting with た, だ, or な sounds.',
    examples: [
      { jp: 'これは なんですか。', romaji: 'kore wa nan desu ka.', en: 'What is this?' },
      { jp: 'なにを たべますか。', romaji: 'nani o tabemasu ka.', en: 'What will you eat?' },
    ],
    commonMistake: 'Marking it with は — なには. Question words take が or を, never は.',
  },
  'だれ': {
    name: 'だれ — who',
    formation: 'だれ plus the particle that matches its role: が, を, に, or の. どなた is the polite alternative.',
    examples: [
      { jp: 'だれが きましたか。', romaji: 'dare ga kimashita ka.', en: 'Who came?' },
      { jp: 'これは だれの かさですか。', romaji: 'kore wa dare no kasa desu ka.', en: 'Whose umbrella is this?' },
    ],
    commonMistake: 'Saying だれは. As with every question word, use だれが.',
  },
  'どの〜': {
    name: 'どの〜 — which (before a noun)',
    formation: 'どの + noun. It always needs the noun; どれ is the standalone "which one".',
    examples: [
      { jp: 'どの ほんが いいですか。', romaji: 'dono hon ga ii desu ka.', en: 'Which book is good?' },
      { jp: 'どの みちを いきますか。', romaji: 'dono michi o ikimasu ka.', en: 'Which road will you take?' },
    ],
    commonMistake: 'Using どの on its own — どのが いいですか. With no noun after it, the word is どれ.',
  },
  'どんな〜': {
    name: 'どんな〜 — what kind of',
    formation: 'どんな + noun. Asks about character or type, not about picking from a set.',
    examples: [
      { jp: 'どんな おんがくが すきですか。', romaji: 'donna ongaku ga suki desu ka.', en: 'What kind of music do you like?' },
      { jp: 'どんな ひとですか。', romaji: 'donna hito desu ka.', en: 'What sort of person are they?' },
    ],
    commonMistake: 'Using どんな when choosing among visible options. That is どの — どんな asks for a description.',
  },
  'どうやって': {
    name: 'どうやって — how, by what means',
    formation: 'どうやって + verb. Asks about method or route.',
    examples: [
      { jp: 'どうやって いきますか。', romaji: 'dou yatte ikimasu ka.', en: 'How will you get there?' },
      { jp: 'どうやって つくりますか。', romaji: 'dou yatte tsukurimasu ka.', en: 'How do you make it?' },
    ],
    commonMistake: 'Using it to ask "how is it?". That is どうですか — どうやって only asks about method.',
  },
  'なぜ/どうして': {
    name: 'なぜ / どうして — why',
    formation: 'Either word at the head of the question. どうして is the everyday choice; なぜ sounds more formal or written.',
    examples: [
      { jp: 'どうして こなかったんですか。', romaji: 'doushite konakatta n desu ka.', en: 'Why did you not come?' },
      { jp: 'なぜ それが ひつようですか。', romaji: 'naze sore ga hitsuyou desu ka.', en: 'Why is that necessary?' },
    ],
    commonMistake: 'Answering with a bare reason. A why-question is normally answered with 〜から or 〜んです.',
  },

  // --- Connectives ---
  '〜から (reason)': {
    name: '〜から — because',
    formation: 'Full clause + から, then the result clause. The reason comes first, unlike English "because".',
    examples: [
      { jp: 'さむいから、うちに いました。', romaji: 'samui kara, uchi ni imashita.', en: 'Because it was cold, I stayed home.' },
      { jp: 'たかいですから、かいません。', romaji: 'takai desu kara, kaimasen.', en: 'It is expensive, so I will not buy it.' },
    ],
    commonMistake: 'Putting から after the result instead of the reason. Japanese is reason → から → result, the reverse of English order.',
  },
  '〜が (contrast)': {
    name: '〜が — but, however',
    formation: 'Clause + が, then the contrasting clause. Softer than でも and used inside a single sentence.',
    examples: [
      { jp: 'たかいですが、おいしいです。', romaji: 'takai desu ga, oishii desu.', en: 'It is expensive, but it is delicious.' },
      { jp: 'いきましたが、だれも いませんでした。', romaji: 'ikimashita ga, dare mo imasen deshita.', en: 'I went, but nobody was there.' },
    ],
    commonMistake: 'Confusing it with the subject-marking が. This が follows a full clause, not a noun.',
  },
  '〜けど/けれど': {
    name: '〜けど / けれど — but, although',
    formation: 'Clause + けど. Casual and very common in speech; けれど and けれども are progressively more formal, and が is the written equivalent.',
    examples: [
      { jp: 'たかいけど、かいます。', romaji: 'takai kedo, kaimasu.', en: 'It is expensive, but I will buy it.' },
      { jp: 'いきたいけど、じかんが ない。', romaji: 'ikitai kedo, jikan ga nai.', en: 'I want to go, but I have no time.' },
    ],
    commonMistake: 'Attaching it straight to a noun — がくせいけど. A noun needs だ or です first: がくせいだけど.',
  },
  '〜そして': {
    name: 'そして — and then, and also',
    formation: 'Sentence-initial そして, joining two complete sentences.',
    examples: [
      { jp: 'あさ おきました。そして、あさごはんを たべました。', romaji: 'asa okimashita. soshite, asagohan o tabemashita.', en: 'I got up in the morning. Then I ate breakfast.' },
      { jp: 'やすくて、そして おいしいです。', romaji: 'yasukute, soshite oishii desu.', en: 'It is cheap, and also tasty.' },
    ],
    commonMistake: 'Using そして to link nouns. Between nouns the word is と or や — そして joins sentences.',
  },
  '〜でも': {
    name: 'でも — but, however',
    formation: 'Sentence-initial でも, contrasting with what was just said. しかし is its written equivalent.',
    examples: [
      { jp: 'たかいです。でも、かいます。', romaji: 'takai desu. demo, kaimasu.', en: 'It is expensive. But I will buy it.' },
      { jp: 'いきたいです。でも、じかんが ありません。', romaji: 'ikitai desu. demo, jikan ga arimasen.', en: 'I want to go. But I do not have time.' },
    ],
    commonMistake: 'Attaching it to the end of a clause the way けど works — たかいでも. でも starts the following sentence.',
  },

  // --- Common sentence patterns ---
  '〜をください': {
    name: '〜をください — please give me',
    formation: 'Noun + を + ください. For requesting things; requesting an action uses the て-form + ください.',
    examples: [
      { jp: 'みずを ください。', romaji: 'mizu o kudasai.', en: 'Water, please.' },
      { jp: 'これを ください。', romaji: 'kore o kudasai.', en: 'I will take this one, please.' },
    ],
    commonMistake: 'Using it with a verb — たべますください. Actions need the て-form: たべて ください.',
  },
  '〜がほしい': {
    name: '〜がほしい — want (a thing)',
    formation: 'Noun + が + ほしい. Used for objects; for actions use verb stem + たい.',
    examples: [
      { jp: 'あたらしい くつが ほしいです。', romaji: 'atarashii kutsu ga hoshii desu.', en: 'I want new shoes.' },
      { jp: 'じかんが ほしいです。', romaji: 'jikan ga hoshii desu.', en: 'I want time.' },
    ],
    commonMistake: 'Marking the wanted thing with を. ほしい takes が — くつを ほしいです is wrong.',
  },
  '〜たい': {
    name: '〜たい — want to do',
    formation: 'Verb stem + たい, then conjugated as a regular adjective: たくない, たかった, たくなかった.',
    examples: [
      { jp: 'みずが のみたいです。', romaji: 'mizu ga nomitai desu.', en: 'I want to drink water.' },
      { jp: 'にほんに いきたいです。', romaji: 'nihon ni ikitai desu.', en: 'I want to go to Japan.' },
    ],
    commonMistake: 'Using たい to say what someone else wants. For a third person use 〜たがっています instead.',
  },
  '〜に行きます': {
    name: '〜に行きます — go to',
    formation: 'Place + に + 行きます; へ works too. A verb stem before に adds purpose: たべに 行きます, "go to eat".',
    examples: [
      { jp: 'がっこうに いきます。', romaji: 'gakkou ni ikimasu.', en: 'I go to school.' },
      { jp: 'ひるごはんを たべに いきます。', romaji: 'hirugohan o tabe ni ikimasu.', en: 'I am going out to eat lunch.' },
    ],
    commonMistake: 'Marking the destination with で. で is where an action happens, not where you are heading.',
  },
  '〜で行きます': {
    name: '〜で行きます — go by (transport)',
    formation: 'Transport + で + 行きます, where で marks the means.',
    examples: [
      { jp: 'バスで いきます。', romaji: 'basu de ikimasu.', en: 'I will go by bus.' },
      { jp: 'くるまで いきましょう。', romaji: 'kuruma de ikimashou.', en: 'Let’s go by car.' },
    ],
    commonMistake: 'Saying あしで いきます for "on foot". The set phrase is あるいて いきます.',
  },
  'どうぞよろしく': {
    name: 'どうぞよろしく — nice to meet you',
    formation: 'A set phrase said after introducing yourself. どうぞ よろしく おねがいします is the fuller, more polite version.',
    examples: [
      { jp: 'たなかです。どうぞ よろしく。', romaji: 'Tanaka desu. douzo yoroshiku.', en: 'I am Tanaka. Nice to meet you.' },
      { jp: 'よろしく おねがいします。', romaji: 'yoroshiku onegai shimasu.', en: 'I look forward to working with you.' },
    ],
    commonMistake: 'Using the bare どうぞよろしく in formal or business settings, where it sounds too casual. Add おねがいします there.',
  },
  '〜はどうですか': {
    name: '〜はどうですか — how about',
    formation: 'Noun + は + どうですか. Either asks an opinion or makes a suggestion. The past is 〜はどうでしたか.',
    examples: [
      { jp: 'この ふくは どうですか。', romaji: 'kono fuku wa dou desu ka.', en: 'How about these clothes?' },
      { jp: 'おちゃは どうですか。', romaji: 'ocha wa dou desu ka.', en: 'How about some tea?' },
    ],
    commonMistake: 'Using どうやって instead. どうやって asks by what method; どうですか asks how something is or seems.',
  },
  '〜はいくらですか': {
    name: '〜はいくらですか — how much is it',
    formation: 'Noun + は + いくらですか. いくら asks price only.',
    examples: [
      { jp: 'これは いくらですか。', romaji: 'kore wa ikura desu ka.', en: 'How much is this?' },
      { jp: 'ぜんぶで いくらですか。', romaji: 'zenbu de ikura desu ka.', en: 'How much is it altogether?' },
    ],
    commonMistake: 'Using いくら to ask a quantity. "How many?" is いくつ or the matching counter word.',
  },
  '〜はどこですか': {
    name: '〜はどこですか — where is it',
    formation: 'Noun + は + どこですか. どちら is the politer alternative.',
    examples: [
      { jp: 'トイレは どこですか。', romaji: 'toire wa doko desu ka.', en: 'Where is the toilet?' },
      { jp: 'えきは どこですか。', romaji: 'eki wa doko desu ka.', en: 'Where is the station?' },
    ],
    commonMistake: 'Adding に before です — どこにですか. The に is only needed with a verb: どこに いきますか.',
  },
  '〜はなんじですか': {
    name: '〜はなんじですか — what time is it',
    formation: 'Event + は + なんじですか. なんじ asks the hour on the clock; なんぷん asks the minutes.',
    examples: [
      { jp: 'いまは なんじですか。', romaji: 'ima wa nan-ji desu ka.', en: 'What time is it now?' },
      { jp: 'かいぎは なんじですか。', romaji: 'kaigi wa nan-ji desu ka.', en: 'What time is the meeting?' },
    ],
    commonMistake: 'Using なんじかん, which means "how many hours" — a duration, not a clock time.',
  },

  // --- Casual forms and further patterns ---
  '〜ましたか': {
    name: '〜ましたか — polite past question',
    formation: 'Verb stem + ましたか. The past form of 〜ますか.',
    examples: [
      { jp: 'もう たべましたか。', romaji: 'mou tabemashita ka.', en: 'Have you eaten yet?' },
      { jp: 'きのう いきましたか。', romaji: 'kinou ikimashita ka.', en: 'Did you go yesterday?' },
    ],
    commonMistake: 'Answering もう〜ましたか with いいえ、たべませんでした, which says you did not eat at all. For "not yet", say いいえ、まだです.',
  },
  '〜じゃない': {
    name: '〜じゃない — casual negative',
    formation: 'Noun or descriptive adjective + じゃない, the casual contraction of ではない. じゃないです adds politeness.',
    examples: [
      { jp: 'それは わたしのじゃない。', romaji: 'sore wa watashi no ja nai.', en: 'That is not mine.' },
      { jp: 'べんりじゃない。', romaji: 'benri ja nai.', en: 'It is not convenient.' },
    ],
    commonMistake: 'Using it after a regular adjective — たかいじゃない. Those form their own negative: たかくない.',
  },
  '〜だった': {
    name: '〜だった — casual past',
    formation: 'Noun or descriptive adjective + だった, the plain past of です. Its negative is じゃなかった.',
    examples: [
      { jp: 'きのうは やすみだった。', romaji: 'kinou wa yasumi datta.', en: 'Yesterday was a day off.' },
      { jp: 'しずかだった。', romaji: 'shizuka datta.', en: 'It was quiet.' },
    ],
    commonMistake: 'Using it with a regular adjective — さむいだった. That is さむかった.',
  },
  '〜て (connective)': {
    name: '〜て — and then (linking actions)',
    formation: 'Verb in て-form links to the next clause. Only the final verb carries the tense and politeness of the whole sentence.',
    examples: [
      { jp: 'おきて、ごはんを たべました。', romaji: 'okite, gohan o tabemashita.', en: 'I got up and ate.' },
      { jp: 'いえに かえって、ねます。', romaji: 'ie ni kaette, nemasu.', en: 'I will go home and sleep.' },
    ],
    commonMistake: 'Marking tense on every verb — おきました、たべました reads as two separate sentences rather than one linked action.',
  },
  '〜ていません': {
    name: '〜ていません — has not yet / is not doing',
    formation: 'Verb in て-form + いません. Usually means "has not happened yet" rather than "is not happening", and often pairs with まだ.',
    examples: [
      { jp: 'まだ たべて いません。', romaji: 'mada tabete imasen.', en: 'I have not eaten yet.' },
      { jp: 'たなかさんは まだ きて いません。', romaji: 'Tanaka-san wa mada kite imasen.', en: 'Tanaka has not arrived yet.' },
    ],
    commonMistake: 'Using ませんでした for "not yet". たべませんでした means you did not eat at all; たべていません leaves it open.',
  },
  '〜から〜まで': {
    name: '〜から〜まで — from ... to ...',
    formation: 'Start + から + end + まで. Works for both time spans and physical distances.',
    examples: [
      { jp: 'くじから ごじまで はたらきます。', romaji: 'ku-ji kara go-ji made hatarakimasu.', en: 'I work from nine to five.' },
      { jp: 'とうきょうから おおさかまで いきます。', romaji: 'toukyou kara oosaka made ikimasu.', en: 'I will go from Tokyo to Osaka.' },
    ],
    commonMistake: 'Reversing them — までから. から always marks the start and まで the end.',
  },
  '〜ね': {
    name: '〜ね — seeking agreement',
    formation: 'Sentence + ね. Invites the listener to agree with something you assume they already know.',
    examples: [
      { jp: 'きょうは あついですね。', romaji: 'kyou wa atsui desu ne.', en: 'It is hot today, isn’t it?' },
      { jp: 'いい てんきですね。', romaji: 'ii tenki desu ne.', en: 'Lovely weather, isn’t it?' },
    ],
    commonMistake: 'Using ね for information the listener does not have. That is よ — ね assumes shared knowledge.',
  },
  '〜よ': {
    name: '〜よ — telling someone new information',
    formation: 'Sentence + よ. Flags something the listener probably does not know yet.',
    examples: [
      { jp: 'あの みせは やすいですよ。', romaji: 'ano mise wa yasui desu yo.', en: 'That shop is cheap, you know.' },
      { jp: 'あしたは やすみですよ。', romaji: 'ashita wa yasumi desu yo.', en: 'Tomorrow is a day off, just so you know.' },
    ],
    commonMistake: 'Over-using よ with people above you in status — it can sound like you are correcting them.',
  },
  '〜と言います': {
    name: '〜と言います — is called, they say',
    formation: 'Quoted words + と + 言います. Names something, or reports what was said. Often written といいます in kana.',
    examples: [
      { jp: 'わたしは たなかと いいます。', romaji: 'watashi wa Tanaka to iimasu.', en: 'My name is Tanaka.' },
      { jp: 'これは なんと いいますか。', romaji: 'kore wa nan to iimasu ka.', en: 'What is this called?' },
    ],
    commonMistake: 'Marking the quoted part with は or を. A quote always takes と.',
  },
  '〜が好きです': {
    name: '〜が好きです — like',
    formation: 'Noun + が + 好きです. 好き behaves as a descriptive adjective, so the thing liked is marked with が, not を.',
    examples: [
      { jp: 'にほんの おんがくが すきです。', romaji: 'nihon no ongaku ga suki desu.', en: 'I like Japanese music.' },
      { jp: 'なつが すきですか。', romaji: 'natsu ga suki desu ka.', en: 'Do you like summer?' },
    ],
    commonMistake: 'Marking the liked thing with を. 好き is not a verb — おんがくを すきです is wrong.',
  },
  '〜が嫌いです': {
    name: '〜が嫌いです — dislike',
    formation: 'Noun + が + 嫌いです. Like 好き it behaves as a descriptive adjective, so the disliked thing takes が.',
    examples: [
      { jp: 'なっとうが きらいです。', romaji: 'nattou ga kirai desu.', en: 'I dislike natto.' },
      { jp: 'むしが きらいです。', romaji: 'mushi ga kirai desu.', en: 'I do not like insects.' },
    ],
    commonMistake: 'Marking it with を. 嫌い is not a verb — なっとうを きらいです is wrong.',
  },
  '〜がわかります': {
    name: '〜がわかります — understand',
    formation: 'Noun + が + わかります. The thing understood is the subject, so it takes が.',
    examples: [
      { jp: 'にほんごが わかります。', romaji: 'nihongo ga wakarimasu.', en: 'I understand Japanese.' },
      { jp: 'いみが わかりません。', romaji: 'imi ga wakarimasen.', en: 'I do not understand the meaning.' },
    ],
    commonMistake: 'Marking it with を. わかります takes が — にほんごを わかります is wrong.',
  },
  '〜はどうでしたか': {
    name: '〜はどうでしたか — how was it',
    formation: 'Noun + は + どうでしたか. The past form of 〜はどうですか, for asking about a finished experience.',
    examples: [
      { jp: 'りょこうは どうでしたか。', romaji: 'ryokou wa dou deshita ka.', en: 'How was your trip?' },
      { jp: 'テストは どうでしたか。', romaji: 'tesuto wa dou deshita ka.', en: 'How was the test?' },
    ],
    commonMistake: 'Using どうですか for something already over. Once it is finished, use でしたか.',
  },
  '〜てから': {
    name: '〜てから — after doing',
    formation: 'Verb in て-form + から, then the second action. Marks the order more firmly than a plain て-form link.',
    examples: [
      { jp: 'しごとが おわってから、いきます。', romaji: 'shigoto ga owatte kara, ikimasu.', en: 'I will go after work finishes.' },
      { jp: 'てを あらってから たべます。', romaji: 'te o aratte kara tabemasu.', en: 'I will eat after washing my hands.' },
    ],
    commonMistake: 'Confusing it with the から that means "because". Following a て-form, から means "after".',
  },
  '〜ながら': {
    name: '〜ながら — while doing',
    formation: 'Verb stem + ながら. The ながら clause is the background action and the main verb is the primary one.',
    examples: [
      { jp: 'おんがくを ききながら べんきょうします。', romaji: 'ongaku o kikinagara benkyou shimasu.', en: 'I study while listening to music.' },
      { jp: 'あるきながら はなしました。', romaji: 'arukinagara hanashimashita.', en: 'We talked while walking.' },
    ],
    commonMistake: 'Using it for two different people’s actions. Both actions must belong to the same subject.',
  },
  '〜ことができます': {
    name: '〜ことができます — can do, is able to',
    formation: 'Dictionary-form verb + ことが できます. Interchangeable with the potential form, but a little more formal.',
    examples: [
      { jp: 'にほんごを はなす ことが できます。', romaji: 'nihongo o hanasu koto ga dekimasu.', en: 'I can speak Japanese.' },
      { jp: 'ここで はらう ことが できます。', romaji: 'koko de harau koto ga dekimasu.', en: 'You can pay here.' },
    ],
    commonMistake: 'Using the ます stem — はなします ことが できます. It takes the dictionary form: はなす.',
  },
  '〜てみます': {
    name: '〜てみます — try doing',
    formation: 'Verb in て-form + みます. Means giving something a go to see how it turns out.',
    examples: [
      { jp: 'たべて みます。', romaji: 'tabete mimasu.', en: 'I will try eating it.' },
      { jp: 'いちど いって みます。', romaji: 'ichido itte mimasu.', en: 'I will try going once.' },
    ],
    commonMistake: 'Using it for "try hard to". That is 〜ようとします — てみます is only "give it a go".',
  },
  '〜てしまいます': {
    name: '〜てしまいます — end up doing',
    formation: 'Verb in て-form + しまいます. Marks completion, or regret at an unintended result. Contracts to 〜ちゃいます in speech.',
    examples: [
      { jp: 'ぜんぶ たべて しまいました。', romaji: 'zenbu tabete shimaimashita.', en: 'I ended up eating all of it.' },
      { jp: 'かさを わすれて しまいました。', romaji: 'kasa o wasurete shimaimashita.', en: 'I went and forgot my umbrella.' },
    ],
    commonMistake: 'Reading it as a plain past. しまいました adds "completely" or "unfortunately" — it is not simply たべました.',
  },
  '〜たことがあります': {
    name: '〜たことがあります — have done before',
    formation: 'Verb in plain past form + ことが あります. Describes life experience rather than a recent event.',
    examples: [
      { jp: 'にほんに いった ことが あります。', romaji: 'nihon ni itta koto ga arimasu.', en: 'I have been to Japan.' },
      { jp: 'すしを たべた ことが あります。', romaji: 'sushi o tabeta koto ga arimasu.', en: 'I have eaten sushi before.' },
    ],
    commonMistake: 'Using it for something that just happened. For last week’s trip use the plain past — this form means "ever, at some point".',
  },
  '〜と思います': {
    name: '〜と思います — I think that',
    formation: 'Plain-form clause + と おもいます. The clause before と stays plain, never polite.',
    examples: [
      { jp: 'あした あめが ふると おもいます。', romaji: 'ashita ame ga furu to omoimasu.', en: 'I think it will rain tomorrow.' },
      { jp: 'たかいと おもいます。', romaji: 'takai to omoimasu.', en: 'I think it is expensive.' },
    ],
    commonMistake: 'Making the inner clause polite — ふりますと おもいます. Only the final おもいます carries politeness.',
  },
  '〜かもしれません': {
    name: '〜かもしれません — might, maybe',
    formation: 'Plain form + かもしれません. Nouns and descriptive adjectives attach bare, with no だ. Casual: かも.',
    examples: [
      { jp: 'あめが ふるかも しれません。', romaji: 'ame ga furu kamo shiremasen.', en: 'It might rain.' },
      { jp: 'びょうきかも しれません。', romaji: 'byouki kamo shiremasen.', en: 'They might be ill.' },
    ],
    commonMistake: 'Inserting だ — びょうきだかも しれません. Nouns attach directly.',
  },
  '〜なければなりません': {
    name: '〜なければなりません — must, have to',
    formation: 'Take the ない-form, drop ない, add ければ なりません. いく → いかなければ なりません. Casual: 〜なきゃ.',
    examples: [
      { jp: 'あした はやく おきなければ なりません。', romaji: 'ashita hayaku okinakereba narimasen.', en: 'I have to get up early tomorrow.' },
      { jp: 'くすりを のまなければ なりません。', romaji: 'kusuri o nomanakereba narimasen.', en: 'I must take my medicine.' },
    ],
    commonMistake: 'Confusing it with 〜てはいけません. This is an obligation to act; てはいけません forbids acting.',
  },
  '〜てもいいです': {
    name: '〜てもいいです — you may, it is fine to',
    formation: 'Verb in て-form + もいいです. Grants permission; add か to ask for it instead.',
    examples: [
      { jp: 'ここに すわっても いいです。', romaji: 'koko ni suwatte mo ii desu.', en: 'You may sit here.' },
      { jp: 'かえっても いいですよ。', romaji: 'kaette mo ii desu yo.', en: 'You are free to go home.' },
    ],
    commonMistake: 'Confusing it with 〜なくてもいいです, which means "you do not have to". This one gives permission; that one removes an obligation.',
  },
  '〜だけです': {
    name: '〜だけです — only, just',
    formation: 'Noun or clause + だけです. だけ follows whatever it limits, and can replace を or が.',
    examples: [
      { jp: 'みずだけです。', romaji: 'mizu dake desu.', en: 'Just water, thanks.' },
      { jp: 'いちど あった だけです。', romaji: 'ichido atta dake desu.', en: 'I have only met them once.' },
    ],
    commonMistake: 'Placing だけ before the word it limits, as English does with "only". In Japanese it always follows: みずだけ.',
  },
  '〜ようです': {
    name: '〜ようです — seems like, looks like',
    formation: 'Plain form + ようです; nouns take の first. Based on what you observe or infer, not on hearsay.',
    examples: [
      { jp: 'あめが ふるようです。', romaji: 'ame ga furu you desu.', en: 'It looks like it is going to rain.' },
      { jp: 'かぜの ようです。', romaji: 'kaze no you desu.', en: 'It seems to be a cold.' },
    ],
    commonMistake: 'Dropping the の after a noun — かぜようです. Nouns need it: かぜの ようです.',
  },
  '〜たら': {
    name: '〜たら — if, when',
    formation: 'Take the plain past form and add ら. たべた → たべたら. Covers both "if it happens" and "once it happens".',
    examples: [
      { jp: 'あめが ふったら、いきません。', romaji: 'ame ga futtara, ikimasen.', en: 'If it rains, I will not go.' },
      { jp: 'うちに かえったら、でんわします。', romaji: 'uchi ni kaettara, denwa shimasu.', en: 'I will call once I get home.' },
    ],
    commonMistake: 'Building it from the dictionary form — たべるたら. It attaches to the past form: たべたら.',
  },
  '〜てあげます': {
    name: '〜てあげます — do something for someone',
    formation: 'Verb in て-form + あげます. You do the favour. Said directly to the person, it can sound like you expect credit.',
    examples: [
      { jp: 'ともだちに ほんを かして あげました。', romaji: 'tomodachi ni hon o kashite agemashita.', en: 'I lent my friend a book.' },
      { jp: 'てつだって あげます。', romaji: 'tetsudatte agemasu.', en: 'I will help you out.' },
    ],
    commonMistake: 'Using it for a favour done for you. Favours received take くれます or もらいます.',
  },
  '〜てくれます': {
    name: '〜てくれます — someone does something for me',
    formation: 'Verb in て-form + くれます. The other person is the subject and takes が; the favour points toward you.',
    examples: [
      { jp: 'ともだちが てつだって くれました。', romaji: 'tomodachi ga tetsudatte kuremashita.', en: 'My friend helped me out.' },
      { jp: 'せんせいが おしえて くれました。', romaji: 'sensei ga oshiete kuremashita.', en: 'The teacher taught me.' },
    ],
    commonMistake: 'Swapping it with あげます. くれます always points the favour toward you.',
  },
  '〜てもらいます': {
    name: '〜てもらいます — have someone do something for me',
    formation: 'Verb in て-form + もらいます. You are the subject and the person doing the favour takes に. Same event as くれます, told from your side.',
    examples: [
      { jp: 'ともだちに てつだって もらいました。', romaji: 'tomodachi ni tetsudatte moraimashita.', en: 'I had my friend help me.' },
      { jp: 'せんせいに おしえて もらいました。', romaji: 'sensei ni oshiete moraimashita.', en: 'I had the teacher teach me.' },
    ],
    commonMistake: 'Marking the doer with が. With もらいます the doer takes に: ともだちに.',
  },
}

/**
 * Return the explanation for a grammar card, or `null` when the pattern is not covered.
 *
 * Matching is exact against the deck's `character` string, so overloaded patterns that the
 * deck distinguishes by parenthetical stay distinct.
 */
export function lookupGrammarExplanation(character: string | null | undefined): GrammarExplanation | null {
  if (!character) return null
  return GRAMMAR_EXPLANATIONS[character.trim()] ?? null
}
