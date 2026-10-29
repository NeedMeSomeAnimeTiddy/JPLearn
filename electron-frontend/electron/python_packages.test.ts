// @vitest-environment node
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const packages = require('./python_packages.cjs')

// Audit 13, F1/F2: optional packages live in JPLearn Assets, in the installed app only.

let tmp: string
let assets: string
let savedResourcesPath: string | undefined
let savedPython: string | undefined

function fakeBundle(dllNames = ['python3.dll', 'python311.dll']) {
  const pythonDir = path.join(tmp, 'resources', 'python-bundle', 'python')
  fs.mkdirSync(pythonDir, { recursive: true })
  fs.writeFileSync(path.join(pythonDir, 'python.exe'), '')
  for (const name of dllNames) fs.writeFileSync(path.join(pythonDir, name), '')
  ;(process as unknown as { resourcesPath?: string }).resourcesPath = path.join(tmp, 'resources')
  return path.join(pythonDir, 'python.exe')
}

function readyDir(feature: string, hash = packages.pinsHash(feature)) {
  const dir = path.join(assets, 'python-packages', 'cp311', `${feature}-${hash}`)
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(path.join(dir, packages.READY_MARKER), '{}')
  return dir
}

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'jpl-a13-'))
  assets = path.join(tmp, 'assets')
  fs.mkdirSync(assets)
  savedResourcesPath = (process as unknown as { resourcesPath?: string }).resourcesPath
  savedPython = process.env.JPLEARN_PYTHON
  delete process.env.JPLEARN_PYTHON
})

afterEach(() => {
  ;(process as unknown as { resourcesPath?: string }).resourcesPath = savedResourcesPath
  if (savedPython === undefined) delete process.env.JPLEARN_PYTHON
  else process.env.JPLEARN_PYTHON = savedPython
  fs.rmSync(tmp, { recursive: true, force: true })
})

describe('running from source', () => {
  it('leaves readiness and the environment exactly as before', () => {
    ;(process as unknown as { resourcesPath?: string }).resourcesPath = undefined
    expect(packages.featurePackagesReady(assets, 'ocr')).toBe(true)
    const env = { PATH: 'x' }
    expect(packages.envWithFeaturePackages(env, assets, ['ocr'])).toBe(env)
  })

  it('treats JPLEARN_PYTHON as source even beside a bundle', () => {
    fakeBundle()
    process.env.JPLEARN_PYTHON = 'C:/py/python.exe'
    expect(packages.featurePackagesReady(assets, 'speech')).toBe(true)
  })
})

describe('the installed app', () => {
  it('reads the interpreter tag from pythonXY.dll, not python3.dll', () => {
    const python = fakeBundle(['python3.dll', 'python311.dll'])
    expect(packages.pythonTag(python)).toBe('cp311')
  })

  it('counts a feature only once a ready folder exists', () => {
    fakeBundle()
    expect(packages.featurePackagesReady(assets, 'speech')).toBe(false)
    readyDir('speech')
    expect(packages.featurePackagesReady(assets, 'speech')).toBe(true)
    expect(packages.featurePackagesReady(assets, 'ocr')).toBe(false)
  })

  it('keeps using a ready folder from older pins until it is reinstalled', () => {
    fakeBundle()
    const older = readyDir('speech', '0123456789')
    expect(packages.readyFeatureDir(assets, 'speech')).toBe(older)
  })

  it('names the ready folders, and today\'s folder, without the user site', () => {
    fakeBundle()
    const ocr = readyDir('ocr')
    const env = packages.envWithFeaturePackages({ PATH: 'x' }, assets, ['ocr'])
    expect(env.PYTHONNOUSERSITE).toBe('1')
    expect(env.JPLEARN_PYTHON_PACKAGES.split(path.delimiter)).toEqual([ocr])

    const embedderEnv = packages.envWithFeaturePackages({}, assets, ['embedder'])
    expect(embedderEnv.JPLEARN_PYTHON_PACKAGES).toBe(
      path.join(assets, 'python-packages', 'cp311', `embedder-${packages.pinsHash('embedder')}`),
    )
  })
})

