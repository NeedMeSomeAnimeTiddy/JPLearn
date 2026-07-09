import type { Command } from './types'

interface ScoredCommand {
  command: Command
  score: number
}

function scoreMatch(query: string, text: string): number {
  const lowerQuery = query.toLowerCase()
  const lowerText = text.toLowerCase()

  if (lowerText === lowerQuery) return 100
  if (lowerText.startsWith(lowerQuery)) return 80

  const wordBoundaryMatch = lowerText
    .split(/[\s_-]+/)
    .some((word) => word.startsWith(lowerQuery))
  if (wordBoundaryMatch) return 60

  if (lowerText.includes(lowerQuery)) return 40

  let qi = 0
  for (let ti = 0; ti < lowerText.length && qi < lowerQuery.length; ti++) {
    if (lowerText[ti] === lowerQuery[qi]) qi++
  }
  if (qi === lowerQuery.length) return 20

  return 0
}

export function filterCommands(commands: Command[], query: string): Command[] {
  if (!query.trim()) return commands

  const scored: ScoredCommand[] = []
  for (const command of commands) {
    let best = scoreMatch(query, command.label)
    if (command.keywords) {
      for (const kw of command.keywords) {
        best = Math.max(best, scoreMatch(query, kw))
      }
    }
    if (best > 0) scored.push({ command, score: best })
  }

  scored.sort((a, b) => b.score - a.score)
  return scored.map((s) => s.command)
}

export function getCategoryLabel(category: Command['category']): string {
  switch (category) {
    case 'navigation':
      return 'Navigation'
    case 'study':
      return 'Study'
    case 'settings':
      return 'Settings'
    case 'debug':
      return 'Dev Tools'
  }
}
