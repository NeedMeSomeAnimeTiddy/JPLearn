import { describe, expect, it } from 'vitest'
import {
  buildPitchLevels,
  describePitchAccent,
  getPitchAccentLabel,
  splitJapaneseMora,
} from './pitchAccent'

describe('pitchAccent', () => {
  it('groups small kana while keeping sokuon as its own mora', () => {
    expect(splitJapaneseMora('きょう')).toEqual(['きょ', 'う'])
    expect(splitJapaneseMora('がっこう')).toEqual(['が', 'っ', 'こ', 'う'])
  })

  it('builds standard Tokyo pitch contours', () => {
    expect(buildPitchLevels(3, 0)).toEqual(['low', 'high', 'high'])
    expect(buildPitchLevels(3, 1)).toEqual(['high', 'low', 'low'])
    expect(buildPitchLevels(4, 2)).toEqual(['low', 'high', 'low', 'low'])
    expect(buildPitchLevels(4, 4)).toEqual(['low', 'high', 'high', 'high'])
    expect(buildPitchLevels(1, 0)).toEqual(['high'])
  })

  it('labels the four downstep classes', () => {
    expect(getPitchAccentLabel(0, 3)).toBe('Heiban [0]')
    expect(getPitchAccentLabel(1, 3)).toBe('Atamadaka [1]')
    expect(getPitchAccentLabel(2, 3)).toBe('Nakadaka [2]')
    expect(getPitchAccentLabel(3, 3)).toBe('Odaka [3]')
  })

  it('describes the contour without relying on the visual graph', () => {
    expect(describePitchAccent('はし', 1, 2)).toBe(
      'はし: Atamadaka [1], downstep after mora 1; high, low',
    )
  })
})
