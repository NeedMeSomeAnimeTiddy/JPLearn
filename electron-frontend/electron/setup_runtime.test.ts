// @vitest-environment node
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

const { isOfflineDictionaryInstalled } = require('./setup_runtime.cjs')

const temporaryDirectories: string[] = []

function createOfflineDictionaryInstall(marker: unknown): string {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'jplearn-dictionary-'))
  temporaryDirectories.push(base)
  const dictionaryDirectory = path.join(
    base,
    'data',
    'external_sources',
    'offline_dictionary',
  )
  fs.mkdirSync(dictionaryDirectory, { recursive: true })
  fs.writeFileSync(path.join(dictionaryDirectory, 'jmdict_lookup.sqlite'), 'sqlite-fixture')
  fs.writeFileSync(
    path.join(dictionaryDirectory, '.pitch-accent-ready'),
    typeof marker === 'string' ? marker : JSON.stringify(marker),
    'utf8',
  )
  return base
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true })
  }
})

describe('offline dictionary installation readiness', () => {
  it('accepts only a complete schema-v4 marker beside the SQLite index', () => {
    const v4Base = createOfflineDictionaryInstall({ schema_version: 4 })
    const v3Base = createOfflineDictionaryInstall({ schema_version: 3 })
    const stringVersionBase = createOfflineDictionaryInstall({ schema_version: '4' })
    const malformedBase = createOfflineDictionaryInstall('{not-json')

    expect(isOfflineDictionaryInstalled(v4Base)).toBe(true)
    expect(isOfflineDictionaryInstalled(v3Base)).toBe(false)
    expect(isOfflineDictionaryInstalled(stringVersionBase)).toBe(false)
    expect(isOfflineDictionaryInstalled(malformedBase)).toBe(false)
  })

  it('rejects an otherwise valid marker when the SQLite index is absent', () => {
    const base = createOfflineDictionaryInstall({ schema_version: 4 })
    fs.unlinkSync(path.join(
      base,
      'data',
      'external_sources',
      'offline_dictionary',
      'jmdict_lookup.sqlite',
    ))

    expect(isOfflineDictionaryInstalled(base)).toBe(false)
  })
})
