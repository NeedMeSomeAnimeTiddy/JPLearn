// Content templates extracted from App.tsx (Phase 7)
// Static data for round-building functions

type ScriptKey = 'hiragana' | 'katakana' | 'kanji_n5' | 'vocab_n5' | 'grammar_patterns' | 'sentence_examples'
type MinigameKey = 'romaji_sprint' | 'meaning_match' | 'character_match' | 'stroke_order' | 'typed_recall' | 'speech_recall' | 'sentence_assembly' | 'particle_cloze' | 'vibe_check' | 'imposter' | 'listening_audio_first' | 'dictation' | 'kanji_compound_builder' | 'context_cloze' | 'interleave_mix'
type PlayableMinigame = Exclude<MinigameKey, 'interleave_mix'>

export const SURPRISE_PROMPTS = [
  'Surprise Drill: trust your first instinct.',
  'Odd Prompt Mode: quick read, clean recall.',
  'Twist Round: stay sharp and answer fast.',
] as const

export const SCRIPT_MODE_PROMPT_PACKS: Record<ScriptKey, Partial<Record<PlayableMinigame, string[]>>> = {
  hiragana: {
    romaji_sprint: [
      'Sound Burst: read it aloud, then type it clean.',
      'Kana Echo: lock the vowel sound before you answer.',
    ],
    meaning_match: [
      'Kana Context: choose the meaning with the strongest cue.',
      'Quick Decode: ignore look-alikes and pick the exact sense.',
    ],
    character_match: [
      'Shape Recall: choose the symbol that matches the meaning.',
      'Script Snap: pick the kana form with confidence.',
    ],
    stroke_order: [
      'Stroke Trace: picture the write order before you answer.',
      'Form First: rebuild the symbol one part at a time.',
    ],
    typed_recall: [
      'Typed Recall: write the meaning from memory with clean spelling.',
      'No options this round: recall first, then type confidently.',
    ],
    speech_recall: [
      'Voice Recall: speak the meaning aloud, then let the mic catch every syllable.',
      'Say It Clean: trust the sound before you speak.',
    ],
    particle_cloze: [
      'Context Ladder: use sentence clues before touching options.',
      'Meaning Lens: infer the blank, then verify carefully.',
    ],
    imposter: [
      'Story Gate: read the scene and infer what completes the moment.',
      'Chapter Pulse: use narrative clues to choose the strongest fit.',
    ],
    listening_audio_first: [
      'Audio Challenge: listen closely before selecting the meaning.',
      'Ear First: trust what you hear and choose with confidence.',
    ],
    dictation: [
      'Hear and Write: listen closely and type what you hear.',
      'Sound-to-Text: trust your ear and type the character.',
    ],
    context_cloze: [
      'Kana Read: fill the missing word from the sentence context.',
      'Script Gap: use the sentence clues to choose the right word.',
    ],
  },
  katakana: {
    romaji_sprint: [
      'Loanword Sprint: hear the borrowed sound in your head first.',
      'Sharp Script: lock the consonant-vowel pair quickly.',
    ],
    meaning_match: [
      'Katakana Decode: pick the meaning that fits the imported term.',
      'Rapid Borrowing: map sound to meaning before selecting.',
    ],
    character_match: [
      'Glyph Match: choose the katakana symbol tied to the prompt.',
      'Name Lane: select the character used in modern terms.',
    ],
    stroke_order: [
      'Stroke Trace: picture the write order before you answer.',
      'Form First: rebuild the symbol one part at a time.',
    ],
    typed_recall: [
      'Typed Recall: write the exact meaning from memory.',
      'No hints mode: type what the prompt means in one shot.',
    ],
    speech_recall: [
      'Voice Recall: speak the exact meaning, trusting the borrowed sound.',
      'Say It Clean: commit to the term you would use in conversation.',
    ],
    particle_cloze: [
      'Loanword Context: let the sentence guide the missing term.',
      'Borrowed Meaning: infer from usage before selecting.',
    ],
    imposter: [
      'Story Gate: follow the borrowed-word scene and pick the right meaning.',
      'Chapter Pulse: use the narrative beat before selecting.',
    ],
    listening_audio_first: [
      'Audio Challenge: listen closely before selecting the meaning.',
      'Ear First: trust what you hear and choose with confidence.',
    ],
    dictation: [
      'Katakana Dictation: hear the sound and type the character.',
      'Sound-to-Form: listen carefully and produce the written form.',
    ],
    context_cloze: [
      'Sharp Fill: use the sentence to find the right katakana word.',
      'Loanword Gap: pick the katakana word that fits the sentence.',
    ],
  },
  kanji_n5: {
    romaji_sprint: [
      'Reading Shift: commit to one reading and type decisively.',
      'Kanji Soundline: connect character to reading in one step.',
    ],
    meaning_match: [
      'Meaning Split: separate close definitions and pick the core one.',
      'Concept Lock: choose the strongest semantic match.',
    ],
    character_match: [
      'Symbol Meaning Link: pick the kanji with the right concept.',
      'N5 Recall: choose the character that best fits the cue.',
    ],
    stroke_order: [
      'Writing Trace: start from the meaning and rebuild the character.',
      'Stroke Path: picture the order before you type the kanji.',
    ],
    typed_recall: [
      'Concept Recall: type the meaning directly without choices.',
      'Kanji Memory: commit one meaning and type it exactly.',
    ],
    speech_recall: [
      'Voice Recall: say the meaning aloud, clearly and confidently.',
      'Spoken Kanji: commit to one meaning and speak it out loud.',
    ],
    particle_cloze: [
      'Semantic Context: use nearby clues to fill the blank.',
      'N5 Sentence Drill: infer first, then commit to one meaning.',
    ],
    imposter: [
      'Story Scene: read the situation and resolve the missing idea.',
      'Scene Pulse: infer from the narrative shift before choosing.',
    ],
    listening_audio_first: [
      'Kanji Audio Drill: hear the reading and choose the meaning.',
      'Sound Recognition: identify the kanji from its spoken form.',
    ],
    dictation: [
      'Kanji Dictation: hear the reading and type the character.',
      'Sound-to-Kanji: recognise the spoken word and produce it.',
    ],
    kanji_compound_builder: [
      'Kanji Build: choose the compound built from these meanings.',
      'Piece Puzzle: each kanji brings its own meaning to the word.',
    ],
    context_cloze: [
      'Sentence Fill: read the context and pick the word that fits.',
      'Meaning Blank: use the surrounding words to choose the answer.',
    ],
  },
  vocab_n5: {
    romaji_sprint: [
      'Word Recall: read the vocab item and type the reading cleanly.',
      'Sound-to-Word: lock pronunciation before typing.',
    ],
    meaning_match: [
      'Word Sense: choose the exact English meaning.',
      'Precision Match: avoid near-synonyms and commit.',
    ],
    character_match: [
      'Word Form: choose the Japanese form for the meaning.',
      'Lexical Link: pick the correct written word.',
    ],
    stroke_order: [
      'Stroke Trace: picture the write order before you answer.',
      'Form First: rebuild the symbol one part at a time.',
    ],
    typed_recall: [
      'Meaning Recall: type the word meaning from memory.',
      'Precision Recall: type the best English gloss directly.',
    ],
    speech_recall: [
      'Voice Recall: speak the word meaning from memory.',
      'Spoken Precision: say the best English gloss aloud.',
    ],
    particle_cloze: [
      'Usage Context: use sentence context to place the right word.',
      'Meaning-in-Use: infer from surrounding clues first.',
    ],
    imposter: [
      'Scene Choice: complete the mini situation with the right word.',
      'Story Fit: pick the option that best matches the scene.',
    ],
    listening_audio_first: [
      'Vocab Audio Drill: hear the word and choose the meaning.',
      'Listening Recognition: identify the vocab from spoken form.',
    ],
    dictation: [
      'Vocab Dictation: hear the word and type it from memory.',
      'Listening Production: recognise the spoken vocabulary.',
    ],
    kanji_compound_builder: [
      'Build Mode: combine kanji meanings to form the compound word.',
      'Compound Link: find the word built from these kanji cues.',
    ],
    context_cloze: [
      'Word in Context: read the sentence and fill the missing word.',
      'Sentence Gap: choose the vocabulary that completes the meaning.',
    ],
  },
  grammar_patterns: {
    romaji_sprint: [
      'Pattern Read: confirm reading and type with confidence.',
      'Structure Sound: hear the phrase in your head, then type.',
    ],
    meaning_match: [
      'Grammar Sense: choose the best function or meaning.',
      'Pattern Intent: decide what nuance this structure carries.',
    ],
    character_match: [
      'Pattern Form: select the Japanese pattern for this intent.',
      'Structure Recall: pick the exact expression form.',
    ],
    stroke_order: [
      'Stroke Trace: picture the write order before you answer.',
      'Form First: rebuild the symbol one part at a time.',
    ],
    typed_recall: [
      'Pattern Recall: type the intended meaning in your own words.',
      'Grammar Recall: type what this expression conveys.',
    ],
    speech_recall: [
      'Voice Recall: say the intended meaning in your own words.',
      'Spoken Pattern: say aloud what this expression conveys.',
    ],
    particle_cloze: [
      'Sentence Pattern: complete the line with the right structure.',
      'Grammar in Context: infer role and choose the best fit.',
    ],
    imposter: [
      'Dialogue Scene: choose the pattern that fits the exchange.',
      'Conversational Fit: select the structure that sounds natural.',
    ],
    listening_audio_first: [
      'Pattern Audio: hear the expression and choose its meaning.',
      'Grammar Ear: recognise patterns by sound before selecting.',
    ],
    dictation: [
      'Grammar Dictation: hear the pattern and type it out.',
      'Sound-to-Pattern: recognise spoken grammar structures.',
    ],
    context_cloze: [
      'Pattern Fill: use sentence context to select the right grammar.',
      'Grammar Gap: read the sentence and pick the missing structure.',
    ],
  },
  sentence_examples: {
    romaji_sprint: [
      'Sentence Read: commit to the reading flow before typing.',
      'Phrase Rhythm: keep sentence cadence while you answer.',
    ],
    meaning_match: [
      'Sentence Meaning: choose the translation that fits best.',
      'Context Precision: pick the meaning that matches full context.',
    ],
    character_match: [
      'Sentence Form: choose the Japanese line that matches the meaning.',
      'Expression Recall: select the most natural sentence form.',
    ],
    stroke_order: [
      'Stroke Trace: picture the write order before you answer.',
      'Form First: rebuild the symbol one part at a time.',
    ],
    typed_recall: [
      'Sentence Recall: type the meaning from memory in your own words.',
      'Full-Line Recall: capture the sentence intent clearly.',
    ],
    speech_recall: [
      'Voice Recall: say the sentence meaning clearly and naturally.',
      'Spoken Intent: speak the core meaning in one go.',
    ],
    particle_cloze: [
      'Sentence Cloze: use surrounding context to fill the missing part.',
      'Flow Completion: choose what makes the line sound natural.',
    ],
    imposter: [
      'Scene Sentence: pick the line that fits the moment.',
      'Story Context: complete the exchange with natural phrasing.',
    ],
    listening_audio_first: [
      'Sentence Audio: hear the sentence and choose its meaning.',
      'Ear-First Context: decode the line by sound before selecting.',
    ],
    dictation: [
      'Sentence Dictation: hear the sentence and type it out.',
      'Listening Composition: transcribe spoken Japanese lines.',
    ],
    context_cloze: [
      'Sentence Fill: use context clues to pick the missing word.',
      'Flow Gap: find the word that completes the sentence naturally.',
    ],
  },
}

