"""Built-in decks: Hiragana, Katakana, JLPT N5 Kanji, N5 Vocabulary, Grammar Patterns."""

from domain.cards import Card, Deck

# ---------------------------------------------------------------------------
# Hiragana
# ---------------------------------------------------------------------------
_HIRAGANA_DATA = [
    # vowels
    ("あ", "a"), ("い", "i"), ("う", "u"), ("え", "e"), ("お", "o"),
    # k-row
    ("か", "ka"), ("き", "ki"), ("く", "ku"), ("け", "ke"), ("こ", "ko"),
    # s-row
    ("さ", "sa"), ("し", "shi"), ("す", "su"), ("せ", "se"), ("そ", "so"),
    # t-row
    ("た", "ta"), ("ち", "chi"), ("つ", "tsu"), ("て", "te"), ("と", "to"),
    # n-row
    ("な", "na"), ("に", "ni"), ("ぬ", "nu"), ("ね", "ne"), ("の", "no"),
    # h-row
    ("は", "ha"), ("ひ", "hi"), ("ふ", "fu"), ("へ", "he"), ("ほ", "ho"),
    # m-row
    ("ま", "ma"), ("み", "mi"), ("む", "mu"), ("め", "me"), ("も", "mo"),
    # y-row
    ("や", "ya"), ("ゆ", "yu"), ("よ", "yo"),
    # r-row
    ("ら", "ra"), ("り", "ri"), ("る", "ru"), ("れ", "re"), ("ろ", "ro"),
    # w-row
    ("わ", "wa"), ("を", "wo"),
    # n
    ("ん", "n"),
    # dakuten (voiced)
    ("が", "ga"), ("ぎ", "gi"), ("ぐ", "gu"), ("げ", "ge"), ("ご", "go"),
    ("ざ", "za"), ("じ", "ji"), ("ず", "zu"), ("ぜ", "ze"), ("ぞ", "zo"),
    ("だ", "da"), ("ぢ", "di"), ("づ", "du"), ("で", "de"), ("ど", "do"),
    ("ば", "ba"), ("び", "bi"), ("ぶ", "bu"), ("べ", "be"), ("ぼ", "bo"),
    # handakuten (semi-voiced)
    ("ぱ", "pa"), ("ぴ", "pi"), ("ぷ", "pu"), ("ぺ", "pe"), ("ぽ", "po"),
    # digraphs (combinations)
    ("きゃ", "kya"), ("きゅ", "kyu"), ("きょ", "kyo"),
    ("しゃ", "sha"), ("しゅ", "shu"), ("しょ", "sho"),
    ("ちゃ", "cha"), ("ちゅ", "chu"), ("ちょ", "cho"),
    ("にゃ", "nya"), ("にゅ", "nyu"), ("にょ", "nyo"),
    ("ひゃ", "hya"), ("ひゅ", "hyu"), ("ひょ", "hyo"),
    ("みゃ", "mya"), ("みゅ", "myu"), ("みょ", "myo"),
    ("りゃ", "rya"), ("りゅ", "ryu"), ("りょ", "ryo"),
    ("ぎゃ", "gya"), ("ぎゅ", "gyu"), ("ぎょ", "gyo"),
    ("じゃ", "ja"), ("じゅ", "ju"), ("じょ", "jo"),
    ("びゃ", "bya"), ("びゅ", "byu"), ("びょ", "byo"),
    ("ぴゃ", "pya"), ("ぴゅ", "pyu"), ("ぴょ", "pyo"),
]

