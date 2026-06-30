"""Built-in decks: Hiragana, Katakana, JLPT Kanji, JLPT Vocabulary, Grammar Patterns, Sentence Examples, Conjugation Training."""

from types import ModuleType
from typing import cast

from domain.cards import Card, Deck

_external_deck_data: ModuleType | None
try:
    import domain.external_deck_data as _external_deck_data_module

    _external_deck_data = _external_deck_data_module
except ImportError:
    _external_deck_data = None

_ExternalRow = tuple[str, str, str]
_EMPTY_EXTERNAL_DATA: list[_ExternalRow] = []
_VOCAB_LEVEL_LIMITS: dict[str, int] = {
    "n5": 50,
    "n4": 150,
    "n3": 300,
    "n2": 600,
    "n1": 800,
}

if _external_deck_data is None:
    VOCAB_N5_EXTERNAL_DATA: list[_ExternalRow] = _EMPTY_EXTERNAL_DATA
    VOCAB_N4_EXTERNAL_DATA: list[_ExternalRow] = _EMPTY_EXTERNAL_DATA
    VOCAB_N3_EXTERNAL_DATA: list[_ExternalRow] = _EMPTY_EXTERNAL_DATA
    VOCAB_N2_EXTERNAL_DATA: list[_ExternalRow] = _EMPTY_EXTERNAL_DATA
    VOCAB_N1_EXTERNAL_DATA: list[_ExternalRow] = _EMPTY_EXTERNAL_DATA
    GRAMMAR_PATTERNS_EXTERNAL_DATA: list[_ExternalRow] = _EMPTY_EXTERNAL_DATA
    SENTENCE_EXAMPLES_EXTERNAL_DATA: list[_ExternalRow] = _EMPTY_EXTERNAL_DATA
    CONJUGATION_TRAINING_EXTERNAL_DATA: list[_ExternalRow] = _EMPTY_EXTERNAL_DATA
    KANJI_N5_EXTERNAL_DATA: list[_ExternalRow] = _EMPTY_EXTERNAL_DATA
    KANJI_N4_EXTERNAL_DATA: list[_ExternalRow] = _EMPTY_EXTERNAL_DATA
    KANJI_N3_EXTERNAL_DATA: list[_ExternalRow] = _EMPTY_EXTERNAL_DATA
    KANJI_N2_EXTERNAL_DATA: list[_ExternalRow] = _EMPTY_EXTERNAL_DATA
    KANJI_N1_EXTERNAL_DATA: list[_ExternalRow] = _EMPTY_EXTERNAL_DATA
else:
    VOCAB_N5_EXTERNAL_DATA = cast(
        list[_ExternalRow], _external_deck_data.VOCAB_N5_EXTERNAL_DATA
    )
    VOCAB_N4_EXTERNAL_DATA = cast(
        list[_ExternalRow], getattr(_external_deck_data, "VOCAB_N4_EXTERNAL_DATA", _EMPTY_EXTERNAL_DATA)
    )
    VOCAB_N3_EXTERNAL_DATA = cast(
        list[_ExternalRow], getattr(_external_deck_data, "VOCAB_N3_EXTERNAL_DATA", _EMPTY_EXTERNAL_DATA)
    )
    VOCAB_N2_EXTERNAL_DATA = cast(
        list[_ExternalRow], getattr(_external_deck_data, "VOCAB_N2_EXTERNAL_DATA", _EMPTY_EXTERNAL_DATA)
    )
    VOCAB_N1_EXTERNAL_DATA = cast(
        list[_ExternalRow], getattr(_external_deck_data, "VOCAB_N1_EXTERNAL_DATA", _EMPTY_EXTERNAL_DATA)
    )
    GRAMMAR_PATTERNS_EXTERNAL_DATA = cast(
        list[_ExternalRow], _external_deck_data.GRAMMAR_PATTERNS_EXTERNAL_DATA
    )
    SENTENCE_EXAMPLES_EXTERNAL_DATA = cast(
        list[_ExternalRow],
        getattr(_external_deck_data, "SENTENCE_EXAMPLES_EXTERNAL_DATA", _EMPTY_EXTERNAL_DATA),
    )
    CONJUGATION_TRAINING_EXTERNAL_DATA = cast(
        list[_ExternalRow],
        getattr(_external_deck_data, "CONJUGATION_TRAINING_EXTERNAL_DATA", _EMPTY_EXTERNAL_DATA),
    )
    KANJI_N5_EXTERNAL_DATA = cast(
        list[_ExternalRow], getattr(_external_deck_data, "KANJI_N5_EXTERNAL_DATA", _EMPTY_EXTERNAL_DATA)
    )
    KANJI_N4_EXTERNAL_DATA = cast(
        list[_ExternalRow], getattr(_external_deck_data, "KANJI_N4_EXTERNAL_DATA", _EMPTY_EXTERNAL_DATA)
    )
    KANJI_N3_EXTERNAL_DATA = cast(
        list[_ExternalRow], getattr(_external_deck_data, "KANJI_N3_EXTERNAL_DATA", _EMPTY_EXTERNAL_DATA)
    )
    KANJI_N2_EXTERNAL_DATA = cast(
        list[_ExternalRow], getattr(_external_deck_data, "KANJI_N2_EXTERNAL_DATA", _EMPTY_EXTERNAL_DATA)
    )
    KANJI_N1_EXTERNAL_DATA = cast(
        list[_ExternalRow], getattr(_external_deck_data, "KANJI_N1_EXTERNAL_DATA", _EMPTY_EXTERNAL_DATA)
    )

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
        Card(
            id=i,
            character=char,
            romaji=romaji,
            meaning=romaji,
            tags=[tag],
            example_sentence=f"{char} の れんしゅうを します。",
        )
        for i, (char, romaji) in enumerate(data)
    ]
    return Deck(name=name, cards=cards)


