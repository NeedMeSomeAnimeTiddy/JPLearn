"""Which dictionary entry, if any, is a deck card's own word (audit 14, F1).

A card's dictionary entry supplies its furigana, its reading and meaning clues, and extra answers
typed recall accepts (``typedRecallAssessment.ts``), so attaching another word's entry teaches and
grades the wrong thing. The free-text search the Dictionary panel uses ranks by prefix and parsed
base forms; that is right for a search box and wrong here, where about a fifth of N5/N4 cards came
back as a longer or different word ("no good" as "good-for-nothing man").

So a card takes an entry only when the entry is demonstrably the same word:

* its reading, converted with the converter that produced the corpus romaji, is one of the card's
  romaji readings (checked when the card has romaji); and
* it is spelled as the card is, in kanji, or otherwise shares a content word of meaning; and
* for a card written only in kana, it is read exactly as the card is spelled.

Anything else, including a tie between candidates that mean different things, attaches nothing:
the card shows only its own data (Robbie: "No dictionary clue").
"""

from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass

from data.kana_romaji import kana_to_romaji

_FORM_SEPARATORS_RE = re.compile(r"[;；]")
_LEADING_AFFIX_RE = re.compile(r"^[~〜～]+")
_TRAILING_ANNOTATION_RE = re.compile(r"^(?P<base>.*?)\s*[(（](?P<tail>[^)）]*)[)）]\s*$")
_LEADING_ANNOTATION_RE = re.compile(r"^[(（](?P<head>[^)）]*)[)）]\s*(?P<rest>.+)$")
_SURU = "する"
_KANA_ONLY_RE = re.compile(r"^[ぁ-ゖァ-ヺー・]+$")

# One reading per match: a word, optionally followed by a parenthesised optional tail
# ("kekkon (suru)"). Separators between readings are whitespace, "/", "," and ";".
_ROMAJI_READING_RE = re.compile(r"[^\s/,;()]+(?:\s*\([^)]*\))?")
_MACRONS = str.maketrans({"ā": "aa", "ī": "ii", "ū": "uu", "ē": "ee", "ō": "ou", "â": "aa", "î": "ii", "û": "uu", "ê": "ee", "ô": "ou"})

_MEANING_NOTE_RE = re.compile(r"\([^)]*\)|\[[^\]]*\]")
_WORD_RE = re.compile(r"[a-z]+")
_STOPWORDS = frozenset(
    {"to", "a", "an", "the", "of", "be", "one", "thing", "person", "is", "in", "on", "for", "or", "and", "with", "as", "at", "by", "etc", "something", "someone"}
)


@dataclass(frozen=True)
class CardEntryCandidate:
    entry_id: int
    japanese: str
    reading: str
    gloss: str
    is_common: bool


def normalize_form(text: str) -> str:
    """NFKC and trim. Case is kept: headwords such as "Tシャツ" are stored with their case."""
    return unicodedata.normalize("NFKC", text).strip()


def card_forms(character: str) -> list[str]:
    """The spellings a card stands for: "伯父; 叔父さん" is two, "~区" is "区", and an optional
    tail gives both the bare and the joined form ("パート (タイム)" is "パート" and "パートタイム")."""
    forms: list[str] = []
    for raw in _FORM_SEPARATORS_RE.split(character):
        form = _LEADING_AFFIX_RE.sub("", normalize_form(raw))
        variants = [form]
        leading = _LEADING_ANNOTATION_RE.match(form)
        if leading:
            rest = leading.group("rest").strip()
            variants = [rest, leading.group("head").strip() + rest]
        trailing = _TRAILING_ANNOTATION_RE.match(variants[0])
        if trailing:
            base = trailing.group("base").strip()
            variants = [base, base + trailing.group("tail").strip(), *variants[1:]]
        # A suru verb card ("べんきょうする") is the noun's entry in the dictionary ("勉強").
        variants += [variant[: -len(_SURU)] for variant in variants if variant.endswith(_SURU) and len(variant) > len(_SURU)]
        for variant in variants:
            variant = variant.strip()
            if variant and variant not in forms:
                forms.append(variant)
    return forms