describe('installFeaturePackages', () => {
  it('installs into a partial folder, probes it, then moves it into place with a marker', async () => {
    const python = fakeBundle()
    const calls: string[][] = []
    const run = vi.fn(async (_cmd: string, args: string[], env: Record<string, string>) => {
      calls.push(args)
      expect(env.PYTHONNOUSERSITE).toBe('1')
      if (args.includes('--target')) {
        const target = args[args.indexOf('--target') + 1]
        expect(target).toMatch(/\.partial-/)
        fs.mkdirSync(target, { recursive: true })
      }
      return { code: 0, stdout: '', stderr: '' }
    })

    const result = await packages.installFeaturePackages({ assetsDir: assets, feature: 'speech', run, pythonCmd: python })

    expect(result.installed).toBe(true)
    expect(fs.existsSync(path.join(result.dir, packages.READY_MARKER))).toBe(true)
    expect(calls[0]).toEqual(expect.arrayContaining(['--only-binary=:all:', 'faster-whisper==1.2.1']))
    expect(calls[1][1]).toContain('import faster_whisper')
    expect(packages.featurePackagesReady(assets, 'speech')).toBe(true)

    const again = await packages.installFeaturePackages({ assetsDir: assets, feature: 'speech', run, pythonCmd: python })
    expect(again.installed).toBe(false)
    expect(run).toHaveBeenCalledTimes(2)
  })

  it('leaves nothing ready when the import probe fails', async () => {
    const python = fakeBundle()
    const run = vi.fn(async (_cmd: string, args: string[]) => {
      if (args.includes('--target')) {
        fs.mkdirSync(args[args.indexOf('--target') + 1], { recursive: true })
        return { code: 0, stdout: '', stderr: '' }
      }
      return { code: 1, stdout: '', stderr: 'ImportError: DLL load failed' }
    })

    await expect(packages.installFeaturePackages({ assetsDir: assets, feature: 'ocr', run, pythonCmd: python }))
      .rejects.toThrow(/Could not install the ocr packages: ImportError: DLL load failed/)
    expect(packages.featurePackagesReady(assets, 'ocr')).toBe(false)
    expect(fs.readdirSync(path.join(assets, 'python-packages', 'cp311'))).toEqual([])
  })

  it('runs one install of a feature at a time', async () => {
    const python = fakeBundle()
    let release: () => void = () => {}
    const gate = new Promise<void>((resolve) => { release = resolve })
    const run = vi.fn(async (_cmd: string, args: string[]) => {
      if (args.includes('--target')) {
        await gate
        fs.mkdirSync(args[args.indexOf('--target') + 1], { recursive: true })
      }
      return { code: 0, stdout: '', stderr: '' }
    })

    const first = packages.installFeaturePackages({ assetsDir: assets, feature: 'speech', run, pythonCmd: python })
    const second = packages.installFeaturePackages({ assetsDir: assets, feature: 'speech', run, pythonCmd: python })
    release()
    const [a, b] = await Promise.all([first, second])
    expect(a).toBe(b)
    expect(run).toHaveBeenCalledTimes(2)
    expect(packages.featurePackagesReady(assets, 'speech')).toBe(true)
  })

  it('lists every folder of a feature for uninstalling', () => {
    fakeBundle()
    const now = readyDir('speech')
    const old = readyDir('speech', 'abcdefabcd')
    readyDir('speech-cuda')
    expect(packages.featurePackageDirs(assets, 'speech').sort()).toEqual([now, old].sort())
  })
})

describe('setup\'s "installed"', () => {
  const setup = require('./setup_runtime.cjs')

  function ocrFiles() {
    fs.mkdirSync(path.join(assets, 'ocr', 'standard'), { recursive: true })
    fs.writeFileSync(path.join(assets, 'ocr', 'standard', 'model.ready'), '')
    for (const name of ['PP-OCRv6_medium_det', 'PP-OCRv6_medium_rec']) {
      fs.mkdirSync(path.join(assets, 'ocr', 'paddlex', 'official_models', name), { recursive: true })
    }
  }

  it('from source, model files are enough, as before', () => {
    ;(process as unknown as { resourcesPath?: string }).resourcesPath = undefined
    ocrFiles()
    expect(setup.isOcrModelInstalled(assets, 'standard')).toBe(true)
  })

  it('in the installed app, OCR also needs its packages in JPLearn Assets', () => {
    fakeBundle()
    ocrFiles()
    expect(setup.isOcrModelInstalled(assets, 'standard')).toBe(false)
    readyDir('ocr')
    expect(setup.isOcrModelInstalled(assets, 'standard')).toBe(true)
  })
})