export const TAG_PROMPT_PACKS: Record<string, string[]> = {
  hiragana: [
    'Foundations First: this kana appears everywhere.',
    'Core Sound Check: nail the basic reading under pressure.',
  ],
  katakana: [
    'Borrowed Word Alert: think modern usage before answering.',
    'Foreign Sound Trace: map the pronunciation to script.',
  ],
  kanji: [
    'Component Clue: use radicals to guide your choice.',
    'Stroke Memory: visualize the character skeleton first.',
  ],
  n5: [
    'JLPT N5 Pulse: treat this like a fast exam checkpoint.',
    'N5 Accuracy Push: prioritize correctness over speed.',
  ],
}

export const CLOZE_TEMPLATES: Record<ScriptKey, Record<number, string[]>> = {
  hiragana: {
    1: [
      'The kana {character} is read as ___.',
      'When I see {character}, I write ___.',
    ],
    2: [
      'During reading practice, {character} maps to ___.',
      'I recognised {character} and filled in ___.',
    ],
    3: [
      'Under pressure, {character} still means ___.',
      'In a mixed drill, {character} came up and I chose ___.',
    ],
  },
  katakana: {
    1: [
      'The katakana {character} is read as ___.',
      'For {character}, the reading is ___.',
    ],
    2: [
      'In a loanword context, {character} maps to ___.',
      'I came across {character} in a sentence and filled in ___.',
    ],
    3: [
      'Even at speed, {character} still points to ___.',
      'In a complex sentence, {character} still means ___.',
    ],
  },
  kanji_n5: {
    1: [
      'The kanji {character} is best understood as ___.',
      'In simple text, {character} fits as ___.',
    ],
    2: [
      'Based on the context, {character} means ___.',
      'With one clue missing, {character} fills the gap as ___.',
    ],
    3: [
      'Even in a subtle context, {character} links to ___.',
      'In a compressed phrase, {character} is best read as ___.',
    ],
  },
  vocab_n5: {
    1: [
      'The word {character} means ___.',
      'For {character} ({romaji}), the best meaning is ___.',
    ],
    2: [
      'In this sentence, {character} contributes ___.',
      'From the context clues, {character} means ___.',
    ],
    3: [
      'Even in a subtle context, {character} means ___.',
      'Under pressure, {character} is still ___.',
    ],
  },
  grammar_patterns: {
    1: [
      'The pattern {character} is used for ___.',
      'For {character} ({romaji}), the best meaning is ___.',
    ],
    2: [
      'This exchange uses {character} to express ___.',
      'The grammar pattern {character} signals ___.',
    ],
    3: [
      'In nuanced dialogue, {character} still conveys ___.',
      'The most natural reading of {character} here is ___.',
    ],
  },
  sentence_examples: {
    1: [
      'The sentence {character} most naturally means ___.',
      'For {character} ({romaji}), the best meaning is ___.',
    ],
    2: [
      'From context, {character} expresses ___.',
      'In this exchange, {character} is best read as ___.',
    ],
    3: [
      'In nuanced context, {character} still conveys ___.',
      'Under pressure, the most natural meaning of {character} is ___.',
    ],
  },
}

