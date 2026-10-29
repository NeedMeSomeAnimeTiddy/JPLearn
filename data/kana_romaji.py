"""Kana to romaji, exactly as the JLPT vocabulary corpus was converted.

Moved unchanged from scripts/convert_jlpt_vocab_csv.py (audit 14) so the dictionary enrichment can
compare a dictionary entry's reading with a card's romaji using the same converter that produced
that romaji. Its quirks (``shimbun``, ``paateii``) are part of the corpus, so do not "fix" them here:
the corpus would no longer match.
"""

from __future__ import annotations

import re

from data.text_normalization import normalize_storage_text

_KATAKANA_TO_HIRAGANA_START = ord("ァ")
_KATAKANA_TO_HIRAGANA_END = ord("ン")

_DIGRAPHS: dict[str, str] = {
    "きゃ": "kya",
    "きゅ": "kyu",
    "きょ": "kyo",
    "ぎゃ": "gya",
    "ぎゅ": "gyu",
    "ぎょ": "gyo",
    "しゃ": "sha",
    "しゅ": "shu",
    "しょ": "sho",
    "じゃ": "ja",
    "じゅ": "ju",
    "じょ": "jo",
    "ちゃ": "cha",
    "ちゅ": "chu",
    "ちょ": "cho",
    "にゃ": "nya",
    "にゅ": "nyu",
    "にょ": "nyo",
    "ひゃ": "hya",
    "ひゅ": "hyu",
    "ひょ": "hyo",
    "びゃ": "bya",
    "びゅ": "byu",
    "びょ": "byo",
    "ぴゃ": "pya",
    "ぴゅ": "pyu",
    "ぴょ": "pyo",
    "みゃ": "mya",
    "みゅ": "myu",
    "みょ": "myo",
    "りゃ": "rya",
    "りゅ": "ryu",
    "りょ": "ryo",
    "ゔぁ": "va",
    "ゔぃ": "vi",
    "ゔ": "vu",
    "ゔぇ": "ve",
    "ゔぉ": "vo",
}

_MONOGRAPHS: dict[str, str] = {
    "あ": "a",
    "い": "i",
    "う": "u",
    "え": "e",
    "お": "o",
    "か": "ka",
    "き": "ki",
    "く": "ku",
    "け": "ke",
    "こ": "ko",
    "が": "ga",
    "ぎ": "gi",
    "ぐ": "gu",
    "げ": "ge",
    "ご": "go",
    "さ": "sa",
    "し": "shi",
    "す": "su",
    "せ": "se",
    "そ": "so",
    "ざ": "za",
    "じ": "ji",
    "ず": "zu",
    "ぜ": "ze",
    "ぞ": "zo",
    "た": "ta",
    "ち": "chi",
    "つ": "tsu",
    "て": "te",
    "と": "to",
    "だ": "da",
    "ぢ": "ji",
    "づ": "zu",
    "で": "de",
    "ど": "do",
    "な": "na",
    "に": "ni",
    "ぬ": "nu",
    "ね": "ne",
    "の": "no",
    "は": "ha",
    "ひ": "hi",
    "ふ": "fu",
    "へ": "he",
    "ほ": "ho",
    "ば": "ba",
    "び": "bi",
    "ぶ": "bu",
    "べ": "be",
    "ぼ": "bo",
    "ぱ": "pa",
    "ぴ": "pi",
    "ぷ": "pu",
    "ぺ": "pe",
    "ぽ": "po",
    "ま": "ma",
    "み": "mi",
    "む": "mu",
    "め": "me",
    "も": "mo",
    "や": "ya",
    "ゆ": "yu",
    "よ": "yo",
    "ら": "ra",
    "り": "ri",
    "る": "ru",
    "れ": "re",
    "ろ": "ro",
    "わ": "wa",
    "を": "o",
    "ん": "n",
    "ぁ": "a",
    "ぃ": "i",
    "ぅ": "u",
    "ぇ": "e",
    "ぉ": "o",
    "ゎ": "wa",
}

_SPACE_LIKE = set(" 　\t\r\n/・,，、;；")


def _normalize(text: str) -> str:
    return normalize_storage_text(text)


def _katakana_to_hiragana(text: str) -> str:
    chars: list[str] = []
    for ch in text:
        code = ord(ch)
        if _KATAKANA_TO_HIRAGANA_START <= code <= _KATAKANA_TO_HIRAGANA_END:
            chars.append(chr(code - 0x60))
        else:
            chars.append(ch)
    return "".join(chars)


def _last_vowel(token: str) -> str:
    for ch in reversed(token):
        if ch in "aeiou":
            return ch
    return ""


def _next_consonant(roma: str) -> str:
    for ch in roma:
        if ch.isalpha() and ch not in "aeiou":
            return ch
    return ""


def kana_to_romaji(kana_text: str) -> str:
    text = _katakana_to_hiragana(_normalize(kana_text)).lower()
    tokens: list[str] = []
    i = 0

    while i < len(text):
        ch = text[i]

        if ch in _SPACE_LIKE:
            if tokens and tokens[-1] != " ":
                tokens.append(" ")
            i += 1
            continue

        if ch == "っ":
            nxt = text[i + 1 : i + 3]
            roma = _DIGRAPHS.get(nxt)
            if not roma:
                roma = _MONOGRAPHS.get(text[i + 1 : i + 2], "") if i + 1 < len(text) else ""
            lead = _next_consonant(roma)
            if lead:
                tokens.append(lead)
            i += 1
            continue

        if ch == "ー":
            if tokens:
                vowel = _last_vowel(tokens[-1])
                if vowel:
                    tokens.append(vowel)
            i += 1
            continue

        if i + 1 < len(text):
            pair = text[i : i + 2]
            if pair in _DIGRAPHS:
                tokens.append(_DIGRAPHS[pair])
                i += 2
                continue

        mono = _MONOGRAPHS.get(ch)
        if mono:
            if ch == "ん" and i + 1 < len(text):
                nxt = text[i + 1 : i + 3]
                nxt_roma = _DIGRAPHS.get(nxt)
                if not nxt_roma:
                    nxt_roma = _MONOGRAPHS.get(text[i + 1], "")
                if nxt_roma.startswith(("b", "m", "p")):
                    mono = "m"
            tokens.append(mono)
        elif ch in "()（）[]{}~～":
            tokens.append(ch)
        elif ch.isascii():
            tokens.append(ch.lower())

        i += 1

    romaji = "".join(tokens)
    romaji = re.sub(r"\s+", " ", romaji).strip()
    return romaji