def romaji_key(text: str) -> str:
    """One spelling for romaji that only differ in style: case, macrons, long vowels ("ō", "oo" and
    "ou" are one; "ē", "ee" and "ei"), "m"/"n" before b/m/p, apostrophes and separators."""
    lowered = unicodedata.normalize("NFKC", text).lower().translate(_MACRONS)
    letters = re.sub(r"[^a-z]", "", lowered)
    letters = letters.replace("oo", "ou").replace("ee", "ei")
    return re.sub(r"m(?=[bmp])", "n", letters)


def card_readings(romaji: str) -> set[str] | None:
    """The card's readings as romaji keys. None when the card has no romaji (the reading check is
    then skipped); an empty set when it has romaji with nothing usable in it (the check fails)."""
    if not romaji or not romaji.strip():
        return None
    readings: set[str] = set()
    for match in _ROMAJI_READING_RE.finditer(romaji):
        token = match.group(0)
        annotated = re.match(r"^(?P<base>[^()]*?)\s*\((?P<tail>[^)]*)\)$", token)
        variants = [token] if not annotated else [annotated.group("base"), annotated.group("base") + annotated.group("tail")]
        for variant in variants:
            key = romaji_key(variant)
            if key:
                readings.add(key)
    whole = romaji_key(romaji)
    if whole:
        readings.add(whole)
    readings |= {key[: -len("suru")] for key in readings if key.endswith("suru") and len(key) > len("suru")}
    return readings


def meaning_words(text: str) -> set[str]:
    stripped = _MEANING_NOTE_RE.sub(" ", text.lower())
    return {word for word in _WORD_RE.findall(stripped) if len(word) > 1 and word not in _STOPWORDS}


def is_kana_only(form: str) -> bool:
    return bool(_KANA_ONLY_RE.fullmatch(form))


def to_hiragana(text: str) -> str:
    return "".join(chr(ord(ch) - 0x60) if "ァ" <= ch <= "ヶ" else ch for ch in text)


# Romaji to hiragana, only to find candidates by reading when the index files the card's word under
# another spelling ("五日" as "５日", "御飯" as "ご飯"). It never decides a match: every candidate it
# finds is still checked with the corpus converter above, so an imperfect conversion only finds
# nothing.
_ROMAJI_SYLLABLES = {
    "kya": "きゃ", "kyu": "きゅ", "kyo": "きょ", "sha": "しゃ", "shu": "しゅ", "sho": "しょ", "chi": "ち",
    "cha": "ちゃ", "chu": "ちゅ", "cho": "ちょ", "tsu": "つ", "nya": "にゃ", "nyu": "にゅ", "nyo": "にょ",
    "hya": "ひゃ", "hyu": "ひゅ", "hyo": "ひょ", "mya": "みゃ", "myu": "みゅ", "myo": "みょ", "rya": "りゃ",
    "ryu": "りゅ", "ryo": "りょ", "gya": "ぎゃ", "gyu": "ぎゅ", "gyo": "ぎょ", "bya": "びゃ", "byu": "びゅ",
    "byo": "びょ", "pya": "ぴゃ", "pyu": "ぴゅ", "pyo": "ぴょ", "shi": "し", "ja": "じゃ", "ju": "じゅ",
    "jo": "じょ", "ji": "じ", "fu": "ふ",
    "ka": "か", "ki": "き", "ku": "く", "ke": "け", "ko": "こ", "sa": "さ", "su": "す", "se": "せ", "so": "そ",
    "ta": "た", "te": "て", "to": "と", "na": "な", "ni": "に", "nu": "ぬ", "ne": "ね", "no": "の",
    "ha": "は", "hi": "ひ", "he": "へ", "ho": "ほ", "ma": "ま", "mi": "み", "mu": "む", "me": "め", "mo": "も",
    "ya": "や", "yu": "ゆ", "yo": "よ", "ra": "ら", "ri": "り", "ru": "る", "re": "れ", "ro": "ろ",
    "wa": "わ", "wo": "を", "ga": "が", "gi": "ぎ", "gu": "ぐ", "ge": "げ", "go": "ご", "za": "ざ", "zu": "ず",
    "ze": "ぜ", "zo": "ぞ", "da": "だ", "de": "で", "do": "ど", "ba": "ば", "bi": "び", "bu": "ぶ", "be": "べ",
    "bo": "ぼ", "pa": "ぱ", "pi": "ぴ", "pu": "ぷ", "pe": "ぺ", "po": "ぽ",
    "a": "あ", "i": "い", "u": "う", "e": "え", "o": "お",
}