export const STORY_CHAPTERS: Record<ScriptKey, Record<1 | 2 | 3, { title: string; lines: string[] }>> = {
  hiragana: {
    1: {
      title: 'Chapter 1: Station Arrival',
      lines: [
        'At the station gate, the sign glows and the missing clue is ___.',
        'A classmate waves from platform two, so the right word is ___.',
      ],
    },
    2: {
      title: 'Chapter 2: Market Errand',
      lines: [
        'At a busy market stand, the sentence only makes sense with ___.',
        'The vendor repeats one key term, and the best fit is ___.',
      ],
    },
    3: {
      title: 'Chapter 3: Festival Night',
      lines: [
        'Lanterns rise over the street, and the final missing meaning is ___.',
        'In the closing scene, one precise word completes the line: ___.',
      ],
    },
  },
  katakana: {
    1: {
      title: 'Chapter 1: City Signs',
      lines: [
        'Neon signs flash loanwords, and the missing concept is ___.',
        'A cafe menu uses katakana terms; the strongest fit is ___.',
      ],
    },
    2: {
      title: 'Chapter 2: Train Transfer',
      lines: [
        'Platform announcements blend borrowed words; fill the blank with ___.',
        'A route map label points to one clear meaning: ___.',
      ],
    },
    3: {
      title: 'Chapter 3: Live Concert',
      lines: [
        'Backstage chatter is fast, but the context still signals ___.',
        'The encore banner uses a key katakana term; choose ___.',
      ],
    },
  },
  kanji_n5: {
    1: {
      title: 'Chapter 1: Morning Routine',
      lines: [
        'A short diary line is missing one core idea: ___.',
        'The morning schedule sentence is complete only with ___.',
      ],
    },
    2: {
      title: 'Chapter 2: Office Tasks',
      lines: [
        'A memo on the desk has one missing concept: ___.',
        'The task list reads naturally when the blank is ___.',
      ],
    },
    3: {
      title: 'Chapter 3: Travel Plan',
      lines: [
        'A ticket note uses {character}, so the missing meaning is ___.',
        'In the final itinerary line, {character} means ___.',
      ],
    },
  },
  vocab_n5: {
    1: {
      title: 'Chapter 1: First Conversation',
      lines: [
        'At introductions, the word {character} completes this line as ___.',
        'In this beginner exchange, {character} fills the blank as ___.',
      ],
    },
    2: {
      title: 'Chapter 2: Daily Routine',
      lines: [
        'In a daily routine scene, {character} fits the blank as ___.',
        'The routine sentence sounds natural only if {character} means ___.',
      ],
    },
    3: {
      title: 'Chapter 3: Weekend Plans',
      lines: [
        'Planning with friends uses {character}; choose ___ to complete it.',
        'In this weekend scene, {character} means ___.',
      ],
    },
  },
  grammar_patterns: {
    1: {
      title: 'Chapter 1: Polite Basics',
      lines: [
        'A polite reply uses {character}, so the blank should be ___.',
        'This polite scene hinges on {character}; pick ___.',
      ],
    },
    2: {
      title: 'Chapter 2: Requests and Reasons',
      lines: [
        'A request sentence uses {character} to express ___ here.',
        'The reason-giving line sounds right when {character} means ___.',
      ],
    },
    3: {
      title: 'Chapter 3: Natural Conversation',
      lines: [
        'In natural dialogue, {character} conveys ___ in this scene.',
        'In the final exchange, {character} carries the meaning ___.',
      ],
    },
  },
  sentence_examples: {
    1: {
      title: 'Chapter 1: Daily Exchange',
      lines: [
        'A casual line is missing one idea; {character} means ___.',
        'In this daily scene, {character} is best read as ___.',
      ],
    },
    2: {
      title: 'Chapter 2: Practical Situation',
      lines: [
        'Context clues point to one meaning for {character}: ___.',
        'This practical sentence sounds natural only if {character} means ___.',
      ],
    },
    3: {
      title: 'Chapter 3: Nuanced Conversation',
      lines: [
        'In a nuanced exchange, {character} conveys ___.',
        'The strongest interpretation of {character} in this scene is ___.',
      ],
    },
  },
};
