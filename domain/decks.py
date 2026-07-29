"""Built-in decks: Hiragana, Katakana, JLPT Kanji, JLPT Vocabulary, Grammar Patterns, Sentence Examples, Conjugation Training."""

from collections.abc import Callable
from dataclasses import replace
from types import ModuleType
from typing import cast

from domain.cards import Card, Deck
from domain.deck_supplements import KANJI_SUPPLEMENT, VOCAB_SUPPLEMENT, with_supplement

_external_deck_data: ModuleType | None
try:
    import domain.external_deck_data as _external_deck_data_module

    _external_deck_data = _external_deck_data_module
except ImportError:
    _external_deck_data = None

_ExternalRow = tuple[str, str, str]
_EMPTY_EXTERNAL_DATA: list[_ExternalRow] = []

# Vocabulary level decks expose the *whole* imported corpus (issue #67). Pacing
# is handled by the session queue (8–20 items per session, `SESSION_LENGTH_PRESETS`)
# and by SRS scheduling, not by discarding rows at the domain layer.
#
# What does constrain deck size is card-id allocation: each level starts at a
# hand-picked `id_offset` and grows upward, so a level may not reach the next
# allocated offset or two different words silently share a card id — which
# corrupts SRS/mastery state instead of erroring (issue #63).
#
#   vocab_n5   offset      0 → capacity  1,000 (vocab category decks start at 1000)
#   vocab_n4   offset 10,000 → capacity 10,000 (vocab_n3 starts at 20000)
#   vocab_n3   offset 20,000 → capacity 10,000
#   vocab_n2   offset 30,000 → capacity 10,000
#   vocab_n1   offset 40,000 → capacity 10,000 (nothing allocated above)
#
# `_build_vocab_deck` raises if a corpus outgrows its slot, so a future import
# fails loudly at deck-build time rather than silently colliding ids.
_VOCAB_ID_CAPACITY: dict[str, int] = {
    "n5": 1000,
    "n4": 10000,
    "n3": 10000,
    "n2": 10000,
    "n1": 10000,
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


def _supplemented_kanji(rows: list[tuple[str, str, str]], level: str) -> list[tuple[str, str, str]]:
    """Return ``rows`` plus any category-only kanji recovered for this level."""
    return with_supplement(rows, KANJI_SUPPLEMENT.get(level, ()))


def _supplemented_vocab(rows: list[tuple[str, str, str]], level: str) -> list[tuple[str, str, str]]:
    """Return ``rows`` plus any category-only vocabulary recovered for this level."""
    return with_supplement(rows, VOCAB_SUPPLEMENT.get(level, ()))


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


def _vocab_card(card_id: int, char: str, reading: str, meaning: str, level_tag: str) -> Card:
    """Build one vocabulary card.

    Shared by the level-deck and thematic-category builders, which differ only
    in how they allocate ``card_id`` — keeping card shape in one place so the
    two cannot drift apart.
    """
    return Card(
        id=card_id,
        character=char,
        romaji=reading,
        meaning=meaning,
        tags=["vocab", level_tag],
        example_sentence=f"会話で「{char}」をよく使います。",
    )


def _build_vocab_deck(
    name: str,
    data: list[tuple[str, str, str]],
    level_tag: str,
    id_offset: int,
    id_capacity: int | None = None,
) -> Deck:
    """Build a vocabulary deck, optionally guarding its card-id allocation.

    Args:
        name: Human-readable deck name.
        data: ``(character, reading, meaning)`` rows, in deck order.
        level_tag: Tag applied to every card alongside ``"vocab"``.
        id_offset: Card id of the first row; ids increment from there.
        id_capacity: Ids reserved for this deck before the next allocation.
            Passing it turns an outgrown slot into a build-time error instead
            of a silent card-id collision (see ``_VOCAB_ID_CAPACITY``).

    Raises:
        ValueError: If ``data`` has more rows than ``id_capacity`` allows.
    """
    if id_capacity is not None and len(data) > id_capacity:
        raise ValueError(
            f"Vocabulary deck {name!r} has {len(data)} rows but only {id_capacity} "
            f"card ids are reserved at offset {id_offset}. Widen the id allocation "
            f"in domain/decks.py (_VOCAB_ID_CAPACITY) before importing more rows — "
            f"overflowing the slot silently corrupts SRS/mastery state."
        )
    cards = [
        _vocab_card(id_offset + i, char, reading, meaning, level_tag)
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
    return _build_kanji_deck("Kanji N5", _supplemented_kanji(rows, "n5"), "n5", id_offset=0)


def get_kanji_n4_deck() -> Deck:
    rows = KANJI_N4_EXTERNAL_DATA if KANJI_N4_EXTERNAL_DATA else _KANJI_N4_DATA
    return _build_kanji_deck("Kanji N4", _supplemented_kanji(rows, "n4"), "n4", id_offset=1000)


def get_kanji_n3_deck() -> Deck:
    rows = KANJI_N3_EXTERNAL_DATA if KANJI_N3_EXTERNAL_DATA else _KANJI_N3_DATA
    return _build_kanji_deck("Kanji N3", _supplemented_kanji(rows, "n3"), "n3", id_offset=2000)


def get_kanji_n2_deck() -> Deck:
    rows = KANJI_N2_EXTERNAL_DATA if KANJI_N2_EXTERNAL_DATA else _KANJI_N2_DATA
    return _build_kanji_deck("Kanji N2", _supplemented_kanji(rows, "n2"), "n2", id_offset=3000)


def get_kanji_n1_deck() -> Deck:
    rows = KANJI_N1_EXTERNAL_DATA if KANJI_N1_EXTERNAL_DATA else _KANJI_N1_DATA
    return _build_kanji_deck("Kanji N1", _supplemented_kanji(rows, "n1"), "n1", id_offset=4000)


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
    return _build_vocab_deck(
        "Vocabulary N5", _supplemented_vocab(data, "n5"), "n5",
        id_offset=0, id_capacity=_VOCAB_ID_CAPACITY["n5"],
    )


def get_vocab_n4_deck() -> Deck:
    rows = VOCAB_N4_EXTERNAL_DATA
    return _build_vocab_deck(
        "Vocabulary N4", rows, "n4", id_offset=10000, id_capacity=_VOCAB_ID_CAPACITY["n4"]
    )


def get_vocab_n3_deck() -> Deck:
    rows = VOCAB_N3_EXTERNAL_DATA
    return _build_vocab_deck(
        "Vocabulary N3", rows, "n3", id_offset=20000, id_capacity=_VOCAB_ID_CAPACITY["n3"]
    )


def get_vocab_n2_deck() -> Deck:
    rows = VOCAB_N2_EXTERNAL_DATA
    return _build_vocab_deck(
        "Vocabulary N2", rows, "n2", id_offset=30000, id_capacity=_VOCAB_ID_CAPACITY["n2"]
    )


def get_vocab_n1_deck() -> Deck:
    rows = VOCAB_N1_EXTERNAL_DATA
    return _build_vocab_deck(
        "Vocabulary N1", rows, "n1", id_offset=40000, id_capacity=_VOCAB_ID_CAPACITY["n1"]
    )


# ---------------------------------------------------------------------------
# Thematic Vocabulary Categories
#
# Derived from _VOCAB_N5_DATA (topic-grouped sections) plus a new Greetings
# category. IMPORTANT: these are built from the hardcoded _VOCAB_N5_DATA
# fallback list, while get_vocab_n5_deck() sources from VOCAB_N5_EXTERNAL_DATA
# whenever it's present (it is, in the shipped app) — the two lists have
# different order/content. IDs here therefore CANNOT share vocab_n5's id
# space (0–49 today, up to len(VOCAB_N5_EXTERNAL_DATA) if the level cap is
# ever lifted): doing so previously produced silent id collisions where the
# same numeric card id meant two different words depending on which deck was
# reviewed. This block is a disjoint id range instead (base 1000), matching
# the pattern already used for N4–N1 thematic kanji categories.
#
# ID allocation (offsets shown are id_offset + local index):
#   Greetings   1000–1014 (15 items, new data)
#   Numbers     1015–1020 (_VOCAB_N5_DATA[0:6])
#   Time & Days 1021–1032 (_VOCAB_N5_DATA[6:18])
#   Family      1033–1040 (_VOCAB_N5_DATA[18:26])
#   Body        1041–1046 (_VOCAB_N5_DATA[26:32])
#   Food&Drink  1047–1059 (_VOCAB_N5_DATA[32:45])
#   School&Study 1060–1071 (_VOCAB_N5_DATA[45:57])
#   Places      1072–1079 (_VOCAB_N5_DATA[57:65])
#   Transport   1080–1086 (_VOCAB_N5_DATA[65:72])
#   Adjectives  1087–1103 (_VOCAB_N5_DATA[72:89])
#   Verbs       1104–1123 (_VOCAB_N5_DATA[89:109])
#   Common Nouns 1124–1144 (_VOCAB_N5_DATA[109:130])
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
    return _build_vocab_deck("Vocabulary: Greetings", _VOCAB_GREETINGS_DATA, "vocab_greetings", id_offset=1000)


def get_vocab_numbers_deck() -> Deck:
    return _build_vocab_deck("Vocabulary: Numbers", _VOCAB_N5_DATA[0:6], "vocab_numbers", id_offset=1015)


def get_vocab_time_days_deck() -> Deck:
    return _build_vocab_deck("Vocabulary: Time & Days", _VOCAB_N5_DATA[6:18], "vocab_time_days", id_offset=1021)


def get_vocab_family_deck() -> Deck:
    return _build_vocab_deck("Vocabulary: Family", _VOCAB_N5_DATA[18:26], "vocab_family", id_offset=1033)


def get_vocab_body_deck() -> Deck:
    return _build_vocab_deck("Vocabulary: Body", _VOCAB_N5_DATA[26:32], "vocab_body", id_offset=1041)


def get_vocab_food_drink_deck() -> Deck:
    return _build_vocab_deck("Vocabulary: Food & Drink", _VOCAB_N5_DATA[32:45], "vocab_food_drink", id_offset=1047)


def get_vocab_school_study_deck() -> Deck:
    return _build_vocab_deck("Vocabulary: School & Study", _VOCAB_N5_DATA[45:57], "vocab_school_study", id_offset=1060)


def get_vocab_places_deck() -> Deck:
    return _build_vocab_deck("Vocabulary: Places", _VOCAB_N5_DATA[57:65], "vocab_places", id_offset=1072)


def get_vocab_transport_deck() -> Deck:
    return _build_vocab_deck("Vocabulary: Transport", _VOCAB_N5_DATA[65:72], "vocab_transport", id_offset=1080)


def get_vocab_adjectives_deck() -> Deck:
    return _build_vocab_deck("Vocabulary: Adjectives", _VOCAB_N5_DATA[72:89], "vocab_adjectives", id_offset=1087)


def get_vocab_verbs_deck() -> Deck:
    return _build_vocab_deck("Vocabulary: Verbs", _VOCAB_N5_DATA[89:109], "vocab_verbs", id_offset=1104)


def get_vocab_nouns_deck() -> Deck:
    return _build_vocab_deck("Vocabulary: Common Nouns", _VOCAB_N5_DATA[109:130], "vocab_nouns", id_offset=1124)


# ---------------------------------------------------------------------------
# Thematic Vocabulary Categories — N4→N1  (issue #68)
#
# Mirrors the kanji thematic categories, which exist for every JLPT level while
# vocabulary previously had them only for N5. Like the kanji ones, these are a
# curated selection rather than a partition: the flat level decks remain the
# way to reach the rest of the corpus.
#
# The N5 vocab categories above slice `_VOCAB_N5_DATA` by index. These cannot —
# they draw from `VOCAB_N*_EXTERNAL_DATA`, which is generated from CSV, so an
# index would quietly point at a different word after a re-import. Each category
# is therefore a tuple of *characters* resolved against its level corpus at
# build time.
#
# A card's id comes from the word's position in the curated tuple, not from its
# position among the resolved rows. A word that disappears from the corpus then
# leaves a hole instead of shifting every later id onto a different word, which
# would silently misattribute that word's SRS history.
# `tests/test_decks.py` asserts every curated word still resolves.
#
# ID allocation — 1,000 ids per level, 250 per category slot:
#   N4 50000 | N3 51000 | N2 52000 | N1 53000
# Nothing else is allocated at or above 50000 (level decks top out at 42698).
# ---------------------------------------------------------------------------

_VOCAB_CATEGORY_LEVEL_BASE: dict[str, int] = {
    "n4": 50000,
    "n3": 51000,
    "n2": 52000,
    "n1": 53000,
}

# Ids reserved per category slot. Curated categories hold ~25 words, so this is
# deliberately generous — widening a category never needs an id reshuffle.
_VOCAB_CATEGORY_ID_SPACING = 250

# slug -> (display name, JLPT level, slot index within the level, curated words)
_VOCAB_LEVEL_CATEGORY_SPECS: dict[str, tuple[str, str, int, tuple[str, ...]]] = {
    # --- N4 ---------------------------------------------------------------
    "vocab_n4_school_work": (
        "Vocabulary: N4 · School & Work", "n4", 0,
        (
            "医学", "大学生", "予習", "~学部", "中学校", "小学校", "文法", "試験",
            "校長", "科学", "入学", "高校生", "復習", "研究", "課長", "社長",
            "会議室", "事務所", "出席", "店員", "公務員", "数学", "会話", "発音",
            "アルバイト",
        ),
    ),
    "vocab_n4_home_living": (
        "Vocabulary: N4 · Home & Living", "n4", 1,
        (
            "床屋", "お宅", "ごみ", "布団", "畳", "品物", "壁", "水道", "下宿",
            "鏡", "冷房", "留守", "湯", "売り場", "消しゴム", "手袋", "味噌",
            "食料品", "ジャム", "サラダ", "ステーキ", "サンドイッチ", "ぶどう",
            "石", "火",
        ),
    ),
    "vocab_n4_travel_places": (
        "Vocabulary: N4 · Travel & Places", "n4", 2,
        (
            "郊外", "動物園", "地理", "林", "坂", "飛行場", "美術館", "森",
            "お土産", "旅館", "海岸", "乗り物", "案内", "交通", "急行", "空港",
            "港", "予約", "特急", "汽車", "乗り換える", "運ぶ", "世界", "場所",
            "住所",
        ),
    ),
    "vocab_n4_feelings_character": (
        "Vocabulary: N4 · Feelings & Character", "n4", 3,
        (
            "苦い", "怒る", "心配", "気", "失礼", "厳しい", "深い", "悲しい",
            "浅い", "残念", "丁寧", "怖い", "無理", "恥ずかしい", "気分", "美しい",
            "素晴らしい", "親切", "熱心", "おかしい", "変", "驚く", "心", "珍しい",
            "寂しい",
        ),
    ),
    # --- N3 ---------------------------------------------------------------
    "vocab_n3_work_business": (
        "Vocabulary: N3 · Work & Business", "n3", 0,
        (
            "失業", "支店", "就職", "商売", "職", "職業", "営業", "オフィス",
            "家事", "管理", "企業", "経営", "景気", "作業", "作品", "名刺",
            "雇う", "労働", "通勤", "勤め", "同僚", "仲間", "働き", "操作",
            "使用",
        ),
    ),
    "vocab_n3_emotion_mind": (
        "Vocabulary: N3 · Emotion & Mind", "n3", 1,
        (
            "沈む", "集中", "心臓", "精神", "暗記", "恐れる", "がっかり", "悲しむ",
            "感じ", "感情", "感じる", "機嫌", "恐怖", "さっぱり", "愉快", "喜び",
            "怒り", "歓声", "苦", "辛い", "触れる", "雰囲気", "情", "ほっと",
            "恋人",
        ),
    ),
    "vocab_n3_society_people": (
        "Vocabulary: N3 · Society & People", "n3", 2,
        (
            "氏", "集団", "出版", "姓", "世間", "委員", "一家", "会員", "関連",
            "議員", "グループ", "後輩", "国民", "メンバー", "世の中", "縁",
            "慣行", "全員", "宣伝", "地位", "付き合い", "仲", "農家", "農業",
            "世",
        ),
    ),
    "vocab_n3_nature_science": (
        "Vocabulary: N3 · Nature & Science", "n3", 3,
        (
            "自然", "質", "植物", "性質", "稲", "宇宙", "エネルギー", "温度",
            "観察", "気温", "機械", "工場", "要素", "体温", "地", "地球", "土",
            "天候", "天然", "実験", "注目", "澄む", "体育", "医師", "スター",
        ),
    ),
    # --- N2 ---------------------------------------------------------------
    "vocab_n2_economy_trade": (
        "Vocabulary: N2 · Economy & Trade", "n2", 0,
        (
            "~費", "売り上げ", "売行き", "課税", "為替", "漁業", "工芸", "小遣い",
            "作製", "紙幣", "集金", "商業", "消耗", "水産", "製作", "創作",
            "定価", "特売", "売買", "発売", "名物", "免税", "儲かる", "省~",
            "こしらえる",
        ),
    ),
    "vocab_n2_government_society": (
        "Vocabulary: N2 · Government & Society", "n2", 1,
        (
            "~国", "~省", "~団", "改める", "官庁", "規律", "交代", "自治",
            "国立", "祭日", "祝日", "政党", "総理大臣", "当番", "方針", "法則",
            "役所", "役人", "役目", "こくせき", "指定", "合同", "体制", "定員",
            "区域",
        ),
    ),
    "vocab_n2_measure_analysis": (
        "Vocabulary: N2 · Measurement & Analysis", "n2", 2,
        (
            "~論", "基準", "規準", "原理", "資料", "寸法", "測定", "測量",
            "対策", "例える", "断定", "採る", "比較的", "標準", "分解", "目安",
            "物差し", "割合に", "割と", "面積", "体積", "容積", "直角", "地質",
            "目印",
        ),
    ),
    "vocab_n2_land_construction": (
        "Vocabulary: N2 · Land & Construction", "n2", 3,
        (
            "~館", "~器", "~圏", "~丁目", "~島", "~道", "~領", "家屋",
            "組み立てる", "工事", "構造", "耕地", "交通機関", "産地", "下町",
            "線路", "造船", "地帯", "鉄橋", "都心", "並木", "ビルディング",
            "故郷", "方面", "牧場",
        ),
    ),
    # --- N1 ---------------------------------------------------------------
    "vocab_n1_law_justice": (
        "Vocabulary: N1 · Law & Justice", "n1", 0,
        (
            "権力", "公用", "権威", "権限", "検事", "元首", "内閣", "威力",
            "訴え", "規定", "刑罰", "統制", "統治", "死刑", "正義", "訴訟",
            "長官", "司る", "司法", "主権", "不当", "法案", "法学", "法廷",
            "立法",
        ),
    ),
    "vocab_n1_thought_reason": (
        "Vocabulary: N1 · Thought & Reason", "n1", 1,
        (
            "原則", "構想", "自覚", "内心", "概念", "学説", "教訓", "軽率",
            "思考", "ありのまま", "真実", "真相", "粋", "推理", "それゆえ",
            "建前", "魂", "論理", "実態", "本気", "本質", "誠", "理屈", "理性",
            "理論",
        ),
    ),
    "vocab_n1_conflict_crisis": (
        "Vocabulary: N1 · Conflict & Crisis", "n1", 2,
        (
            "国防", "災害", "作戦", "内乱", "敗戦", "応急", "侵す", "襲う",
            "脅す", "脅かす", "危機", "脅迫", "緊急", "軍艦", "軍事", "軍備",
            "軍服", "警戒", "天災", "争い", "守備", "陣", "攻め", "戦災",
            "戦闘",
        ),
    ),
    "vocab_n1_arts_expression": (
        "Vocabulary: N1 · Arts & Expression", "n1", 3,
        (
            "語源", "エレガント", "演じる", "学芸", "片言", "漢語", "戯曲", "芸",
            "気品", "脚色", "掲載", "創刊", "現像", "光沢", "細工", "さえずる",
            "しきたり", "劇団", "ネガ", "楽譜", "合唱", "油絵", "展示", "伝説",
            "上演",
        ),
    ),
}


def _vocab_level_corpus(level: str) -> list[_ExternalRow]:
    """Return the imported corpus rows for one JLPT vocabulary level."""
    return {
        "n4": VOCAB_N4_EXTERNAL_DATA,
        "n3": VOCAB_N3_EXTERNAL_DATA,
        "n2": VOCAB_N2_EXTERNAL_DATA,
        "n1": VOCAB_N1_EXTERNAL_DATA,
    }[level]


def unresolved_vocab_category_words(slug: str) -> list[str]:
    """Return curated words for ``slug`` that are missing from its level corpus.

    An empty list means the category is intact. A non-empty one means the
    corpus drifted away from the curated selection — the deck still builds
    (those words are simply absent) but it is quietly smaller than intended,
    so ``tests/test_decks.py`` fails on it.

    Public rather than underscore-private because it is a drift *accessor*, not
    a deck builder: it reads the private ``_VOCAB_LEVEL_CATEGORY_SPECS`` table
    on behalf of the test suite and any future content-lint tooling.
    """
    _, level, _, words = _VOCAB_LEVEL_CATEGORY_SPECS[slug]
    available = {char for char, _reading, _meaning in _vocab_level_corpus(level)}
    return [word for word in words if word not in available]


def _build_vocab_category_deck(slug: str) -> Deck:
    """Build one N4–N1 thematic vocabulary deck from its curated word list."""
    name, level, slot, words = _VOCAB_LEVEL_CATEGORY_SPECS[slug]
    if len(words) > _VOCAB_CATEGORY_ID_SPACING:
        raise ValueError(
            f"Vocabulary category {slug!r} curates {len(words)} words but only "
            f"{_VOCAB_CATEGORY_ID_SPACING} card ids are reserved per category slot. "
            f"Widen _VOCAB_CATEGORY_ID_SPACING in domain/decks.py — overflowing the "
            f"slot silently corrupts SRS/mastery state."
        )
    by_character = {char: (char, reading, meaning) for char, reading, meaning in _vocab_level_corpus(level)}
    id_offset = _VOCAB_CATEGORY_LEVEL_BASE[level] + slot * _VOCAB_CATEGORY_ID_SPACING
    cards = [
        _vocab_card(id_offset + index, *by_character[word], level)
        for index, word in enumerate(words)
        if word in by_character
    ]
    return Deck(name=name, cards=cards)


def get_vocab_n4_school_work_deck() -> Deck:
    return _build_vocab_category_deck("vocab_n4_school_work")


def get_vocab_n4_home_living_deck() -> Deck:
    return _build_vocab_category_deck("vocab_n4_home_living")


def get_vocab_n4_travel_places_deck() -> Deck:
    return _build_vocab_category_deck("vocab_n4_travel_places")


def get_vocab_n4_feelings_character_deck() -> Deck:
    return _build_vocab_category_deck("vocab_n4_feelings_character")


def get_vocab_n3_work_business_deck() -> Deck:
    return _build_vocab_category_deck("vocab_n3_work_business")


def get_vocab_n3_emotion_mind_deck() -> Deck:
    return _build_vocab_category_deck("vocab_n3_emotion_mind")


def get_vocab_n3_society_people_deck() -> Deck:
    return _build_vocab_category_deck("vocab_n3_society_people")


def get_vocab_n3_nature_science_deck() -> Deck:
    return _build_vocab_category_deck("vocab_n3_nature_science")


def get_vocab_n2_economy_trade_deck() -> Deck:
    return _build_vocab_category_deck("vocab_n2_economy_trade")


def get_vocab_n2_government_society_deck() -> Deck:
    return _build_vocab_category_deck("vocab_n2_government_society")


def get_vocab_n2_measure_analysis_deck() -> Deck:
    return _build_vocab_category_deck("vocab_n2_measure_analysis")


def get_vocab_n2_land_construction_deck() -> Deck:
    return _build_vocab_category_deck("vocab_n2_land_construction")


def get_vocab_n1_law_justice_deck() -> Deck:
    return _build_vocab_category_deck("vocab_n1_law_justice")


def get_vocab_n1_thought_reason_deck() -> Deck:
    return _build_vocab_category_deck("vocab_n1_thought_reason")


def get_vocab_n1_conflict_crisis_deck() -> Deck:
    return _build_vocab_category_deck("vocab_n1_conflict_crisis")


def get_vocab_n1_arts_expression_deck() -> Deck:
    return _build_vocab_category_deck("vocab_n1_arts_expression")


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
_DECK_BUILDERS = {
    "hiragana": get_hiragana_deck,
    "katakana": get_katakana_deck,
    # Kanji — JLPT levels (kept for backward compatibility)
    "kanji_n5": get_kanji_n5_deck,
    "kanji_n4": get_kanji_n4_deck,
    "kanji_n3": get_kanji_n3_deck,
    "kanji_n2": get_kanji_n2_deck,
    "kanji_n1": get_kanji_n1_deck,
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
    # Vocabulary — N4 thematic categories
    "vocab_n4_school_work":        get_vocab_n4_school_work_deck,
    "vocab_n4_home_living":        get_vocab_n4_home_living_deck,
    "vocab_n4_travel_places":      get_vocab_n4_travel_places_deck,
    "vocab_n4_feelings_character": get_vocab_n4_feelings_character_deck,
    # Vocabulary — N3 thematic categories
    "vocab_n3_work_business":  get_vocab_n3_work_business_deck,
    "vocab_n3_emotion_mind":   get_vocab_n3_emotion_mind_deck,
    "vocab_n3_society_people": get_vocab_n3_society_people_deck,
    "vocab_n3_nature_science": get_vocab_n3_nature_science_deck,
    # Vocabulary — N2 thematic categories
    "vocab_n2_economy_trade":      get_vocab_n2_economy_trade_deck,
    "vocab_n2_government_society": get_vocab_n2_government_society_deck,
    "vocab_n2_measure_analysis":   get_vocab_n2_measure_analysis_deck,
    "vocab_n2_land_construction":  get_vocab_n2_land_construction_deck,
    # Vocabulary — N1 thematic categories
    "vocab_n1_law_justice":      get_vocab_n1_law_justice_deck,
    "vocab_n1_thought_reason":   get_vocab_n1_thought_reason_deck,
    "vocab_n1_conflict_crisis":  get_vocab_n1_conflict_crisis_deck,
    "vocab_n1_arts_expression":  get_vocab_n1_arts_expression_deck,
    # Grammar / Conversational
    "grammar_patterns": get_grammar_patterns_deck,
    "sentence_examples": get_sentence_examples_deck,
    "conjugation_training": get_conjugation_training_deck,
}


# ---------------------------------------------------------------------------
# Thematic categories as views over their parent level deck (issue #78)
# ---------------------------------------------------------------------------
#
# The category builders above allocate their own `id_offset`, which gave one word
# two card ids, two `review_states` rows and two FSRS schedules — 見る/647 in
# `vocab_n5` and みる/1104 in `vocab_verbs` were the same word learned twice.
#
# Those builders are now *source data for matching* rather than decks anyone
# studies. `ALL_DECKS` serves a view instead: the same slug, but the parent
# deck's name and the parent's own cards. Keeping the parent's name matters as
# much as keeping its ids, because `review_states` is keyed `(deck_name, card_id)`
# — a view with its own name would just relocate the split rather than close it.
#
# Slugs are unchanged, so `VOCAB_CATEGORY_TO_DECK_SLUG` and every other consumer
# keeps working; a category request simply returns that slice of the parent.

_LEVEL_SUFFIXES: tuple[str, ...] = ("n5", "n4", "n3", "n2", "n1")


def _is_category_slug(slug: str) -> bool:
    """Return whether a slug names a thematic category rather than a level deck."""
    for family in ("vocab", "kanji"):
        if slug.startswith(f"{family}_") and slug not in {f"{family}_{lv}" for lv in _LEVEL_SUFFIXES}:
            return True
    return False


#: The authored category builders, keyed by slug. These still emit the original
#: standalone ids; :mod:`domain.block_mapping` reads them to work out which
#: parent card each one refers to. Nothing else should build decks from here.
CATEGORY_SOURCE_DECKS: dict[str, Callable[[], Deck]] = {
    slug: builder for slug, builder in _DECK_BUILDERS.items() if _is_category_slug(slug)
}


def _category_view(slug: str) -> Callable[[], Deck]:
    """Return a loader yielding the parent deck's cards for one category."""

    def build() -> Deck:
        # Imported lazily: block_mapping imports this module, and it reads
        # CATEGORY_SOURCE_DECKS, which is only populated once this module has
        # finished executing.
        from domain.block_mapping import parent_slug_for_category, resolve_category_card_ids

        parent_slug = parent_slug_for_category(slug)
        assert parent_slug is not None, f"{slug!r} is registered as a category but has no parent"
        parent = _DECK_BUILDERS[parent_slug]()
        wanted = set(resolve_category_card_ids(slug))
        # The category slug rides along as a tag so callers can still tell which
        # category a card was served under — the id and deck name no longer say.
        return Deck(
            name=parent.name,
            cards=[
                replace(card, tags=[*card.tags, slug]) if slug not in card.tags else card
                for card in parent.cards
                if card.id in wanted
            ],
        )

    return build


ALL_DECKS: dict[str, Callable[[], Deck]] = {
    slug: (_category_view(slug) if _is_category_slug(slug) else builder)
    for slug, builder in _DECK_BUILDERS.items()
}