def _build_deck_with_meaning(
    name: str,
    data: list[tuple[str, str, str]],
    tags: list[str],
) -> Deck:
    cards = [
        Card(
            id=i,
            character=char,
            romaji=reading,
            meaning=meaning,
            tags=list(tags),
            example_sentence=_natural_example_sentence(char, tags),
        )
        for i, (char, reading, meaning) in enumerate(data)
    ]
    return Deck(name=name, cards=cards)


_GRAMMAR_PATTERN_EXAMPLES: dict[str, str] = {
    "〜は〜です": "これは本です。",
    "〜は〜ではありません": "私は先生ではありません。",
    "〜は〜ですか": "これはあなたの傘ですか。",
    "〜は〜だ": "今日は休みだ。",
    "〜があります": "机の上に本があります。",
    "〜がいます": "公園に子どもがいます。",
    "〜をください": "コーヒーをください。",
    "〜てもいいですか": "ここに座ってもいいですか。",
    "〜てください": "ゆっくり話してください。",
    "〜ないでください": "ここで写真を撮らないでください。",
    "〜がほしい": "新しいノートがほしいです。",
    "〜たい": "週末は映画を見たいです。",
    "〜に行きます": "明日、東京に行きます。",
    "〜で行きます": "学校まで電車で行きます。",
    "〜はどうですか": "この店はどうですか。",
    "〜はいくらですか": "このTシャツはいくらですか。",
    "〜はどこですか": "駅はどこですか。",
    "〜はなんじですか": "会議は何時ですか。",
    "どうぞよろしく": "はじめまして。どうぞよろしくお願いします。",
}


def _natural_example_sentence(text: str, tags: list[str]) -> str:
    if "grammar" in tags:
        return _natural_grammar_example(text)
    if "kanji" in tags:
        return f"この漢字は「{text}」です。"
    return f"会話で「{text}」をよく使います。"


def _natural_grammar_example(pattern: str) -> str:
    explicit = _GRAMMAR_PATTERN_EXAMPLES.get(pattern)
    if explicit is not None:
        return explicit

    if "〜" in pattern:
        return "それ、会話でよく使う言い方ですね。"

    return f"「{pattern}」は会話でよく使います。"


def _build_kanji_deck(
    name: str,
    data: list[tuple[str, str, str]],
    level_tag: str,
    id_offset: int,
) -> Deck:
    cards = [
        Card(
            id=id_offset + i,
            character=char,
            romaji=reading,
            meaning=meaning,
            tags=["kanji", level_tag],
            example_sentence=f"この漢字は「{char}」です。",
        )
        for i, (char, reading, meaning) in enumerate(data)
    ]
    return Deck(name=name, cards=cards)