# ---------------------------------------------------------------------------
# Katakana
# ---------------------------------------------------------------------------
_KATAKANA_DATA = [
    # vowels
    ("ア", "a"), ("イ", "i"), ("ウ", "u"), ("エ", "e"), ("オ", "o"),
    # k-row
    ("カ", "ka"), ("キ", "ki"), ("ク", "ku"), ("ケ", "ke"), ("コ", "ko"),
    # s-row
    ("サ", "sa"), ("シ", "shi"), ("ス", "su"), ("セ", "se"), ("ソ", "so"),
    # t-row
    ("タ", "ta"), ("チ", "chi"), ("ツ", "tsu"), ("テ", "te"), ("ト", "to"),
    # n-row
    ("ナ", "na"), ("ニ", "ni"), ("ヌ", "nu"), ("ネ", "ne"), ("ノ", "no"),
    # h-row
    ("ハ", "ha"), ("ヒ", "hi"), ("フ", "fu"), ("ヘ", "he"), ("ホ", "ho"),
    # m-row
    ("マ", "ma"), ("ミ", "mi"), ("ム", "mu"), ("メ", "me"), ("モ", "mo"),
    # y-row
    ("ヤ", "ya"), ("ユ", "yu"), ("ヨ", "yo"),
    # r-row
    ("ラ", "ra"), ("リ", "ri"), ("ル", "ru"), ("レ", "re"), ("ロ", "ro"),
    # w-row
    ("ワ", "wa"), ("ヲ", "wo"),
    # n
    ("ン", "n"),
    # dakuten
    ("ガ", "ga"), ("ギ", "gi"), ("グ", "gu"), ("ゲ", "ge"), ("ゴ", "go"),
    ("ザ", "za"), ("ジ", "ji"), ("ズ", "zu"), ("ゼ", "ze"), ("ゾ", "zo"),
    ("ダ", "da"), ("ヂ", "di"), ("ヅ", "du"), ("デ", "de"), ("ド", "do"),
    ("バ", "ba"), ("ビ", "bi"), ("ブ", "bu"), ("ベ", "be"), ("ボ", "bo"),
    # handakuten
    ("パ", "pa"), ("ピ", "pi"), ("プ", "pu"), ("ペ", "pe"), ("ポ", "po"),
    # digraphs
    ("キャ", "kya"), ("キュ", "kyu"), ("キョ", "kyo"),
    ("シャ", "sha"), ("シュ", "shu"), ("ショ", "sho"),
    ("チャ", "cha"), ("チュ", "chu"), ("チョ", "cho"),
    ("ニャ", "nya"), ("ニュ", "nyu"), ("ニョ", "nyo"),
    ("ヒャ", "hya"), ("ヒュ", "hyu"), ("ヒョ", "hyo"),
    ("ミャ", "mya"), ("ミュ", "myu"), ("ミョ", "myo"),
    ("リャ", "rya"), ("リュ", "ryu"), ("リョ", "ryo"),
    ("ギャ", "gya"), ("ギュ", "gyu"), ("ギョ", "gyo"),
    ("ジャ", "ja"), ("ジュ", "ju"), ("ジョ", "jo"),
    ("ビャ", "bya"), ("ビュ", "byu"), ("ビョ", "byo"),
    ("ピャ", "pya"), ("ピュ", "pyu"), ("ピョ", "pyo"),
]


def _build_deck(name: str, data: list[tuple[str, str]], tag: str) -> Deck:
    cards = [
        Card(id=i, character=char, romaji=romaji, meaning=romaji, tags=[tag])
        for i, (char, romaji) in enumerate(data)
    ]
    return Deck(name=name, cards=cards)


def _build_deck_with_meaning(
    name: str,
    data: list[tuple[str, str, str]],
    tags: list[str],
) -> Deck:
    cards = [
        Card(id=i, character=char, romaji=reading, meaning=meaning, tags=list(tags))
        for i, (char, reading, meaning) in enumerate(data)
    ]
    return Deck(name=name, cards=cards)


def get_hiragana_deck() -> Deck:
    """Return a fresh :class:`~domain.cards.Deck` containing all Hiragana cards."""
    return _build_deck("Hiragana", _HIRAGANA_DATA, "hiragana")


def get_katakana_deck() -> Deck:
    """Return a fresh :class:`~domain.cards.Deck` containing all Katakana cards."""
    return _build_deck("Katakana", _KATAKANA_DATA, "katakana")


