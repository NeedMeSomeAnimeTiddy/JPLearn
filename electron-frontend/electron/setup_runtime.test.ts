// @vitest-environment node
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'

const { isOfflineDictionaryInstalled, createDeferredValue } = require('./setup_runtime.cjs')

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

describe('deferred network probes', () => {
  // Regression: getSystemInfo used to await a 10 MB throughput probe and an
  // unbounded huggingface.co size probe before returning anything, including
  // the install flags the renderer gates features on. A drop into Image
  // Translation during that window was told OCR "is not installed".
  it('does not make a non-waiting caller wait for the computation', async () => {
    let release: (value: number) => void = () => {}
    const compute = vi.fn(() => new Promise<number>((resolve) => { release = resolve }))
    const deferred = createDeferredValue(compute)

    // Cold cache: returns immediately even though nothing has resolved.
    await expect(deferred.get(false)).resolves.toBeNull()
    expect(compute).toHaveBeenCalledTimes(1)

    release(42)
    await vi.waitFor(async () => expect(await deferred.get(false)).toBe(42))
    expect(compute).toHaveBeenCalledTimes(1)
  })

  it('waits and returns the value when the caller opts in', async () => {
    const deferred = createDeferredValue(async () => 7)

    await expect(deferred.get(true)).resolves.toBe(7)
    await expect(deferred.get(false)).resolves.toBe(7)
  })

  it('shares one computation across concurrent callers', async () => {
    let release: (value: number) => void = () => {}
    const compute = vi.fn(() => new Promise<number>((resolve) => { release = resolve }))
    const deferred = createDeferredValue(compute)

    const waiting = deferred.get(true)
    await deferred.get(false)
    const alsoWaiting = deferred.get(true)

    release(3)
    await expect(waiting).resolves.toBe(3)
    await expect(alsoWaiting).resolves.toBe(3)
    expect(compute).toHaveBeenCalledTimes(1)
  })

  it('retries rather than caching a failure, and never rejects', async () => {
    const compute = vi.fn()
      .mockRejectedValueOnce(new Error('getaddrinfo ENOTFOUND proof.ovh.net'))
      .mockResolvedValueOnce(99)
    const deferred = createDeferredValue(compute)

    await expect(deferred.get(true)).resolves.toBeNull()
    await expect(deferred.get(true)).resolves.toBe(99)
    expect(compute).toHaveBeenCalledTimes(2)
  })

  it('recomputes after a reset', async () => {
    const compute = vi.fn().mockResolvedValue(5)
    const deferred = createDeferredValue(compute)

    await deferred.get(true)
    deferred.reset()
    await deferred.get(true)

    expect(compute).toHaveBeenCalledTimes(2)
  })
})
