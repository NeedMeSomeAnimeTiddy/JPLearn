// @vitest-environment node
import { EventEmitter } from 'node:events'
import fs from 'node:fs'
import http from 'node:http'
import https from 'node:https'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'

const {
  createDeferredValue,
  createSetupRuntime,
  isOcrModelInstalled,
  isOfflineDictionaryInstalled,
  isSpeechModelInstalled,
  isTranslationModelInstalled,
  removeTutorDownloadLeftovers,
} = require('./setup_runtime.cjs')

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

function makeTempDir(prefix: string): string {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), prefix))
  temporaryDirectories.push(directory)
  return directory
}

function touch(filePath: string, content = 'x'): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  fs.writeFileSync(filePath, content)
}

afterEach(() => {
  vi.restoreAllMocks()
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
  // Audit 6 F1: a non-waiting read used to start the probes in the background, so every launch
  // contacted proof.ovh.net and huggingface.co without the learner asking.
  it('never starts the computation for a non-waiting caller', async () => {
    let release: (value: number) => void = () => {}
    const compute = vi.fn(() => new Promise<number>((resolve) => { release = resolve }))
    const deferred = createDeferredValue(compute)

    await expect(deferred.get(false)).resolves.toBeNull()
    expect(compute).not.toHaveBeenCalled()

    const waiting = deferred.get(true)
    await vi.waitFor(() => expect(compute).toHaveBeenCalledTimes(1))
    // A non-waiting read while one is in flight neither waits nor starts another.
    await expect(deferred.get(false)).resolves.toBeNull()
    release(42)
    await expect(waiting).resolves.toBe(42)
    await expect(deferred.get(false)).resolves.toBe(42)
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

describe('install-state reads stay on the machine (audit 6 F1)', () => {
  it('contacts no host when the caller does not wait for estimates', async () => {
    const assets = makeTempDir('jplearn-assets-')
    vi.stubEnv('JPLEARN_ASSETS_DIR', assets)
    // The VOICEVOX check is a loopback probe and is allowed; anything else is recorded. Every
    // request fails, as it would offline.
    const contacted: string[] = []
    const refuse = (target: unknown) => {
      const host = typeof target === 'string' || target instanceof URL
        ? new URL(String(target)).hostname
        : String((target as { hostname?: string, host?: string }).hostname ?? (target as { host?: string }).host)
      if (!['127.0.0.1', 'localhost', '::1'].includes(host)) contacted.push(host)
      const request = new EventEmitter() as EventEmitter & Record<string, unknown>
      request.destroy = () => request
      request.end = () => request
      request.setTimeout = () => request
      setImmediate(() => request.emit('error', new Error('offline in this test')))
      return request
    }
    vi.spyOn(https, 'get').mockImplementation(refuse as never)
    vi.spyOn(https, 'request').mockImplementation(refuse as never)
    vi.spyOn(http, 'get').mockImplementation(refuse as never)
    vi.spyOn(http, 'request').mockImplementation(refuse as never)

    const info = await createSetupRuntime().getSystemInfo({})
    await new Promise((resolve) => setTimeout(resolve, 50))

    expect(contacted).toEqual([])
    expect(info.networkMbps).toBeNull()
    vi.unstubAllEnvs()
  })
})

describe('what installed means (audit 6 F4, F3, F7)', () => {
  const speechFiles = ['model.bin', 'config.json', 'tokenizer.json', 'vocabulary.txt']

  it('counts a speech tier installed only when every file is present', () => {
    const base = makeTempDir('jplearn-speech-')
    const dir = path.join(base, 'whisper', 'fast')
    touch(path.join(dir, 'model.bin'))
    expect(isSpeechModelInstalled(base, 'fast')).toBe(false)

    for (const filename of speechFiles) touch(path.join(dir, filename))
    expect(isSpeechModelInstalled(base, 'fast')).toBe(true)
    expect(isSpeechModelInstalled(base, 'no-such-tier')).toBe(false)
  })

  it('needs the translation model file as well as its marker', () => {
    const base = makeTempDir('jplearn-translation-')
    touch(path.join(base, 'translation', 'qwen_ja_en', 'model.ready'))
    expect(isTranslationModelInstalled(base, 'qwen_ja_en')).toBe(false)

    touch(path.join(base, 'models', 'llama', 'Qwen3.5-0.8B-JP-Q4_K_M.gguf'))
    expect(isTranslationModelInstalled(base, 'qwen_ja_en')).toBe(true)
  })

  it('needs the OCR weights, in the assets folder or the old PaddleX cache', () => {
    const base = makeTempDir('jplearn-ocr-')
    const home = makeTempDir('jplearn-home-')
    vi.spyOn(os, 'homedir').mockReturnValue(home)
    touch(path.join(base, 'ocr', 'standard', 'model.ready'))
    expect(isOcrModelInstalled(base, 'standard')).toBe(false)

    const legacy = path.join(home, '.paddlex', 'official_models')
    fs.mkdirSync(path.join(legacy, 'PP-OCRv6_medium_det_onnx'), { recursive: true })
    fs.mkdirSync(path.join(legacy, 'PP-OCRv6_medium_rec_onnx'), { recursive: true })
    expect(isOcrModelInstalled(base, 'standard')).toBe(true)

    fs.rmSync(path.join(home, '.paddlex'), { recursive: true })
    const weights = path.join(base, 'ocr', 'paddlex', 'official_models')
    fs.mkdirSync(path.join(weights, 'PP-OCRv6_medium_det'), { recursive: true })
    expect(isOcrModelInstalled(base, 'standard')).toBe(false)
    fs.mkdirSync(path.join(weights, 'PP-OCRv6_medium_rec'), { recursive: true })
    expect(isOcrModelInstalled(base, 'standard')).toBe(true)
  })
})

describe('tutor model uninstall clears what a download left (audit 6 F2)', () => {
  it('removes partial files and the Hugging Face CLI bookkeeping for that model only', () => {
    const modelsDir = makeTempDir('jplearn-models-')
    const filename = 'tutor.gguf'
    const leftovers = [`${filename}.tmp`, `${filename}.part0`, `${filename}.part7`]
    for (const leftover of leftovers) touch(path.join(modelsDir, leftover))
    const hfDir = path.join(modelsDir, '.cache', 'huggingface', 'download')
    touch(path.join(hfDir, `${filename}.metadata`))
    touch(path.join(hfDir, `${filename}.lock`))
    touch(path.join(modelsDir, 'other.gguf'))
    touch(path.join(modelsDir, 'other.gguf.part0'))
    touch(path.join(hfDir, 'other.gguf.metadata'))

    removeTutorDownloadLeftovers(modelsDir, filename)

    for (const leftover of leftovers) expect(fs.existsSync(path.join(modelsDir, leftover))).toBe(false)
    expect(fs.existsSync(path.join(hfDir, `${filename}.metadata`))).toBe(false)
    expect(fs.existsSync(path.join(hfDir, `${filename}.lock`))).toBe(false)
    expect(fs.existsSync(path.join(modelsDir, 'other.gguf'))).toBe(true)
    expect(fs.existsSync(path.join(modelsDir, 'other.gguf.part0'))).toBe(true)
    expect(fs.existsSync(path.join(hfDir, 'other.gguf.metadata'))).toBe(true)
  })
})