# ---------------------------------------------------------------------------
# JLPT N5 Kanji
# (kanji, primary reading, English meaning)
# ---------------------------------------------------------------------------
_KANJI_N5_DATA: list[tuple[str, str, str]] = [
    # Numbers
    ("一", "ichi", "one"),
    ("二", "ni", "two"),
    ("三", "san", "three"),
    ("四", "yon/shi", "four"),
    ("五", "go", "five"),
    ("六", "roku", "six"),
    ("七", "nana/shichi", "seven"),
    ("八", "hachi", "eight"),
    ("九", "kyuu/ku", "nine"),
    ("十", "juu", "ten"),
    ("百", "hyaku", "hundred"),
    ("千", "sen", "thousand"),
    ("万", "man", "ten thousand"),
    # Time
    ("年", "nen/toshi", "year"),
    ("月", "tsuki/gatsu", "month, moon"),
    ("日", "hi/nichi", "day, sun, Japan"),
    ("時", "toki/ji", "time, hour"),
    ("分", "fun/pun", "minute, part"),
    ("半", "han", "half"),
    # Calendar days
    ("火", "hi/ka", "fire, Tuesday"),
    ("水", "mizu/sui", "water, Wednesday"),
    ("木", "ki/moku", "tree, Thursday"),
    ("金", "kin/kane", "gold, Friday, money"),
    ("土", "tsuchi/do", "earth, Saturday"),
    # Nature
    ("山", "yama/san", "mountain"),
    ("川", "kawa/sen", "river"),
    ("田", "ta/den", "rice field"),
    ("花", "hana/ka", "flower"),
    ("天", "ten/ame", "sky, heaven"),
    ("雨", "ame/u", "rain"),
    # Directions / Position
    ("上", "ue/jou", "up, above"),
    ("下", "shita/ka", "down, below"),
    ("左", "hidari", "left"),
    ("右", "migi", "right"),
    ("前", "mae/zen", "front, before"),
    ("後", "ushiro/go", "back, after"),
    ("東", "higashi/tou", "east"),
    ("西", "nishi/sei", "west"),
    ("南", "minami/nan", "south"),
    ("北", "kita/hoku", "north"),
    ("中", "naka/chuu", "middle, inside"),
    ("外", "soto/gai", "outside"),
    ("内", "uchi/nai", "inside"),
    # Size / Description
    ("大", "oo/dai", "big, large"),
    ("小", "chii/shou", "small, little"),
    ("長", "naga/chou", "long, leader"),
    ("高", "taka/kou", "high, expensive"),
    ("古", "furu/ko", "old (things)"),
    ("新", "atara/shin", "new"),
    ("安", "yasu/an", "cheap, safe"),
    ("白", "shiro/haku", "white"),
    ("赤", "aka/seki", "red"),
    ("青", "ao/sei", "blue, green"),
    # People / Family
    ("人", "hito/jin", "person"),
    ("子", "ko/shi", "child"),
    ("父", "chichi/fu", "father"),
    ("母", "haha/bo", "mother"),
    ("男", "otoko/dan", "man, male"),
    ("女", "onna/jo", "woman, female"),
    ("友", "tomo/yuu", "friend"),
    # Body
    ("目", "me/moku", "eye"),
    ("口", "kuchi/kou", "mouth"),
    ("耳", "mimi/ji", "ear"),
    ("手", "te/shu", "hand"),
    ("足", "ashi/soku", "foot, leg"),
    ("力", "chikara/ryoku", "power, strength"),
    ("気", "ki/ke", "spirit, feeling, energy"),
    # School / Language
    ("学", "gaku/mana", "study, learn"),
    ("校", "kou", "school"),
    ("生", "sei/i", "life, birth, student"),
    ("先", "sen/saki", "ahead, previous, teacher"),
    ("語", "go/kata", "language, word"),
    ("国", "kuni/koku", "country"),
    ("文", "bun/fumi", "sentence, writing"),
    ("字", "ji/aza", "character, letter"),
    ("本", "hon/moto", "book, origin, Japan"),
    # Actions
    ("見", "mi/ken", "see, look"),
    ("聞", "ki/bun", "hear, listen, ask"),
    ("食", "ta/shoku", "eat, food"),
    ("飲", "no/in", "drink"),
    ("来", "ku/rai", "come"),
    ("行", "i/kou", "go"),
    ("帰", "kae/ki", "return home"),
    ("書", "ka/sho", "write"),
    ("読", "yo/doku", "read"),
    ("立", "ta/ritsu", "stand"),
    ("入", "i/nyuu", "enter"),
    ("出", "de/shutsu", "exit, put out"),
    ("休", "yasu/kyuu", "rest, holiday"),
    # Transport / Daily life
    ("電", "den", "electricity"),
    ("車", "kuruma/sha", "car, vehicle"),
]


def get_kanji_n5_deck() -> Deck:
    return _build_deck_with_meaning("Kanji N5", _KANJI_N5_DATA, ["kanji", "n5"])


