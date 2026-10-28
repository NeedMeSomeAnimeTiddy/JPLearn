// @vitest-environment node
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

const { removeRuntimeOnlyData } = require('./remove-runtime-data.cjs') as {
  removeRuntimeOnlyData: (resourcesDir: string) => string[]
}

const made: string[] = []

function resourcesWith(files: string[]): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'jpl-forge-hook-'))
  made.push(root)
  for (const file of files) {
    const target = path.join(root, 'data', file)
    fs.mkdirSync(path.dirname(target), { recursive: true })
    fs.writeFileSync(target, 'x')
  }
  return root
}

afterEach(() => {
  for (const root of made.splice(0)) fs.rmSync(root, { recursive: true, force: true })
})

describe('removeRuntimeOnlyData (audit 10, F1)', () => {
  it('takes every learner database and the safety copies out of the package', () => {
    const root = resourcesWith([
      'jplearn.db',
      'jplearn.db.backup-pre-issue66-20260725-060219',
      'app.db',
      'jplearn.db-journal',
      'backups/jplearn-before-upgrade-20261028T120000000000Z.db',
      'database.py',
      'external_sources/kanji_n5.csv',
      'whisper/fast/model.bin',
    ])
    removeRuntimeOnlyData(root)
    const left = fs.readdirSync(path.join(root, 'data')).sort()
    expect(left).toEqual(['database.py', 'external_sources'])
    expect(fs.existsSync(path.join(root, 'data', 'external_sources', 'kanji_n5.csv'))).toBe(true)
  })

  it('does nothing when there is no data folder', () => {
    const root = resourcesWith([])
    expect(removeRuntimeOnlyData(root)).toEqual([])
  })
})
