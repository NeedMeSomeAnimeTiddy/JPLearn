"""Pure Japanese verb/adjective conjugation rules for the conjugation drill.

No I/O, no tokenizer, no randomness: the caller supplies an already-classified
word (``data/conjugation_drill.py`` derives the class from UniDic) and this
module answers "what is the <form> of this word".

Surface and reading are conjugated in parallel rather than the surface alone,
because vocabulary cards carry a kanji surface (``会う``) and romaji — never
kana — so the kana half of the accepted-answer set has to be produced here.
For every class except ``kuru`` the inflected tail is identical in both, so the
same tail rule applies to each string; ``来る`` is table-driven instead because
its stem reading changes (き/こ) while the kanji stays put.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

WordClass = Literal[
    "godan",
    "ichidan",
    "suru",
    "kuru",
    "i_adjective",
    "na_adjective",
]

ConjugationForm = Literal[
    # Core — the polite/plain square every beginner drills first.
    "te",
    "past",
    "negative",
    "past_negative",
    "polite",
    "polite_past",
    "polite_negative",
    "polite_past_negative",
    # Intermediate.
    "potential",
    "volitional",
    "desiderative",
    "conditional_tara",
    "conditional_ba",
    "adverbial",
    "attributive",
    # Advanced.
    "passive",
    "causative",
    "causative_passive",
    "imperative",
]

#: Which forms a round may ask at each curriculum stage. Stage N includes every
#: earlier stage, so the sets are cumulative at the call site, not here.
STAGE_FORMS: dict[int, tuple[ConjugationForm, ...]] = {
    1: (
        "te",
        "past",
        "negative",
        "past_negative",
        "polite",
        "polite_past",
        "polite_negative",
        "polite_past_negative",
    ),
    2: (
        "potential",
        "volitional",
        "desiderative",
        "conditional_tara",
        "conditional_ba",
        "adverbial",
        "attributive",
    ),
    3: (
        "passive",
        "causative",
        "causative_passive",
        "imperative",
    ),
}

FORM_LABELS: dict[ConjugationForm, str] = {
    "te": "te-form",
    "past": "plain past",
    "negative": "plain negative",
    "past_negative": "plain past negative",
    "polite": "polite (〜ます)",
    "polite_past": "polite past",
    "polite_negative": "polite negative",
    "polite_past_negative": "polite past negative",
    "potential": "potential (can do)",
    "volitional": "volitional (let's)",
    "desiderative": "want to (〜たい)",
    "conditional_tara": "conditional (〜たら)",
    "conditional_ba": "provisional (〜ば)",
    "adverbial": "adverbial",
    "attributive": "before a noun",
    "passive": "passive",
    "causative": "causative",
    "causative_passive": "causative-passive",
    "imperative": "imperative",
}


@dataclass(frozen=True)
class ConjugatedForm:
    """One conjugated result and every spelling that should be marked correct.

    ``alternates`` exists because several forms have more than one standard
    answer — ``静かじゃない`` and ``静かではない`` are both right, and this drill
    writes to the card's SRS state, so accepting only one would punish the
    learner for the wrong reason.
    """

    form: ConjugationForm
    label: str
    surface: str
    reading: str
    word_class: WordClass
    alternates: tuple[str, ...] = ()

    @property
    def accepted(self) -> tuple[str, ...]:
        """Every spelling a typed answer may match, de-duplicated."""
        return tuple(dict.fromkeys((self.surface, self.reading, *self.alternates)))


class ConjugationError(ValueError):
    """Raised when a word cannot be inflected into the requested form."""


# ── Godan kana rows ───────────────────────────────────────────────────────────
# Final kana → (a-stem, i-stem, e-stem, o-stem). The a-stem of an う-final verb
# is わ, not あ — the one row that is not a plain vowel shift.
_GODAN_ROWS: dict[str, tuple[str, str, str, str]] = {
    "う": ("わ", "い", "え", "お"),
    "く": ("か", "き", "け", "こ"),
    "ぐ": ("が", "ぎ", "げ", "ご"),
    "す": ("さ", "し", "せ", "そ"),
    "つ": ("た", "ち", "て", "と"),
    "ぬ": ("な", "に", "ね", "の"),
    "ぶ": ("ば", "び", "べ", "ぼ"),
    "む": ("ま", "み", "め", "も"),
    "る": ("ら", "り", "れ", "ろ"),
}

#: Final kana → (te-form suffix, past suffix) — the onbin table.
_GODAN_ONBIN: dict[str, tuple[str, str]] = {
    "う": ("って", "った"),
    "つ": ("って", "った"),
    "る": ("って", "った"),
    "む": ("んで", "んだ"),
    "ぶ": ("んで", "んだ"),
    "ぬ": ("んで", "んだ"),
    "く": ("いて", "いた"),
    "ぐ": ("いで", "いだ"),
    "す": ("して", "した"),
}

#: 行く takes the っ onbin its row does not predict (行って, not 行いて).
_IKU_READINGS = ("いく", "ゆく")

#: Verbs whose meaning makes the advanced voices useless or ungrammatical to
#: drill. Keyed on reading so a kanji or kana surface both match.
_STATIVE_READINGS = frozenset({"ある", "いる", "できる", "わかる", "みえる", "きこえる", "いる"})

#: Honorific irregulars (くださる → くださいます) whose masu-stem breaks the
#: godan rule. Excluded outright rather than special-cased.
_HONORIFIC_IRREGULARS = frozenset({"くださる", "いらっしゃる", "おっしゃる", "なさる", "ござる"})

_ICHIDAN_ENDINGS: dict[ConjugationForm, str] = {
    "te": "て",
    "past": "た",
    "negative": "ない",
    "past_negative": "なかった",
    "polite": "ます",
    "polite_past": "ました",
    "polite_negative": "ません",
    "polite_past_negative": "ませんでした",
    "potential": "られる",
    "volitional": "よう",
    "desiderative": "たい",
    "conditional_tara": "たら",
    "conditional_ba": "れば",
    "passive": "られる",
    "causative": "させる",
    "causative_passive": "させられる",
    "imperative": "ろ",
}

_SURU_ENDINGS: dict[ConjugationForm, str] = {
    "te": "して",
    "past": "した",
    "negative": "しない",
    "past_negative": "しなかった",
    "polite": "します",
    "polite_past": "しました",
    "polite_negative": "しません",
    "polite_past_negative": "しませんでした",
    "potential": "できる",
    "volitional": "しよう",
    "desiderative": "したい",
    "conditional_tara": "したら",
    "conditional_ba": "すれば",
    "passive": "される",
    "causative": "させる",
    "causative_passive": "させられる",
    "imperative": "しろ",
}

#: 来る keeps its kanji and swaps only okurigana, while the reading swaps stem
#: vowel too — hence (surface okurigana, full kana reading) pairs.
_KURU_FORMS: dict[ConjugationForm, tuple[str, str]] = {
    "te": ("て", "きて"),
    "past": ("た", "きた"),
    "negative": ("ない", "こない"),
    "past_negative": ("なかった", "こなかった"),
    "polite": ("ます", "きます"),
    "polite_past": ("ました", "きました"),
    "polite_negative": ("ません", "きません"),
    "polite_past_negative": ("ませんでした", "きませんでした"),
    "potential": ("られる", "こられる"),
    "volitional": ("よう", "こよう"),
    "desiderative": ("たい", "きたい"),
    "conditional_tara": ("たら", "きたら"),
    "conditional_ba": ("れば", "くれば"),
    "passive": ("られる", "こられる"),
    "causative": ("させる", "こさせる"),
    "causative_passive": ("させられる", "こさせられる"),
    "imperative": ("い", "こい"),
}

_I_ADJECTIVE_ENDINGS: dict[ConjugationForm, str] = {
    "te": "くて",
    "past": "かった",
    "negative": "くない",
    "past_negative": "くなかった",
    "polite": "いです",
    "polite_past": "かったです",
    "polite_negative": "くないです",
    "polite_past_negative": "くなかったです",
    "conditional_tara": "かったら",
    "conditional_ba": "ければ",
    "adverbial": "く",
    "attributive": "い",
}

_NA_ADJECTIVE_ENDINGS: dict[ConjugationForm, str] = {
    "te": "で",
    "past": "だった",
    "negative": "じゃない",
    "past_negative": "じゃなかった",
    "polite": "です",
    "polite_past": "でした",
    "polite_negative": "じゃありません",
    "polite_past_negative": "じゃありませんでした",
    "conditional_tara": "だったら",
    "conditional_ba": "なら",
    "adverbial": "に",
    "attributive": "な",
}

#: Equally standard spellings of the same form, applied to the same stem as the
#: primary ending. じゃ/では is a register difference, not a correctness one, and
#: both 〜くないです and 〜くありません are taught as the polite negative.
_ALTERNATE_ENDINGS: dict[WordClass, dict[ConjugationForm, tuple[str, ...]]] = {
    "i_adjective": {
        "polite_negative": ("くありません",),
        "polite_past_negative": ("くありませんでした",),
    },
    "na_adjective": {
        "negative": ("ではない",),
        "past_negative": ("ではなかった",),
        "polite_negative": ("ではありません", "じゃないです", "ではないです"),
        "polite_past_negative": (
            "ではありませんでした",
            "じゃなかったです",
            "ではなかったです",
        ),
    },
}

#: ある is regular everywhere except the negative pair, which suppletes to ない.
_ARU_OVERRIDES: dict[ConjugationForm, str] = {
    "negative": "ない",
    "past_negative": "なかった",
}

_VERB_CLASSES: frozenset[str] = frozenset({"godan", "ichidan", "suru", "kuru"})
_ADJECTIVE_CLASSES: frozenset[str] = frozenset({"i_adjective", "na_adjective"})


def applicable_forms(word_class: WordClass, reading: str) -> frozenset[ConjugationForm]:
    """Return the forms it is meaningful to ask for this word.

    Excluding rather than mis-generating matters here: the drill grades typed
    answers against a vocabulary card's SRS state, so asking for the imperative
    of ある would mark a learner wrong for correctly refusing to produce it.
    """
    normalized = reading.strip()
    if not normalized or normalized in _HONORIFIC_IRREGULARS:
        return frozenset()

    if word_class in _ADJECTIVE_CLASSES:
        forms = set(
            _I_ADJECTIVE_ENDINGS if word_class == "i_adjective" else _NA_ADJECTIVE_ENDINGS
        )
        if word_class == "i_adjective":
            forms.discard("attributive")  # 高い before a noun is the dictionary form
        return frozenset(forms)  # type: ignore[arg-type]

    forms = set(FORM_LABELS)
    forms.discard("adverbial")
    forms.discard("attributive")

    if normalized in _STATIVE_READINGS:
        # No agent to command, coerce, or demote to patient.
        forms -= {"imperative", "passive", "causative", "causative_passive", "volitional"}
        if normalized in {"できる", "わかる", "みえる", "きこえる"}:
            forms.discard("potential")  # already potential in meaning
    return frozenset(forms)  # type: ignore[arg-type]


def forms_for_stage(word_class: WordClass, reading: str, stage: int) -> tuple[ConjugationForm, ...]:
    """Applicable forms unlocked at ``stage``, in a stable order.

    Stages are cumulative: a stage-3 card may still be asked a core form.
    """
    bounded_stage = max(1, min(3, stage))
    allowed = applicable_forms(word_class, reading)
    unlocked: list[ConjugationForm] = []
    for level in range(1, bounded_stage + 1):
        unlocked.extend(form for form in STAGE_FORMS[level] if form in allowed)
    return tuple(unlocked)


def _apply_godan(text: str, form: ConjugationForm, *, is_iku: bool) -> str:
    stem, final = text[:-1], text[-1]
    if final not in _GODAN_ROWS:
        raise ConjugationError(f"'{text}' does not end in a godan kana")
    a_stem, i_stem, e_stem, o_stem = _GODAN_ROWS[final]

    if form in {"te", "past", "conditional_tara"}:
        te_suffix, past_suffix = ("って", "った") if is_iku else _GODAN_ONBIN[final]
        if form == "te":
            return stem + te_suffix
        if form == "past":
            return stem + past_suffix
        return stem + past_suffix + "ら"

    if form == "negative":
        return stem + a_stem + "ない"
    if form == "past_negative":
        return stem + a_stem + "なかった"
    if form == "passive":
        return stem + a_stem + "れる"
    if form == "causative":
        return stem + a_stem + "せる"
    if form == "causative_passive":
        return stem + a_stem + "せられる"
    if form == "polite":
        return stem + i_stem + "ます"
    if form == "polite_past":
        return stem + i_stem + "ました"
    if form == "polite_negative":
        return stem + i_stem + "ません"
    if form == "polite_past_negative":
        return stem + i_stem + "ませんでした"
    if form == "desiderative":
        return stem + i_stem + "たい"
    if form == "potential":
        return stem + e_stem + "る"
    if form == "conditional_ba":
        return stem + e_stem + "ば"
    if form == "imperative":
        return stem + e_stem
    if form == "volitional":
        return stem + o_stem + "う"
    raise ConjugationError(f"Unsupported godan form: {form}")


def _apply_ichidan(text: str, form: ConjugationForm) -> str:
    if not text.endswith("る"):
        raise ConjugationError(f"'{text}' is not an ichidan verb")
    ending = _ICHIDAN_ENDINGS.get(form)
    if ending is None:
        raise ConjugationError(f"Unsupported ichidan form: {form}")
    return text[:-1] + ending


def _apply_suru(text: str, form: ConjugationForm) -> str:
    if not text.endswith("する"):
        raise ConjugationError(f"'{text}' is not a suru verb")
    ending = _SURU_ENDINGS.get(form)
    if ending is None:
        raise ConjugationError(f"Unsupported suru form: {form}")
    return text[:-2] + ending


def _apply_i_adjective(text: str, form: ConjugationForm, *, is_ii: bool, ending: str) -> str:
    if not text.endswith("い"):
        raise ConjugationError(f"'{text}' is not an i-adjective")
    # いい inflects off よ- in every form but the plain polite (いいです).
    if is_ii and form != "polite" and text.endswith("いい"):
        return text[:-2] + "よ" + ending
    return text[:-1] + ending


def _apply_na_adjective(text: str, ending: str) -> str:
    return text + ending


def _apply_kuru(surface: str, reading: str, form: ConjugationForm) -> tuple[str, str]:
    entry = _KURU_FORMS.get(form)
    if entry is None:
        raise ConjugationError(f"Unsupported kuru form: {form}")
    okurigana, kana = entry
    if surface.endswith("来る"):
        conjugated_surface = surface[:-1] + okurigana
    elif surface.endswith("くる"):
        conjugated_surface = surface[:-2] + kana
    else:
        raise ConjugationError(f"'{surface}' is not the verb 来る")
    conjugated_reading = reading[:-2] + kana if reading.endswith("くる") else kana
    return conjugated_surface, conjugated_reading


def conjugate(
    surface: str,
    reading: str,
    word_class: WordClass,
    form: ConjugationForm,
) -> ConjugatedForm:
    """Inflect ``surface``/``reading`` into ``form``.

    Raises:
        ConjugationError: if the word cannot take this form, or the strings do
            not match the shape their class requires.
    """
    clean_surface = surface.strip()
    clean_reading = reading.strip()
    if not clean_surface or not clean_reading:
        raise ConjugationError("Both a surface and a reading are required")
    if form not in applicable_forms(word_class, clean_reading):
        raise ConjugationError(f"{form} does not apply to '{clean_surface}'")

    alternates: tuple[str, ...] = ()
    if word_class == "kuru":
        conjugated_surface, conjugated_reading = _apply_kuru(clean_surface, clean_reading, form)
    elif clean_reading == "ある" and form in _ARU_OVERRIDES:
        conjugated_surface = conjugated_reading = _ARU_OVERRIDES[form]
    else:
        is_iku = word_class == "godan" and clean_reading in _IKU_READINGS
        is_ii = word_class == "i_adjective" and clean_reading.endswith("いい")
        conjugated_surface = _apply(clean_surface, word_class, form, is_iku=is_iku, is_ii=is_ii)
        conjugated_reading = _apply(clean_reading, word_class, form, is_iku=is_iku, is_ii=is_ii)
        alternates = tuple(
            spelling
            for ending in _ALTERNATE_ENDINGS.get(word_class, {}).get(form, ())
            for spelling in (
                _apply(clean_surface, word_class, form, is_iku=is_iku, is_ii=is_ii, ending=ending),
                _apply(clean_reading, word_class, form, is_iku=is_iku, is_ii=is_ii, ending=ending),
            )
        )

    return ConjugatedForm(
        form=form,
        label=FORM_LABELS[form],
        surface=conjugated_surface,
        reading=conjugated_reading,
        word_class=word_class,
        alternates=alternates,
    )


def _apply(
    text: str,
    word_class: WordClass,
    form: ConjugationForm,
    *,
    is_iku: bool,
    is_ii: bool,
    ending: str | None = None,
) -> str:
    """Inflect one string. ``ending`` overrides the primary adjective ending."""
    if word_class == "godan":
        return _apply_godan(text, form, is_iku=is_iku)
    if word_class == "ichidan":
        return _apply_ichidan(text, form)
    if word_class == "suru":
        return _apply_suru(text, form)
    if word_class == "i_adjective":
        resolved = ending if ending is not None else _I_ADJECTIVE_ENDINGS.get(form)
        if resolved is None:
            raise ConjugationError(f"Unsupported i-adjective form: {form}")
        return _apply_i_adjective(text, form, is_ii=is_ii, ending=resolved)
    if word_class == "na_adjective":
        resolved = ending if ending is not None else _NA_ADJECTIVE_ENDINGS.get(form)
        if resolved is None:
            raise ConjugationError(f"Unsupported na-adjective form: {form}")
        return _apply_na_adjective(text, resolved)
    raise ConjugationError(f"Unsupported word class: {word_class}")


def is_verb_class(word_class: WordClass) -> bool:
    """True when the class inflects as a verb rather than an adjective."""
    return word_class in _VERB_CLASSES