# ---------------------------------------------------------------------------
# JLPT N5 Vocabulary
# (Japanese, reading, English meaning) — grouped by topic
# ---------------------------------------------------------------------------
_VOCAB_N5_DATA: list[tuple[str, str, str]] = [
    # --- Numbers / Counting ---
    ("ひとつ", "hitotsu", "one (native count)"),
    ("ふたつ", "futatsu", "two (native count)"),
    ("みっつ", "mittsu", "three (native count)"),
    ("よっつ", "yottsu", "four (native count)"),
    ("いつつ", "itsutsu", "five (native count)"),
    ("いくつ", "ikutsu", "how many?"),
    # --- Time / Days ---
    ("きょう", "kyou", "today"),
    ("きのう", "kinou", "yesterday"),
    ("あした", "ashita", "tomorrow"),
    ("あさ", "asa", "morning"),
    ("ひる", "hiru", "noon, daytime"),
    ("よる", "yoru", "night, evening"),
    ("いま", "ima", "now"),
    ("まいにち", "mainichi", "every day"),
    ("まいあさ", "maiasa", "every morning"),
    ("ことし", "kotoshi", "this year"),
    ("らいねん", "rainen", "next year"),
    ("きょねん", "kyonen", "last year"),
    # --- Family ---
    ("おとうさん", "otousan", "father (polite)"),
    ("おかあさん", "okaasan", "mother (polite)"),
    ("おにいさん", "oniisan", "older brother (polite)"),
    ("おねえさん", "oneesan", "older sister (polite)"),
    ("おとうと", "otouto", "younger brother"),
    ("いもうと", "imouto", "younger sister"),
    ("かぞく", "kazoku", "family"),
    ("ともだち", "tomodachi", "friend"),
    # --- Body ---
    ("からだ", "karada", "body"),
    ("あたま", "atama", "head"),
    ("かお", "kao", "face"),
    ("はな", "hana", "nose"),
    ("かみ", "kami", "hair"),
    ("せ/せい", "se/sei", "height, stature"),
    # --- Food / Drink ---
    ("ごはん", "gohan", "rice, meal"),
    ("みず", "mizu", "water"),
    ("おちゃ", "ocha", "green tea"),
    ("こうひー", "koohii", "coffee"),
    ("パン", "pan", "bread"),
    ("たまご", "tamago", "egg"),
    ("さかな", "sakana", "fish"),
    ("にく", "niku", "meat"),
    ("やさい", "yasai", "vegetables"),
    ("くだもの", "kudamono", "fruit"),
    ("のむ", "nomu", "to drink"),
    ("たべる", "taberu", "to eat"),
    ("つくる", "tsukuru", "to make, to cook"),
    # --- School / Study ---
    ("がっこう", "gakkou", "school"),
    ("だいがく", "daigaku", "university"),
    ("せんせい", "sensei", "teacher"),
    ("がくせい", "gakusei", "student"),
    ("きょうしつ", "kyoushitsu", "classroom"),
    ("ほん", "hon", "book"),
    ("ノート", "nooto", "notebook"),
    ("えんぴつ", "enpitsu", "pencil"),
    ("かばん", "kaban", "bag"),
    ("よむ", "yomu", "to read"),
    ("かく", "kaku", "to write"),
    ("べんきょうする", "benkyou suru", "to study"),
    # --- Places ---
    ("うち/いえ", "uchi/ie", "house, home"),
    ("へや", "heya", "room"),
    ("にわ", "niwa", "garden"),
    ("みせ", "mise", "shop, store"),
    ("えき", "eki", "train station"),
    ("びょういん", "byouin", "hospital"),
    ("こうえん", "kouen", "park"),
    ("としょかん", "toshokan", "library"),
    # --- Transport ---
    ("でんしゃ", "densha", "train"),
    ("バス", "basu", "bus"),
    ("じてんしゃ", "jitensha", "bicycle"),
    ("くるま", "kuruma", "car"),
    ("ひこうき", "hikouki", "airplane"),
    ("のる", "noru", "to ride, to get on"),
    ("おりる", "oriru", "to get off"),
    # --- Adjectives ---
    ("おおきい", "ookii", "big"),
    ("ちいさい", "chiisai", "small"),
    ("たかい", "takai", "expensive, tall"),
    ("やすい", "yasui", "cheap"),
    ("あたらしい", "atarashii", "new"),
    ("ふるい", "furui", "old (things)"),
    ("いい/よい", "ii/yoi", "good"),
    ("わるい", "warui", "bad"),
    ("おおい", "ooi", "many, much"),
    ("すくない", "sukunai", "few, little"),
    ("むずかしい", "muzukashii", "difficult"),
    ("やさしい", "yasashii", "easy, kind"),
    ("おもしろい", "omoshiroi", "interesting, fun"),
    ("つまらない", "tsumaranai", "boring"),
    ("あつい", "atsui", "hot"),
    ("さむい", "samui", "cold (weather)"),
    ("つめたい", "tsumetai", "cold (to touch/drink)"),
    # --- Common Verbs ---
    ("みる", "miru", "to see, to watch"),
    ("きく", "kiku", "to hear, to listen, to ask"),
    ("いく", "iku", "to go"),
    ("くる", "kuru", "to come"),
    ("かえる", "kaeru", "to return home"),
    ("いる", "iru", "to be (animate)"),
    ("ある", "aru", "to be, to exist (inanimate)"),
    ("する", "suru", "to do"),
    ("おきる", "okiru", "to wake up, to get up"),
    ("ねる", "neru", "to sleep, to go to bed"),
    ("かう", "kau", "to buy"),
    ("うる", "uru", "to sell"),
    ("はなす", "hanasu", "to speak, to talk"),
    ("わかる", "wakaru", "to understand"),
    ("しる", "shiru", "to know"),
    ("もつ", "motsu", "to hold, to have"),
    ("あう", "au", "to meet"),
    ("まつ", "matsu", "to wait"),
    ("あそぶ", "asobu", "to play, to have fun"),
    ("はたらく", "hataraku", "to work"),
    # --- Common Nouns ---
    ("ひと", "hito", "person"),
    ("こども", "kodomo", "child, children"),
    ("おとこのひと", "otoko no hito", "man"),
    ("おんなのひと", "onna no hito", "woman"),
    ("なまえ", "namae", "name"),
    ("くに", "kuni", "country"),
    ("ことば", "kotoba", "word, language"),
    ("にほんご", "nihongo", "Japanese language"),
    ("えいご", "eigo", "English language"),
    ("てんき", "tenki", "weather"),
    ("かぜ", "kaze", "wind"),
    ("あめ", "ame", "rain"),
    ("ゆき", "yuki", "snow"),
    ("そら", "sora", "sky"),
    ("うみ", "umi", "sea, ocean"),
    ("やま", "yama", "mountain"),
    ("かわ", "kawa", "river"),
    ("まち", "machi", "town, city"),
    ("とき", "toki", "time, moment"),
    ("もの", "mono", "thing (tangible)"),
    ("こと", "koto", "thing (abstract)"),
]