def romaji_to_hiragana(romaji: str) -> str | None:
    """Hepburn as the corpus writes it, to hiragana; None when any part does not convert."""
    text = re.sub(r"[^a-z]", "", romaji.lower())
    out: list[str] = []
    i = 0
    while i < len(text):
        if text[i] in "nm" and (i + 1 == len(text) or text[i + 1] not in "aeiouy"):
            if text[i] == "m" and (i + 1 == len(text) or text[i + 1] not in "bmp"):
                return None
            out.append("ん")
            i += 1
            continue
        if i + 1 < len(text) and text[i] == text[i + 1] and text[i] not in "aeioun":
            out.append("っ")
            i += 1
            continue
        if text.startswith("tch", i):
            out.append("っ")
            i += 1
            continue
        for size in (3, 2, 1):
            syllable = _ROMAJI_SYLLABLES.get(text[i : i + size])
            if syllable:
                out.append(syllable)
                i += size
                break
        else:
            return None
    return "".join(out) or None


def _gloss_words(gloss: str) -> set[str]:
    return meaning_words(gloss.replace(";", " "))


def choose_card_entry(
    candidates: list[CardEntryCandidate],
    *,
    forms: list[str],
    readings: set[str] | None,
    meaning: str,
) -> CardEntryCandidate | None:
    """The card's own entry among ``candidates``, or None. See the module docstring for the rule."""
    form_set = set(forms)
    kana_forms = {to_hiragana(form) for form in forms if is_kana_only(form)}
    # A card written only in kana spells its own reading, so an entry must be read exactly that way
    # (the card's romaji is not needed, and some of it was written by hand: "ku" for いただく).
    kana_card = bool(forms) and len(kana_forms) == len(forms)
    card_words = meaning_words(meaning)
    acceptable: list[tuple[CardEntryCandidate, bool, int, set[str]]] = []
    seen: set[int] = set()
    for candidate in candidates:
        if candidate.entry_id in seen:
            continue
        seen.add(candidate.entry_id)
        spelled_in_kana = to_hiragana(normalize_form(candidate.reading)) in kana_forms
        if kana_card and not spelled_in_kana:
            continue
        if (
            readings is not None
            and not spelled_in_kana
            and romaji_key(kana_to_romaji(candidate.reading)) not in readings
        ):
            continue
        # The same spelling only proves the same word when it has kanji in it: a kana headword is a
        # reading, and many words share one (あれ "that one" and あれ "huh?").
        japanese = normalize_form(candidate.japanese)
        exact = japanese in form_set and not is_kana_only(japanese)
        words = _gloss_words(candidate.gloss)
        overlap = len(card_words & words)
        if not exact and overlap == 0:
            continue
        acceptable.append((candidate, exact, overlap, words))
    if not acceptable:
        return None

    pool = [entry for entry in acceptable if entry[1]] or acceptable
    top = max(entry[2] for entry in pool)
    leaders = [entry for entry in pool if entry[2] == top]
    if not pool[0][1] and len(leaders) > 1:
        # Matched on reading alone and level on meaning: if any two of them share no content word,
        # they are different words that sound alike, and popularity is not evidence of which.
        for index, (_, _, _, words) in enumerate(leaders):
            for _, _, _, other in leaders[index + 1 :]:
                if not words & other:
                    return None
    leaders.sort(key=lambda entry: (not entry[0].is_common, entry[0].entry_id))
    return leaders[0][0]