def _build_vocab_deck(
    name: str,
    data: list[tuple[str, str, str]],
    level_tag: str,
    id_offset: int,
) -> Deck:
    cards = [
        Card(
            id=id_offset + i,
            character=char,
            romaji=reading,
            meaning=meaning,
            tags=["vocab", level_tag],
            example_sentence=f"会話で「{char}」をよく使います。",
        )
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

# ---------------------------------------------------------------------------
# JLPT N4 Kanji
# (kanji, primary reading, English meaning)
# ---------------------------------------------------------------------------
_KANJI_N4_DATA: list[tuple[str, str, str]] = [
    ("会", "kai/a", "meeting, association"),
    ("同", "dou/onaji", "same, agree"),
    ("事", "ji/koto", "matter, thing"),
    ("自", "ji/mizu", "self"),
    ("動", "dou/ugo", "move"),
    ("内", "nai/uchi", "inside"),
    ("時", "ji/toki", "time"),
    ("者", "sha/mono", "person"),
    ("作", "saku/tsuku", "make"),
    ("思", "shi/omo", "think"),
    ("住", "ju/su", "live, reside"),
    ("知", "chi/shi", "know"),
    ("場", "jou/ba", "place"),
    ("名", "mei/na", "name"),
    ("何", "nan/nani", "what"),
    ("体", "tai/karada", "body"),
    ("化", "ka/baka", "change"),
    ("主", "shu/omo", "main, master"),
    ("心", "shin/kokoro", "heart, mind"),
    ("対", "tai", "opposite, versus"),
    ("間", "kan/aida", "interval, between"),
    ("相", "sou/ai", "mutual, phase"),
    ("意", "i", "meaning, intention"),
    ("野", "ya/no", "field, plain"),
    ("開", "kai/hira", "open"),
    ("全", "zen/sube", "all, whole"),
    ("定", "tei/sada", "decide, fixed"),
    ("家", "ka/ie", "house, family"),
    ("方", "hou/kata", "direction, way"),
    ("代", "dai/ka", "generation, substitute"),
]

# ---------------------------------------------------------------------------
# JLPT N3 Kanji
# (kanji, primary reading, English meaning)
# ---------------------------------------------------------------------------
_KANJI_N3_DATA: list[tuple[str, str, str]] = [
    ("政", "sei/matsuri", "politics, government"),
    ("保", "ho/tamo", "protect, preserve"),
    ("所", "sho/tokoro", "place"),
    ("経", "kei/he", "manage, pass through"),
    ("応", "ou", "respond"),
    ("旅", "ryo/tabi", "trip, travel"),
    ("想", "sou/omo", "concept, think"),
    ("告", "koku/tsu", "announce"),
    ("調", "chou/shira", "investigate, tune"),
    ("連", "ren/tsura", "connect"),
    ("初", "sho/hatsu", "first, beginning"),
    ("続", "zoku/tsuzu", "continue"),
    ("少", "shou/suku", "few, little"),
    ("急", "kyuu/iso", "sudden, hurry"),
    ("守", "shu/mamo", "protect, obey"),
    ("起", "ki/o", "wake, occur"),
    ("転", "ten/koro", "turn, roll"),
    ("勝", "shou/ka", "win"),
    ("負", "fu/ma", "lose, bear"),
    ("務", "mu/tsuto", "duty"),
    ("命", "mei/inochi", "life, command"),
    ("算", "san", "calculate"),
    ("達", "tatsu", "attain"),
    ("術", "jutsu", "art, technique"),
    ("関", "kan/seki", "relation, barrier"),
    ("要", "you/iru", "need, require"),
    ("価", "ka/atai", "value, price"),
    ("差", "sa/sasu", "difference"),
    ("利", "ri", "benefit, advantage"),
    ("熱", "netsu/atsu", "heat, fever"),
]

# ---------------------------------------------------------------------------
# JLPT N2 Kanji
# (kanji, primary reading, English meaning)
# ---------------------------------------------------------------------------
_KANJI_N2_DATA: list[tuple[str, str, str]] = [
    ("率", "ritsu", "ratio, rate"),
    ("責", "seki", "responsibility"),
    ("略", "ryaku", "abbreviation, strategy"),
    ("範", "han", "scope, model"),
    ("模", "mo", "imitation, pattern"),
    ("精", "sei", "refined, spirit"),
    ("密", "mitsu", "dense, secret"),
    ("講", "kou", "lecture"),
    ("座", "za", "seat, sit"),
    ("援", "en", "aid, support"),
    ("競", "kyou", "compete"),
    ("争", "sou/araso", "conflict"),
    ("診", "shin", "diagnose"),
    ("療", "ryou", "medical treatment"),
    ("預", "yo/azu", "deposit, entrust"),
    ("貯", "cho/takuwa", "save, store"),
    ("測", "soku/haka", "measure, predict"),
    ("況", "kyou", "condition, situation"),
    ("資", "shi", "resource, capital"),
    ("源", "gen/minamoto", "source, origin"),
    ("穏", "on/oda", "calm"),
    ("緊", "kin", "tense, urgent"),
    ("圧", "atsu", "pressure"),
    ("縮", "shuku/chiji", "shrink"),
    ("拡", "kaku", "expand"),
    ("訳", "yaku/wake", "translate, reason"),
    ("省", "sei/habu", "ministry, omit"),
    ("境", "kyou/sakai", "boundary, situation"),
    ("補", "ho/ogona", "supplement"),
    ("総", "sou", "overall, total"),
]

# ---------------------------------------------------------------------------
# JLPT N1 Kanji
# (kanji, primary reading, English meaning)
# ---------------------------------------------------------------------------
_KANJI_N1_DATA: list[tuple[str, str, str]] = [
    ("顕", "ken", "appear, manifest"),
    ("諭", "yu", "instruct, persuade"),
    ("憂", "yuu/ure", "grief, worry"),
    ("曖", "ai", "vague"),
    ("昧", "mai", "dim, obscure"),
    ("鬱", "utsu", "depression"),
    ("償", "shou/tsuguna", "compensate"),
    ("懸", "ken/kake", "suspend, concern"),
    ("罰", "batsu", "punishment"),
    ("遵", "jun", "abide by"),
    ("擁", "you", "embrace, support"),
    ("護", "go/mamoru", "safeguard"),
    ("闘", "tou/tataka", "fight"),
    ("緩", "kan/yuru", "loosen"),
    ("隷", "rei", "servant, subordinate"),
    ("罷", "hi", "dismiss, quit"),
    ("顧", "ko/kaeri", "look back, consider"),
    ("諾", "daku", "consent"),
    ("賛", "san", "approve, praise"),
    ("璧", "heki", "flawless"),
    ("巧", "kou/taku", "skillful"),
    ("繊", "sen", "delicate, fine"),
    ("維", "i", "maintain"),
    ("羅", "ra", "gauze, net"),
    ("宰", "sai", "govern, manager"),
    ("亜", "a", "sub-, Asia"),
    ("赴", "fu/omo", "proceed toward"),
    ("該", "gai", "relevant"),
    ("勲", "kun", "distinguished service"),
    ("審", "shin", "judge, examine"),
]


def get_kanji_n5_deck() -> Deck:
    rows = KANJI_N5_EXTERNAL_DATA if KANJI_N5_EXTERNAL_DATA else _KANJI_N5_DATA
    return _build_kanji_deck("Kanji N5", rows, "n5", id_offset=0)


def get_kanji_n4_deck() -> Deck:
    rows = KANJI_N4_EXTERNAL_DATA if KANJI_N4_EXTERNAL_DATA else _KANJI_N4_DATA
    return _build_kanji_deck("Kanji N4", rows, "n4", id_offset=1000)


def get_kanji_n3_deck() -> Deck:
    rows = KANJI_N3_EXTERNAL_DATA if KANJI_N3_EXTERNAL_DATA else _KANJI_N3_DATA
    return _build_kanji_deck("Kanji N3", rows, "n3", id_offset=2000)


def get_kanji_n2_deck() -> Deck:
    rows = KANJI_N2_EXTERNAL_DATA if KANJI_N2_EXTERNAL_DATA else _KANJI_N2_DATA
    return _build_kanji_deck("Kanji N2", rows, "n2", id_offset=3000)


def get_kanji_n1_deck() -> Deck:
    rows = KANJI_N1_EXTERNAL_DATA if KANJI_N1_EXTERNAL_DATA else _KANJI_N1_DATA
    return _build_kanji_deck("Kanji N1", rows, "n1", id_offset=4000)


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
    data = VOCAB_N5_EXTERNAL_DATA if VOCAB_N5_EXTERNAL_DATA else _VOCAB_N5_DATA
    return _build_vocab_deck("Vocabulary N5", data[:_VOCAB_LEVEL_LIMITS["n5"]], "n5", id_offset=0)


def get_vocab_n4_deck() -> Deck:
    rows = VOCAB_N4_EXTERNAL_DATA
    return _build_vocab_deck("Vocabulary N4", rows[:_VOCAB_LEVEL_LIMITS["n4"]], "n4", id_offset=10000)


def get_vocab_n3_deck() -> Deck:
    rows = VOCAB_N3_EXTERNAL_DATA
    return _build_vocab_deck("Vocabulary N3", rows[:_VOCAB_LEVEL_LIMITS["n3"]], "n3", id_offset=20000)


def get_vocab_n2_deck() -> Deck:
    rows = VOCAB_N2_EXTERNAL_DATA
    return _build_vocab_deck("Vocabulary N2", rows[:_VOCAB_LEVEL_LIMITS["n2"]], "n2", id_offset=30000)


def get_vocab_n1_deck() -> Deck:
    rows = VOCAB_N1_EXTERNAL_DATA
    return _build_vocab_deck("Vocabulary N1", rows[:_VOCAB_LEVEL_LIMITS["n1"]], "n1", id_offset=40000)


# ---------------------------------------------------------------------------
# Thematic Vocabulary Categories
#
# Derived from _VOCAB_N5_DATA (topic-grouped sections) plus a new Greetings
# category.  Card IDs are sequential across all categories so they can share
# the same cardScores['vocab_n5'] map in the frontend without collision.
#
# ID allocation:
#   Greetings   0–14   (15 items, new data)
#   Numbers     15–20  (_VOCAB_N5_DATA[0:6])
#   Time & Days 21–32  (_VOCAB_N5_DATA[6:18])
#   Family      33–40  (_VOCAB_N5_DATA[18:26])
#   Body        41–46  (_VOCAB_N5_DATA[26:32])
#   Food&Drink  47–59  (_VOCAB_N5_DATA[32:45])
#   School&Study 60–71 (_VOCAB_N5_DATA[45:57])
#   Places      72–79  (_VOCAB_N5_DATA[57:65])
#   Transport   80–86  (_VOCAB_N5_DATA[65:72])
#   Adjectives  87–103 (_VOCAB_N5_DATA[72:89])
#   Verbs       104–123(_VOCAB_N5_DATA[89:109])
#   Common Nouns 124–144(_VOCAB_N5_DATA[109:130])
# ---------------------------------------------------------------------------

_VOCAB_GREETINGS_DATA: list[tuple[str, str, str]] = [
    ("おはよう", "ohayou", "good morning (casual)"),
    ("おはようございます", "ohayou gozaimasu", "good morning (polite)"),
    ("こんにちは", "konnichiwa", "hello / good afternoon"),
    ("こんばんは", "konbanwa", "good evening"),
    ("おやすみなさい", "oyasumi nasai", "good night"),
    ("さようなら", "sayounara", "goodbye"),
    ("ありがとう", "arigatou", "thank you (casual)"),
    ("ありがとうございます", "arigatou gozaimasu", "thank you (polite)"),
    ("すみません", "sumimasen", "excuse me / I'm sorry"),
    ("ごめんなさい", "gomen nasai", "I'm sorry"),
    ("はじめまして", "hajimemashite", "nice to meet you"),
    ("よろしくおねがいします", "yoroshiku onegaishimasu", "please treat me well"),
    ("いってきます", "ittekimasu", "I'm off (leaving the house)"),
    ("ただいま", "tadaima", "I'm home"),
    ("どういたしまして", "dou itashimashite", "you're welcome"),
]


def get_vocab_greetings_deck() -> Deck:
    return _build_vocab_deck("Vocabulary: Greetings", _VOCAB_GREETINGS_DATA, "vocab_greetings", id_offset=0)


def get_vocab_numbers_deck() -> Deck:
    return _build_vocab_deck("Vocabulary: Numbers", _VOCAB_N5_DATA[0:6], "vocab_numbers", id_offset=15)


def get_vocab_time_days_deck() -> Deck:
    return _build_vocab_deck("Vocabulary: Time & Days", _VOCAB_N5_DATA[6:18], "vocab_time_days", id_offset=21)


def get_vocab_family_deck() -> Deck:
    return _build_vocab_deck("Vocabulary: Family", _VOCAB_N5_DATA[18:26], "vocab_family", id_offset=33)


def get_vocab_body_deck() -> Deck:
    return _build_vocab_deck("Vocabulary: Body", _VOCAB_N5_DATA[26:32], "vocab_body", id_offset=41)


def get_vocab_food_drink_deck() -> Deck:
    return _build_vocab_deck("Vocabulary: Food & Drink", _VOCAB_N5_DATA[32:45], "vocab_food_drink", id_offset=47)


def get_vocab_school_study_deck() -> Deck:
    return _build_vocab_deck("Vocabulary: School & Study", _VOCAB_N5_DATA[45:57], "vocab_school_study", id_offset=60)


def get_vocab_places_deck() -> Deck:
    return _build_vocab_deck("Vocabulary: Places", _VOCAB_N5_DATA[57:65], "vocab_places", id_offset=72)


def get_vocab_transport_deck() -> Deck:
    return _build_vocab_deck("Vocabulary: Transport", _VOCAB_N5_DATA[65:72], "vocab_transport", id_offset=80)


def get_vocab_adjectives_deck() -> Deck:
    return _build_vocab_deck("Vocabulary: Adjectives", _VOCAB_N5_DATA[72:89], "vocab_adjectives", id_offset=87)


def get_vocab_verbs_deck() -> Deck:
    return _build_vocab_deck("Vocabulary: Verbs", _VOCAB_N5_DATA[89:109], "vocab_verbs", id_offset=104)


def get_vocab_nouns_deck() -> Deck:
    return _build_vocab_deck("Vocabulary: Common Nouns", _VOCAB_N5_DATA[109:130], "vocab_nouns", id_offset=124)


# ---------------------------------------------------------------------------
# Thematic Kanji Categories
#
# Derived from _KANJI_N5_DATA (already topic-grouped).  IDs match the
# original list indices so existing SRS data for kanji_n5 cards is preserved.
#
# ID allocation (contiguous, matching _KANJI_N5_DATA order):
#   Numbers & Time  0–23  (13 Numbers + 6 Time + 5 Calendar)
#   Nature & World  24–52 (6 Nature + 13 Directions + 10 Size/Desc)
#   People & Body   53–66 (7 People/Family + 7 Body)
#   Study & Language 67–75 (9 School/Language)
#   Actions & Travel 76–90 (13 Actions + 2 Transport)
# ---------------------------------------------------------------------------

def get_kanji_numbers_time_deck() -> Deck:
    data = _KANJI_N5_DATA[0:24]
    return _build_kanji_deck("Kanji: N5 · Numbers & Time", data, "kanji_numbers_time", id_offset=0)


def get_kanji_nature_world_deck() -> Deck:
    data = _KANJI_N5_DATA[24:53]
    return _build_kanji_deck("Kanji: N5 · Nature & World", data, "kanji_nature_world", id_offset=24)


def get_kanji_people_body_deck() -> Deck:
    data = _KANJI_N5_DATA[53:67]
    return _build_kanji_deck("Kanji: N5 · People & Body", data, "kanji_people_body", id_offset=53)


def get_kanji_study_language_deck() -> Deck:
    data = _KANJI_N5_DATA[67:76]
    return _build_kanji_deck("Kanji: N5 · Study & Language", data, "kanji_study_language", id_offset=67)


def get_kanji_actions_travel_deck() -> Deck:
    data = _KANJI_N5_DATA[76:91]
    return _build_kanji_deck("Kanji: N5 · Actions & Travel", data, "kanji_actions_travel", id_offset=76)


# ---------------------------------------------------------------------------
# Kanji — N4 thematic categories  (IDs 200–229)
# Society & Roles: 会者名主同全定代  (indices 0,1,7,13,17,25,26,29)
# Mind & Thought:  思知意心体化対相  (indices 9,11,15,16,18,19,21,22)
# Daily Life:      住家場野内間自    (indices 3,5,10,12,20,23,27)
# Time & Action:   時動事作開方何    (indices 2,4,6,8,14,24,28)
# ---------------------------------------------------------------------------

def get_kanji_n4_society_roles_deck() -> Deck:
    data = [_KANJI_N4_DATA[i] for i in [0, 1, 7, 13, 17, 25, 26, 29]]
    return _build_kanji_deck("Kanji: N4 · Society & Roles", data, "n4", id_offset=200)


def get_kanji_n4_mind_thought_deck() -> Deck:
    data = [_KANJI_N4_DATA[i] for i in [9, 11, 15, 16, 18, 19, 21, 22]]
    return _build_kanji_deck("Kanji: N4 · Mind & Thought", data, "n4", id_offset=208)


def get_kanji_n4_daily_life_deck() -> Deck:
    data = [_KANJI_N4_DATA[i] for i in [3, 5, 10, 12, 20, 23, 27]]
    return _build_kanji_deck("Kanji: N4 · Daily Life", data, "n4", id_offset=216)


def get_kanji_n4_time_action_deck() -> Deck:
    data = [_KANJI_N4_DATA[i] for i in [2, 4, 6, 8, 14, 24, 28]]
    return _build_kanji_deck("Kanji: N4 · Time & Action", data, "n4", id_offset=223)


# ---------------------------------------------------------------------------
# Kanji — N3 thematic categories  (IDs 400–429)
# Governance:    政経連務命算関  (indices 0,3,9,19,20,21,24)
# Communication: 告調応想保所守  (indices 1,2,4,6,7,8,14)
# Movement:      旅初続少急起転  (indices 5,10,11,12,13,15,16)
# Achievement:   勝負達術要価差利熱  (indices 17,18,22,23,25,26,27,28,29)
# ---------------------------------------------------------------------------

def get_kanji_n3_governance_deck() -> Deck:
    data = [_KANJI_N3_DATA[i] for i in [0, 3, 9, 19, 20, 21, 24]]
    return _build_kanji_deck("Kanji: N3 · Governance", data, "n3", id_offset=400)


def get_kanji_n3_communication_deck() -> Deck:
    data = [_KANJI_N3_DATA[i] for i in [1, 2, 4, 6, 7, 8, 14]]
    return _build_kanji_deck("Kanji: N3 · Communication", data, "n3", id_offset=407)


def get_kanji_n3_movement_deck() -> Deck:
    data = [_KANJI_N3_DATA[i] for i in [5, 10, 11, 12, 13, 15, 16]]
    return _build_kanji_deck("Kanji: N3 · Movement", data, "n3", id_offset=414)


def get_kanji_n3_achievement_deck() -> Deck:
    data = [_KANJI_N3_DATA[i] for i in [17, 18, 22, 23, 25, 26, 27, 28, 29]]
    return _build_kanji_deck("Kanji: N3 · Achievement", data, "n3", id_offset=421)


# ---------------------------------------------------------------------------
# Kanji — N2 thematic categories  (IDs 600–629)
# Professionalism: 率責略範模精密講座  (indices 0-8)
# Economics:       援競争預貯資補総    (indices 9,10,11,14,15,18,28,29)
# Analysis:        診療測況源穏緊圧縮拡訳省境  (indices 12,13,16,17,19-27)
# ---------------------------------------------------------------------------

def get_kanji_n2_professionalism_deck() -> Deck:
    data = [_KANJI_N2_DATA[i] for i in [0, 1, 2, 3, 4, 5, 6, 7, 8]]
    return _build_kanji_deck("Kanji: N2 · Professionalism", data, "n2", id_offset=600)


def get_kanji_n2_economics_deck() -> Deck:
    data = [_KANJI_N2_DATA[i] for i in [9, 10, 11, 14, 15, 18, 28, 29]]
    return _build_kanji_deck("Kanji: N2 · Economics", data, "n2", id_offset=609)


def get_kanji_n2_analysis_deck() -> Deck:
    data = [_KANJI_N2_DATA[i] for i in [12, 13, 16, 17, 19, 20, 21, 22, 23, 24, 25, 26, 27]]
    return _build_kanji_deck("Kanji: N2 · Analysis", data, "n2", id_offset=617)


# ---------------------------------------------------------------------------
# Kanji — N1 thematic categories  (IDs 800–829)
# Law & Order:     遵罰審勲諾賛顧罷      (indices 8,9,15,16,17,18,28,29)
# Society & Power: 顕諭擁護闘緩隷宰亜赴該  (indices 0,1,10-14,24-27)
# Literary Arts:   憂曖昧鬱償懸璧巧繊維羅  (indices 2-7,19-23)
# ---------------------------------------------------------------------------

def get_kanji_n1_law_order_deck() -> Deck:
    data = [_KANJI_N1_DATA[i] for i in [8, 9, 15, 16, 17, 18, 28, 29]]
    return _build_kanji_deck("Kanji: N1 · Law & Order", data, "n1", id_offset=800)


def get_kanji_n1_ideology_deck() -> Deck:
    data = [_KANJI_N1_DATA[i] for i in [0, 1, 10, 11, 12, 13, 14, 24, 25, 26, 27]]
    return _build_kanji_deck("Kanji: N1 · Society & Power", data, "n1", id_offset=808)


def get_kanji_n1_literary_deck() -> Deck:
    data = [_KANJI_N1_DATA[i] for i in [2, 3, 4, 5, 6, 7, 19, 20, 21, 22, 23]]
    return _build_kanji_deck("Kanji: N1 · Literary Arts", data, "n1", id_offset=819)


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
    data = (
        GRAMMAR_PATTERNS_EXTERNAL_DATA
        if GRAMMAR_PATTERNS_EXTERNAL_DATA
        else _GRAMMAR_PATTERNS_DATA
    )
    return _build_deck_with_meaning(
        "Grammar Patterns", data, ["grammar", "n5"]
    )


def get_sentence_examples_deck() -> Deck:
    data = (
        SENTENCE_EXAMPLES_EXTERNAL_DATA
        if SENTENCE_EXAMPLES_EXTERNAL_DATA
        else _GRAMMAR_PATTERNS_DATA
    )
    return _build_deck_with_meaning(
        "Sentence Examples", data, ["sentence", "example", "grammar"]
    )


_CONJUGATION_TRAINING_DATA: list[tuple[str, str, str]] = [
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
    # --- Common conjugation-adjacent forms ---
    ("〜をください", "〜 wo kudasai", "Please give me 〜"),
    ("〜がほしい", "〜 ga hoshii", "I want 〜 (noun)"),
    ("〜たい", "〜 tai", "I want to 〜 (verb stem + たい)"),
    ("〜に行きます", "〜 ni ikimasu", "Go to 〜 (destination)"),
    ("〜で行きます", "〜 de ikimasu", "Go by 〜 (means of transport)"),
]


def get_conjugation_training_deck() -> Deck:
    data = (
        CONJUGATION_TRAINING_EXTERNAL_DATA
        if CONJUGATION_TRAINING_EXTERNAL_DATA
        else _CONJUGATION_TRAINING_DATA
    )
    return _build_deck_with_meaning(
        "Conjugation Training", data, ["conjugation", "grammar"]
    )


#: Registry mapping deck slug → factory function for all built-in decks.
ALL_DECKS = {
    "hiragana": get_hiragana_deck,
    "katakana": get_katakana_deck,
    # Kanji — JLPT levels (kept for backward compatibility)
    "kanji_n5": get_kanji_n5_deck,
    "kanji_n4": get_kanji_n4_deck,
    "kanji_n3": get_kanji_n3_deck,
    "kanji_n2": get_kanji_n2_deck,
    "kanji_n1": get_kanji_n1_deck,
    # Kanji — N5 thematic categories
    "kanji_numbers_time": get_kanji_numbers_time_deck,
    "kanji_nature_world": get_kanji_nature_world_deck,
    "kanji_people_body": get_kanji_people_body_deck,
    "kanji_study_language": get_kanji_study_language_deck,
    "kanji_actions_travel": get_kanji_actions_travel_deck,
    # Kanji — N4 thematic categories
    "kanji_n4_society_roles": get_kanji_n4_society_roles_deck,
    "kanji_n4_mind_thought":  get_kanji_n4_mind_thought_deck,
    "kanji_n4_daily_life":    get_kanji_n4_daily_life_deck,
    "kanji_n4_time_action":   get_kanji_n4_time_action_deck,
    # Kanji — N3 thematic categories
    "kanji_n3_governance":    get_kanji_n3_governance_deck,
    "kanji_n3_communication": get_kanji_n3_communication_deck,
    "kanji_n3_movement":      get_kanji_n3_movement_deck,
    "kanji_n3_achievement":   get_kanji_n3_achievement_deck,
    # Kanji — N2 thematic categories
    "kanji_n2_professionalism": get_kanji_n2_professionalism_deck,
    "kanji_n2_economics":     get_kanji_n2_economics_deck,
    "kanji_n2_analysis":      get_kanji_n2_analysis_deck,
    # Kanji — N1 thematic categories
    "kanji_n1_law_order":     get_kanji_n1_law_order_deck,
    "kanji_n1_ideology":      get_kanji_n1_ideology_deck,
    "kanji_n1_literary":      get_kanji_n1_literary_deck,
    # Vocabulary — JLPT levels (kept for backward compatibility)
    "vocab_n5": get_vocab_n5_deck,
    "vocab_n4": get_vocab_n4_deck,
    "vocab_n3": get_vocab_n3_deck,
    "vocab_n2": get_vocab_n2_deck,
    "vocab_n1": get_vocab_n1_deck,
    # Vocabulary — thematic categories
    "vocab_greetings": get_vocab_greetings_deck,
    "vocab_numbers": get_vocab_numbers_deck,
    "vocab_time_days": get_vocab_time_days_deck,
    "vocab_family": get_vocab_family_deck,
    "vocab_body": get_vocab_body_deck,
    "vocab_food_drink": get_vocab_food_drink_deck,
    "vocab_school_study": get_vocab_school_study_deck,
    "vocab_places": get_vocab_places_deck,
    "vocab_transport": get_vocab_transport_deck,
    "vocab_adjectives": get_vocab_adjectives_deck,
    "vocab_verbs": get_vocab_verbs_deck,
    "vocab_nouns": get_vocab_nouns_deck,
    # Grammar / Conversational
    "grammar_patterns": get_grammar_patterns_deck,
    "sentence_examples": get_sentence_examples_deck,
    "conjugation_training": get_conjugation_training_deck,
}