def get_vocab_n5_deck() -> Deck:
    return _build_deck_with_meaning("Vocabulary N5", _VOCAB_N5_DATA, ["vocab", "n5"])


# ---------------------------------------------------------------------------
# Grammar Patterns
# (pattern, romanized pattern, English explanation)
# ---------------------------------------------------------------------------
_GRAMMAR_PATTERNS_DATA: list[tuple[str, str, str]] = [
    # --- Copula / Existence ---
    ("〜は〜です", "〜 wa 〜 desu", "X is Y (polite copula)"),
    ("〜は〜ではありません", "〜 wa 〜 dewa arimasen", "X is not Y (polite negative)"),
    ("〜は〜ですか", "〜 wa 〜 desu ka", "Is X Y? (polite question)"),
    ("〜は〜だ", "〜 wa 〜 da", "X is Y (plain copula)"),
    ("〜があります", "〜 ga arimasu", "There is/are 〜 (inanimate, polite)"),
    ("〜がいます", "〜 ga imasu", "There is/are 〜 (animate, polite)"),
    # --- Core particles ---
    ("〜は", "〜 wa", "Topic marker particle"),
    ("〜が", "〜 ga", "Subject marker / emphasis particle"),
    ("〜を", "〜 wo", "Direct object marker particle"),
    ("〜に", "〜 ni", "Location (existence) / direction / time particle"),
    ("〜で", "〜 de", "Location (action) / means / method particle"),
    ("〜へ", "〜 e", "Direction particle (toward)"),
    ("〜と", "〜 to", "And (nouns) / with / quotation particle"),
    ("〜の", "〜 no", "Possessive / noun-modifier particle"),
    ("〜も", "〜 mo", "Also, too (inclusive particle)"),
    ("〜から", "〜 kara", "From 〜 (starting point)"),
    ("〜まで", "〜 made", "Until / up to 〜 (ending point)"),
    ("〜や〜など", "〜 ya 〜 nado", "〜 and 〜, etc. (non-exhaustive list)"),
    ("〜か〜", "〜 ka 〜", "Or (between nouns)"),
    # --- Verb forms ---
    ("〜ます", "〜 masu", "Polite present / future affirmative verb"),
    ("〜ません", "〜 masen", "Polite present / future negative verb"),
    ("〜ました", "〜 mashita", "Polite past affirmative verb"),
    ("〜ませんでした", "〜 masen deshita", "Polite past negative verb"),
    ("〜ますか", "〜 masu ka", "Polite verb question"),
    ("〜ましょう", "〜 mashou", "Let's 〜 / shall we 〜 (volitional)"),
    ("〜ましょうか", "〜 mashou ka", "Shall I/we 〜? (offer/suggestion)"),
    ("〜てください", "〜 te kudasai", "Please do 〜 (polite request)"),
    ("〜ています", "〜 te imasu", "Is doing 〜 (ongoing action / state)"),
    ("〜てもいいですか", "〜 te mo ii desu ka", "May I 〜? (asking permission)"),
    ("〜てはいけません", "〜 te wa ikemasen", "Must not 〜 (prohibition)"),
    ("〜ないでください", "〜 nai de kudasai", "Please don't 〜"),
    # --- i-Adjectives ---
    ("〜い (present)", "〜 i (jisho-kei)", "i-adjective dictionary form (e.g. たかい)"),
    ("〜くない", "〜 ku nai", "i-adjective negative (e.g. たかくない)"),
    ("〜かった", "〜 katta", "i-adjective past (e.g. たかかった)"),
    ("〜くなかった", "〜 ku nakatta", "i-adjective past negative"),
    # --- na-Adjectives ---
    ("〜な (before noun)", "〜 na (noun)", "na-adjective attributive form (e.g. きれいな)"),
    ("〜です (na-adj)", "〜 desu", "na-adjective polite present (e.g. きれいです)"),
    ("〜ではありません (na-adj)", "〜 dewa arimasen", "na-adjective polite negative"),
    # --- Question words ---
    ("なに/なん", "nani/nan", "What?"),
    ("どこ", "doko", "Where?"),
    ("だれ", "dare", "Who?"),
    ("いつ", "itsu", "When?"),
    ("どれ", "dore", "Which one?"),
    ("どの〜", "dono 〜", "Which 〜? (before noun)"),
    ("どんな〜", "donna 〜", "What kind of 〜?"),
    ("いくら", "ikura", "How much? (price)"),
    ("いくつ", "ikutsu", "How many? / How old?"),
    ("どうやって", "dou yatte", "How? By what means?"),
    ("なぜ/どうして", "naze/doushite", "Why?"),
    # --- Connectives / Sentence linking ---
    ("〜から (reason)", "〜 kara", "Because 〜 (reason clause)"),
    ("〜が (contrast)", "〜 ga", "But, however (mild contrast)"),
    ("〜けど/けれど", "〜 kedo/keredo", "But, although (softer contrast)"),
    ("〜そして", "soshite", "And then, and also"),
    ("〜でも", "demo", "But, however (sentence-initial)"),
    # --- Common sentence patterns ---
    ("〜をください", "〜 wo kudasai", "Please give me 〜"),
    ("〜がほしい", "〜 ga hoshii", "I want 〜 (noun)"),
    ("〜たい", "〜 tai", "I want to 〜 (verb stem + たい)"),
    ("〜に行きます", "〜 ni ikimasu", "Go to 〜 (destination)"),
    ("〜で行きます", "〜 de ikimasu", "Go by 〜 (means of transport)"),
    ("どうぞよろしく", "douzo yoroshiku", "Nice to meet you / please treat me well"),
    ("〜はどうですか", "〜 wa dou desu ka", "How about 〜? / How is 〜?"),
    ("〜はいくらですか", "〜 wa ikura desu ka", "How much is 〜?"),
    ("〜はどこですか", "〜 wa doko desu ka", "Where is 〜?"),
    ("〜はなんじですか", "〜 wa nanji desu ka", "What time is 〜?"),
]


def get_grammar_patterns_deck() -> Deck:
    return _build_deck_with_meaning(
        "Grammar Patterns", _GRAMMAR_PATTERNS_DATA, ["grammar", "n5"]
    )


#: Registry mapping deck slug → factory function for all built-in decks.
ALL_DECKS = {
    "hiragana": get_hiragana_deck,
    "katakana": get_katakana_deck,
    "kanji_n5": get_kanji_n5_deck,
    "vocab_n5": get_vocab_n5_deck,
    "grammar_patterns": get_grammar_patterns_deck,
}
