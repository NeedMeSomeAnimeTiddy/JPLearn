export type PitchLevel = 'high' | 'low'

export type PitchAccentType = 'heiban' | 'atamadaka' | 'nakadaka' | 'odaka'

const JOINING_SMALL_KANA = new Set([
  'ぁ', 'ぃ', 'ぅ', 'ぇ', 'ぉ', 'ゃ', 'ゅ', 'ょ', 'ゎ',
  'ァ', 'ィ', 'ゥ', 'ェ', 'ォ', 'ャ', 'ュ', 'ョ', 'ヮ',
])

export function splitJapaneseMora(reading: string): string[] {
  const morae: string[] = []
  for (const character of reading.normalize('NFKC')) {
    if (JOINING_SMALL_KANA.has(character) && morae.length > 0) {
      morae[morae.length - 1] += character
      continue
    }
    morae.push(character)
  }
  return morae
}

export function getPitchAccentType(position: number, moraCount: number): PitchAccentType {
  if (position === 0) return 'heiban'
  if (position === 1) return 'atamadaka'
  if (position === moraCount) return 'odaka'
  return 'nakadaka'
}

export function getPitchAccentLabel(position: number, moraCount: number): string {
  const type = getPitchAccentType(position, moraCount)
  const labels: Record<PitchAccentType, string> = {
    heiban: 'Heiban',
    atamadaka: 'Atamadaka',
    nakadaka: 'Nakadaka',
    odaka: 'Odaka',
  }
  return `${labels[type]} [${position}]`
}

export function buildPitchLevels(moraCount: number, position: number): PitchLevel[] {
  return Array.from({ length: moraCount }, (_, index) => {
    if (moraCount === 1) return 'high'
    if (position === 0) return index === 0 ? 'low' : 'high'
    if (position === 1) return index === 0 ? 'high' : 'low'
    if (index === 0) return 'low'
    return index < position ? 'high' : 'low'
  })
}

export function describePitchAccent(reading: string, position: number, moraCount: number): string {
  const levels = buildPitchLevels(moraCount, position)
    .map((level) => level === 'high' ? 'high' : 'low')
    .join(', ')
  const drop = position === 0 ? 'no downstep' : `downstep after mora ${position}`
  return `${reading}: ${getPitchAccentLabel(position, moraCount)}, ${drop}; ${levels}`
}
