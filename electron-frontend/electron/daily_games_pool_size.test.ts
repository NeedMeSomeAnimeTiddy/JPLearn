// @vitest-environment node
/**
 * The IPC layer restates the Daily Games pool size (audit 16, N3): the highest pool position it
 * accepts must be one less than the pool limit the domain builds pools with, or raising the limit
 * would make every attempt and clue for the new positions fail validation without a word.
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const { MAX_DAILY_GAMES_POOL_POSITION, validateDailyGamesAttemptPayload } = require('./ipc_security.cjs')

function domainPoolLimit(): number {
  const source = readFileSync(resolve(__dirname, '../../domain/daily_games.py'), 'utf8')
  const match = /^DEFAULT_DAILY_POOL_LIMIT\s*(?::\s*int\s*)?=\s*(\d+)\s*$/m.exec(source)
  if (!match) throw new Error('DEFAULT_DAILY_POOL_LIMIT not found in domain/daily_games.py')
  return Number(match[1])
}

describe('the Daily Games pool size', () => {
  it('is the same on both sides of the bridge', () => {
    expect(MAX_DAILY_GAMES_POOL_POSITION + 1).toBe(domainPoolLimit())
  })

  it('lets an attempt name the last position of a full pool, and no further', () => {
    const attempt = (poolPosition: number) => ({
      day: '2026-07-15', gameType: 'typing_blitz', mode: 'daily', score: 1, completed: true, durationSeconds: 1,
      outcomes: [{ poolPosition, outcome: 'correct' }],
    })
    expect(() => validateDailyGamesAttemptPayload(attempt(domainPoolLimit() - 1))).not.toThrow()
    expect(() => validateDailyGamesAttemptPayload(attempt(domainPoolLimit()))).toThrow()
  })
})
