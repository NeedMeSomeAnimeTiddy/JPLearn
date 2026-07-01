import type { RoundDictionaryNote } from '../../types'

interface DictionaryNoteCardProps {
  note: RoundDictionaryNote
}

export function DictionaryNoteCard({ note }: DictionaryNoteCardProps) {
  const glosses = [note.primaryGloss, ...note.secondaryGlosses]

  return (
    <div className="game-dictionary-note" aria-live="polite">
      <p className="game-dictionary-note-title">{note.title}</p>
      <p className="game-dictionary-note-copy">{note.copy}</p>
      <div className="game-dictionary-sense">
        <div className="game-dictionary-sense-head">
          <span className="game-dictionary-sense-label">Dictionary sense</span>
          <span className="game-dictionary-source">{note.source.replaceAll('_', ' ')}</span>
        </div>
        <div className="game-dictionary-sense-meta">
          <span className="game-dictionary-meta-chip" lang="ja">{note.character}</span>
          <span className="game-dictionary-meta-chip">{note.reading}</span>
        </div>
        <div className="game-dictionary-gloss-row" aria-label="Dictionary glosses">
          {glosses.map((gloss, index) => (
            <span
              key={`${note.character}-${gloss}-${index}`}
              className={`game-dictionary-gloss-chip ${index === 0 ? 'is-primary' : ''}`}
            >
              {gloss}
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}