import type { PitchAccent } from '../generated/types'
import {
  buildPitchLevels,
  describePitchAccent,
  getPitchAccentLabel,
  splitJapaneseMora,
} from '../lib/pitchAccent'

interface DictionaryPitchAccentProps {
  accents: PitchAccent[]
}

export function DictionaryPitchAccent({ accents }: DictionaryPitchAccentProps) {
  const variants = accents.flatMap((accent) => {
    const morae = splitJapaneseMora(accent.reading)
    if (morae.length !== accent.mora_count) return []
    return accent.pitch_positions
      .filter((position) => position >= 0 && position <= accent.mora_count)
      .map((position) => ({ accent, morae, position }))
  })

  if (variants.length === 0) return null

  return (
    <div className="dictionary-pitch-accent" role="group" aria-label="Tokyo Japanese pitch accent">
      <span className="dictionary-pitch-accent-title">Pitch</span>
      <div className="dictionary-pitch-accent-variants">
        {variants.map(({ accent, morae, position }) => {
          const levels = buildPitchLevels(morae.length, position)
          const description = describePitchAccent(accent.reading, position, accent.mora_count)

          return (
            <div
              key={`${accent.reading}-${position}`}
              className="dictionary-pitch-accent-variant"
              role="img"
              aria-label={description}
              title={`${description} · ${accent.source}`}
            >
              <span className="dictionary-pitch-accent-type">
                {getPitchAccentLabel(position, accent.mora_count)}
              </span>
              <span className="dictionary-pitch-contour" aria-hidden="true" lang="ja">
                {morae.map((mora, index) => (
                  <span key={`${mora}-${index}`} className="dictionary-pitch-mora">
                    <span
                      className="dictionary-pitch-node"
                      data-level={levels[index]}
                      data-next-level={levels[index + 1] ?? levels[index]}
                      data-last={index === morae.length - 1 ? '' : undefined}
                      data-drop={position === index + 1 ? '' : undefined}
                    />
                    <span className="dictionary-pitch-mora-text">{mora}</span>
                  </span>
                ))}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
