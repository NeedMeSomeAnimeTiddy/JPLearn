// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { createTutorChatRuntime, createAdapterRegistry, extractCliResponseText } = require('./llm_runtime.cjs')

describe('llm runtime', () => {
  it('uses stub provider by default', async () => {
    const runtime = createTutorChatRuntime({
      provider: 'stub',
    })

    const response = await runtime.sendMessage('Help me review weak cards', { focus_area: 'kanji_n5' })
    expect(response.ok).toBe(true)
    expect(response.provider).toBe('stub')
    expect(typeof response.text).toBe('string')
    expect(response.text.length).toBeGreaterThan(0)
  })

  it('falls back to stub when llama.cpp is not configured', async () => {
    const runtime = createTutorChatRuntime({
      provider: 'llama.cpp',
      llamaServerPath: 'C:/missing/llama-server.exe',
      llamaModelPath: 'C:/missing/model.gguf',
    })

    const response = await runtime.sendMessage('What should I practice next?', { focus_area: 'vocab_n5' })
    expect(response.ok).toBe(true)
    expect(response.provider).toBe('stub')

    const status = runtime.getStatus()
    expect(status.loaded).toBe(true)
    expect(status.activeProvider).toBe('stub-fallback')
    expect(typeof status.lastError).toBe('string')
  })

  it('supports swappable provider adapters via registry', async () => {
    const registry = createAdapterRegistry()
    registry.register('custom-provider', () => ({
      async load() {
        return undefined
      },
      async unload() {
        return undefined
      },
      async infer(message) {
        return {
          text: `custom:${message}`,
          provider: 'custom-provider',
          model: 'custom-model',
        }
      },
    }))

    const runtime = createTutorChatRuntime({
      provider: 'custom-provider',
      adapterRegistry: registry,
    })

    const response = await runtime.sendMessage('hello coach')
    expect(response.provider).toBe('custom-provider')
    expect(response.model).toBe('custom-model')
    expect(response.text).toContain('すみません')
  })

  it('enforces single active inference', async () => {
    const gate = {
      release: null,
    }
    const runtime = createTutorChatRuntime({
      provider: 'stub',
      adapterFactory: () => ({
        async load() {
          return undefined
        },
        async unload() {
          return undefined
        },
        async infer() {
          await new Promise((resolve) => {
            gate.release = resolve
          })
          return {
            text: 'first done',
            provider: 'stub',
            model: 'stub-model',
          }
        },
      }),
    })

    const first = runtime.sendMessage('first')
    while (!gate.release) {
      await new Promise((resolve) => setTimeout(resolve, 0))
    }
    await expect(runtime.sendMessage('second')).rejects.toThrow(/already active/i)
    gate.release()
    await expect(first).resolves.toMatchObject({ ok: true })
  })

  it('returns fallback-ready output for crossword clues without disturbing active tutor inference', async () => {
    let releaseTutor
    let tutorInferenceCount = 0
    const infer = vi.fn(async (message) => {
      if (message === 'tutor message') {
        tutorInferenceCount += 1
        if (tutorInferenceCount === 1) {
          await new Promise((resolve) => { releaseTutor = resolve })
        }
        return { text: '次は苦手な単語を三つ復習してから、新しい問題に進みましょう。', provider: 'llama.cpp', model: 'test-model' }
      }
      return { text: '[]', provider: 'llama.cpp', model: 'test-model' }
    })
    const runtime = createTutorChatRuntime({
      provider: 'llama.cpp',
      adapterFactory: () => ({ load: async () => undefined, unload: async () => undefined, infer }),
    })
    const tutor = runtime.sendMessage('tutor message')
    while (!releaseTutor) await new Promise((resolve) => setTimeout(resolve, 0))

    await expect(runtime.generateCrosswordClues([{ poolPosition: 0, answer: '学校', fallbackClue: 'school' }]))
      .resolves.toEqual({ ok: false, text: '' })
    expect(infer).toHaveBeenCalledTimes(1)
    releaseTutor()
    await tutor
  })

  it('reserves cold loading for tutor inference before a competing crossword request', async () => {
    let releaseLoad: (() => void) | undefined
    const loadGate = new Promise<void>((resolve) => {
      releaseLoad = resolve
    })
    const infer = vi.fn(async () => ({
      text: '次は単語を復習しましょう。',
      provider: 'llama.cpp',
      model: 'test-model',
    }))
    const runtime = createTutorChatRuntime({
      provider: 'llama.cpp',
      adapterFactory: () => ({
        load: async () => loadGate,
        unload: async () => undefined,
        infer,
      }),
    })

    const tutor = runtime.sendMessage('cold tutor request')
    expect(runtime.getStatus().inferenceActive).toBe(true)

    await expect(runtime.generateCrosswordClues([{ poolPosition: 0, answer: '学校', fallbackClue: 'school' }]))
      .resolves.toEqual({ ok: false, text: '' })
    expect(runtime.getStatus().inferenceActive).toBe(true)
    expect(infer).not.toHaveBeenCalled()

    releaseLoad?.()
    await expect(tutor).resolves.toMatchObject({ ok: true, provider: 'llama.cpp' })
    expect(infer).toHaveBeenCalledTimes(1)
    expect(runtime.getStatus().inferenceActive).toBe(false)
  })

  it('reserves cold loading for crossword inference before a competing tutor request', async () => {
    let releaseLoad: (() => void) | undefined
    const loadGate = new Promise<void>((resolve) => {
      releaseLoad = resolve
    })
    const infer = vi.fn(async () => ({
      text: '[{"poolPosition":0,"clue":"Place to learn"}]',
      provider: 'llama.cpp',
      model: 'test-model',
    }))
    const runtime = createTutorChatRuntime({
      provider: 'llama.cpp',
      adapterFactory: () => ({
        load: async () => loadGate,
        unload: async () => undefined,
        infer,
      }),
    })

    const crossword = runtime.generateCrosswordClues([{ poolPosition: 0, answer: '学校', fallbackClue: 'school' }])
    expect(runtime.getStatus().inferenceActive).toBe(true)

    await expect(runtime.sendMessage('competing tutor request')).rejects.toThrow(/already active/i)
    expect(runtime.getStatus().inferenceActive).toBe(true)
    expect(infer).not.toHaveBeenCalled()

    releaseLoad?.()
    await expect(crossword).resolves.toMatchObject({ ok: true })
    expect(infer).toHaveBeenCalledTimes(1)
    expect(runtime.getStatus().inferenceActive).toBe(false)
  })

  it('returns scripted fallback response when adapter inference fails', async () => {
    const runtime = createTutorChatRuntime({
      provider: 'stub',
      adapterFactory: () => ({
        async load() {
          return undefined
        },
        async unload() {
          return undefined
        },
        async infer() {
          throw new Error('adapter boom')
        },
      }),
    })

    const response = await runtime.sendMessage('help with kanji', { focus_area: 'kanji_n5' })
    expect(response.ok).toBe(true)
    expect(response.provider).toBe('scripted-fallback')
    expect(response.text).toMatch(/練習しましょう/)
    expect(response.text.length).toBeLessThanOrEqual(700)
  })

  it('answers a translation question from the offline dictionary, before adapter inference', async () => {
    const runtime = createTutorChatRuntime({
      provider: 'stub',
      translationOfflineEntries: [{ japanese: 'トイレ', reading: 'トイレ', gloss: 'toilet; bathroom', is_common: 1 }],
      adapterFactory: () => ({
        async load() {
          return undefined
        },
        async unload() {
          return undefined
        },
        async infer() {
          throw new Error('infer should not be called for dictionary hit')
        },
      }),
    })

    const response = await runtime.sendMessage('How do you say "bathroom" in Japanese?')
    expect(response.ok).toBe(true)
    expect(response.provider).toBe('offline-jmdict')
    expect(response.text).toBe('トイレ')
  })

  it('uses local glossary for profane single-word translation requests', async () => {
    const runtime = createTutorChatRuntime({
      provider: 'stub',
      adapterFactory: () => ({
        async load() {
          return undefined
        },
        async unload() {
          return undefined
        },
        async infer() {
          throw new Error('infer should not be called for local glossary hits')
        },
      }),
    })

    const response = await runtime.sendMessage('How do you say "shit" in Japanese?')
    expect(response.ok).toBe(true)
    expect(response.provider).toBe('local-translation-glossary')
    expect(response.model).toBe('builtin-glossary')
    expect(response.text).toBe('くそ')
  })

  it('falls back to adapter inference when dictionary has no match', async () => {
    const runtime = createTutorChatRuntime({
      provider: 'stub',
      adapterFactory: () => ({
        async load() {
          return undefined
        },
        async unload() {
          return undefined
        },
        async infer() {
          return {
            text: '文脈を教えてください。',
            provider: 'stub',
            model: 'stub-model',
          }
        },
      }),
    })

    const response = await runtime.sendMessage('Translate "launch sequence" to Japanese.')
    expect(response.ok).toBe(true)
    expect(response.provider).toBe('stub')
    expect(response.text).toContain('文脈を教えてください')
  })

  it('uses offline JMdict translation', async () => {
    const runtime = createTutorChatRuntime({
      provider: 'stub',
      translationOfflineEntries: [{ japanese: 'お手洗い', reading: 'おてあらい', gloss: 'bathroom', is_common: 1 }],
      adapterFactory: () => ({
        async load() {
          return undefined
        },
        async unload() {
          return undefined
        },
        async infer() {
          throw new Error('infer should not be called for offline dictionary hit')
        },
      }),
    })

    const response = await runtime.sendMessage('How do you say "bathroom" in Japanese?')
    expect(response.ok).toBe(true)
    expect(response.provider).toBe('offline-jmdict')
    expect(response.model).toBe('jmdict-offline')
    expect(response.text).toBe('お手洗い (おてあらい)')
  })

  // Audit 14, F4: "translation is ready" is decided by the same resolver the runtime uses.
  describe('translation readiness', () => {
    const fs = require('node:fs')
    const os = require('node:os')
    const path = require('node:path')
    const { resolveTutorRuntimeFiles, isLocalTranslationReady } = require('./llm_runtime.cjs')
    const saved: Record<string, string | undefined> = {}
    const keys = ['JPLEARN_ASSETS_DIR', 'JPLEARN_TUTOR_PROVIDER', 'JPLEARN_LLAMA_SERVER_PATH', 'JPLEARN_LLAMA_MODEL_PATH']
    let assets = ''

    beforeEach(() => {
      for (const key of keys) {
        saved[key] = process.env[key]
        delete process.env[key]
      }
      assets = fs.mkdtempSync(path.join(os.tmpdir(), 'jplearn-assets-'))
      process.env.JPLEARN_ASSETS_DIR = assets
      const bin = path.join(assets, 'tools', 'llama.cpp', 'build', 'bin', 'Release')
      fs.mkdirSync(bin, { recursive: true })
      fs.writeFileSync(path.join(bin, 'llama-server.exe'), '')
      fs.mkdirSync(path.join(assets, 'models', 'llama'), { recursive: true })
    })

    afterEach(() => {
      for (const key of keys) {
        if (saved[key] === undefined) delete process.env[key]
        else process.env[key] = saved[key]
      }
      fs.rmSync(assets, { recursive: true, force: true })
    })

    it('is ready with a runner and a model on disk, and not without the model', () => {
      expect(isLocalTranslationReady()).toBe(false)
      fs.writeFileSync(path.join(assets, 'models', 'llama', 'translate.gguf'), '')
      expect(isLocalTranslationReady()).toBe(true)
    })

    it('is not ready when the tutor is forced onto the stub', () => {
      fs.writeFileSync(path.join(assets, 'models', 'llama', 'translate.gguf'), '')
      process.env.JPLEARN_TUTOR_PROVIDER = 'stub'
      expect(isLocalTranslationReady()).toBe(false)
    })

    it('uses the selected translation model when no tutor model is active', () => {
      fs.writeFileSync(path.join(assets, 'models', 'llama', 'a-other.gguf'), '')
      fs.writeFileSync(path.join(assets, 'models', 'llama', 'z-selected.gguf'), '')
      fs.mkdirSync(path.join(assets, 'translation'), { recursive: true })
      fs.writeFileSync(
        path.join(assets, 'translation', 'active-translation-model.json'),
        JSON.stringify({ tier: 'qwen_ja_en', filename: 'z-selected.gguf' }),
      )
      expect(path.basename(resolveTutorRuntimeFiles().modelPath)).toBe('z-selected.gguf')
    })
  })

  // Audit 14, F3: the tutor reads the index the build makes (dictionary_entries + dictionary_fts).
  describe('offline dictionary index', () => {
    const fs = require('node:fs')
    const os = require('node:os')
    const path = require('node:path')
    let DatabaseSync: (new (file: string) => { exec(sql: string): void, close(): void }) | null = null
    try {
      ;({ DatabaseSync } = require('node:sqlite'))
    } catch {
      DatabaseSync = null
    }
    const sqliteIt = DatabaseSync ? it : it.skip

    function buildIndex(dir: string, rows: Array<[string, string, string, number]>, withFts = true) {
      const sqlitePath = path.join(dir, 'jmdict_lookup.sqlite')
      const db = new DatabaseSync!(sqlitePath)
      db.exec([
        'CREATE TABLE dictionary_entries (entry_id INTEGER PRIMARY KEY, source_id TEXT, japanese TEXT NOT NULL, reading TEXT NOT NULL, gloss TEXT NOT NULL, is_common INTEGER NOT NULL DEFAULT 0);',
        withFts
          ? "CREATE VIRTUAL TABLE dictionary_fts USING fts5(gloss, content='dictionary_entries', content_rowid='entry_id', tokenize='porter unicode61');"
          : '',
      ].join('\n'))
      rows.forEach(([japanese, reading, gloss, common], index) => {
        const escape = (value: string) => value.replace(/'/g, "''")
        db.exec(`INSERT INTO dictionary_entries (entry_id, source_id, japanese, reading, gloss, is_common) VALUES (${index + 1}, 'jmdict:${index + 1}', '${escape(japanese)}', '${escape(reading)}', '${escape(gloss)}', ${common});`)
      })
      if (withFts) {
        db.exec("INSERT INTO dictionary_fts(dictionary_fts) VALUES('rebuild');")
      }
      db.close()
      return sqlitePath
    }

    function runtimeAt(sqlitePath: string, infer = async () => ({ text: 'モデル', provider: 'stub', model: 'stub-model' })) {
      return createTutorChatRuntime({
        provider: 'stub',
        translationOfflineDictionarySqlitePath: sqlitePath,
        adapterFactory: () => ({
          async load() { return undefined },
          async unload() { return undefined },
          infer,
        }),
      })
    }

    async function withDir(run: (dir: string) => Promise<void>) {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'jplearn-dict-'))
      try {
        await run(dir)
      } finally {
        try {
          fs.rmSync(dir, { recursive: true, force: true })
        } catch {
          // Windows can hold a read lock briefly for SQLite handles.
        }
      }
    }

    sqliteIt('answers from an exact gloss', async () => {
      await withDir(async (dir) => {
        const runtime = runtimeAt(buildIndex(dir, [['お手洗い', 'おてあらい', 'toilet; bathroom', 1]]))
        const response = await runtime.sendMessage('How do you say "bathroom" in Japanese?')
        expect(response.provider).toBe('offline-jmdict')
        expect(response.model).toBe('jmdict-offline-sqlite')
        expect(response.text).toBe('お手洗い (おてあらい)')
        await runtime.unload()
      })
    })

    sqliteIt('finds a rare exact gloss behind many common partial matches', async () => {
      await withDir(async (dir) => {
        const partial: Array<[string, string, string, number]> = Array.from({ length: 40 }, (_, i) => [`水${i}`, 'みず', `water tank number ${i}`, 1])
        const runtime = runtimeAt(buildIndex(dir, [...partial, ['水', 'みず', 'water; fluid', 0]]))
        const response = await runtime.sendMessage('How do you say "water" in Japanese?')
        expect(response.text).toBe('水 (みず)')
        await runtime.unload()
      })
    })

    sqliteIt('never answers with the cut-off end of a gloss list', async () => {
      await withDir(async (dir) => {
        // the index keeps 240 characters, so this common entry's "caravan" survives as "car"
        const cut = `${'wagon train; '.repeat(17)}travelling party; car`.slice(-240)
        expect(cut).toHaveLength(240)
        const runtime = runtimeAt(buildIndex(dir, [['隊商', 'たいしょう', cut, 1], ['車', 'くるま', 'automobile; car', 0]]))
        expect((await runtime.sendMessage('How do you say "car" in Japanese?')).text).toBe('車 (くるま)')
        await runtime.unload()
      })
    })

    sqliteIt('normalises glosses as it normalises the question', async () => {
      await withDir(async (dir) => {
        const runtime = runtimeAt(buildIndex(dir, [
          ['アイスクリーム', 'アイスクリーム', 'ice-cream', 1],
          ['お茶', 'おちゃ', "tea  ( green );  someone's  tea", 1],
        ]))
        expect((await runtime.sendMessage('How do you say "ice cream" in Japanese?')).text).toBe('アイスクリーム')
        expect((await runtime.sendMessage('How do you say "Ice-Cream!" in Japanese?')).text).toBe('アイスクリーム')
        await runtime.unload()
      })
    })

    sqliteIt('falls through to the model with no index, or an index without its tables', async () => {
      await withDir(async (dir) => {
        const missing = runtimeAt(path.join(dir, 'absent.sqlite'))
        expect((await missing.sendMessage('How do you say "bathroom" in Japanese?')).provider).toBe('stub')
        const bare = runtimeAt(buildIndex(dir, [['お手洗い', 'おてあらい', 'bathroom', 1]], false))
        expect((await bare.sendMessage('How do you say "bathroom" in Japanese?')).provider).toBe('stub')
        await bare.unload()
      })
    })

    sqliteIt('finds an index installed after an earlier miss', async () => {
      await withDir(async (dir) => {
        const sqlitePath = path.join(dir, 'jmdict_lookup.sqlite')
        const runtime = runtimeAt(sqlitePath)
        expect((await runtime.sendMessage('How do you say "bathroom" in Japanese?')).provider).toBe('stub')
        buildIndex(dir, [['お手洗い', 'おてあらい', 'bathroom', 1]])
        expect((await runtime.sendMessage('How do you say "bathroom" in Japanese?')).provider).toBe('offline-jmdict')
        await runtime.unload()
      })
    })
  })

  it('treats code 130 runtime text as cancellation instead of surfacing raw errors', async () => {
    const runtime = createTutorChatRuntime({
      provider: 'stub',
      adapterFactory: () => ({
        async load() {
          return undefined
        },
        async unload() {
          return undefined
        },
        async infer() {
          throw new Error('llama.cpp exited with code 130: (empty stderr)')
        },
      }),
    })

    await expect(runtime.sendMessage('hello', { focus_area: 'today\'s weakest area' })).rejects.toThrow(
      /chat inference cancelled/i,
    )
  })

  it('treats llama.cpp exit code 130 with stderr text as cancellation', async () => {
    const runtime = createTutorChatRuntime({
      provider: 'stub',
      adapterFactory: () => ({
        async load() {
          return undefined
        },
        async unload() {
          return undefined
        },
        async infer() {
          throw new Error('llama.cpp exited with code 130: interrupted')
        },
      }),
    })

    await expect(runtime.sendMessage('cancel me please', { focus_area: 'kanji_n5' })).rejects.toThrow(
      /chat inference cancelled/i,
    )
  })

  it('supports explicit runtime preload before first message', async () => {
    const runtime = createTutorChatRuntime({
      provider: 'stub',
    })

    const preloadResult = await runtime.preload('test-startup')
    expect(preloadResult.ok).toBe(true)
    expect(preloadResult.reason).toBe('test-startup')
    expect(preloadResult.loaded).toBe(true)
    expect(typeof preloadResult.coldStart).toBe('boolean')

    const status = runtime.getStatus()
    expect(status.loaded).toBe(true)
  })

  it('cancels active inference and reports cancellation', async () => {
    const runtime = createTutorChatRuntime({
      provider: 'stub',
      adapterFactory: () => ({
        async load() {
          return undefined
        },
        async unload() {
          return undefined
        },
        async infer(_message, _context, options) {
          await new Promise((resolve, reject) => {
            options.signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true })
            setTimeout(resolve, 200)
          })
          return {
            text: 'should not complete',
            provider: 'stub',
            model: 'stub',
          }
        },
      }),
    })

    const pending = runtime.sendMessage('cancel me')
    while (!runtime.getStatus().inferenceActive) {
      await new Promise((resolve) => setTimeout(resolve, 0))
    }
    const cancelPayload = await runtime.cancelActiveInference('test-cancel')
    expect(cancelPayload.ok).toBe(true)
    expect(cancelPayload.cancelled).toBe(true)
    /* a cancel that lands before inference starts is a cancel, not a scripted reply (audit 5 nit 1) */
    await expect(pending).rejects.toThrow('Chat inference cancelled')
  })

  it('auto-selects translation adapter by intent', async () => {
    const seen = {
      adapterId: '',
    }
    const runtime = createTutorChatRuntime({
      provider: 'stub',
      adapterFactory: () => ({
        async load() {
          return undefined
        },
        async unload() {
          return undefined
        },
        async infer(_message, _context, runtimeOptions) {
          seen.adapterId = String(runtimeOptions.promptAdapter?.id || '')
          return {
            text: 'stub translation result',
            provider: 'stub',
            model: 'stub-model',
          }
        },
      }),
    })

    const response = await runtime.sendMessage('Can you translate this in Japanese?')
    expect(response.ok).toBe(true)
    expect(response.adapter).toBe('translation')
    expect(seen.adapterId).toBe('translation')
  })

  it('honors explicit assistant adapter override from context', async () => {
    const seen = {
      adapterId: '',
    }
    const runtime = createTutorChatRuntime({
      provider: 'stub',
      adapterFactory: () => ({
        async load() {
          return undefined
        },
        async unload() {
          return undefined
        },
        async infer(_message, _context, runtimeOptions) {
          seen.adapterId = String(runtimeOptions.promptAdapter?.id || '')
          return {
            text: 'stub grammar result',
            provider: 'stub',
            model: 'stub-model',
          }
        },
      }),
    })

    const response = await runtime.sendMessage('hello coach', { assistant_adapter: 'grammar' })
    expect(response.ok).toBe(true)
    expect(response.adapter).toBe('grammar')
    expect(seen.adapterId).toBe('grammar')
  })
})

describe('extractCliResponseText', () => {
  it('strips llama-cli banner, command list, prompt echo, and exit marker', () => {
    const raw = [
      '',
      'Loading model... ',
      '',
      '\u2584\u2584 \u2584\u2584',
      'build      : b1-050ee92',
      'model      : C:/models/Qwen3.5.gguf',
      'modalities : text',
      'using custom system prompt',
      '',
      'available commands:',
      '  /exit or Ctrl+C     stop or exit',
      '  /glob <pattern>     add text files using globbing pattern',
      '',
      '',
      '> hello',
      '',
      'Hello! How can I help you today?',
      '',
      'Exiting...',
      '',
    ].join('\n')

    expect(extractCliResponseText(raw)).toBe('Hello! How can I help you today?')
  })

  it('strips a plain-text [Start thinking] reasoning block', () => {
    const raw = [
      'available commands:',
      '  /glob <pattern>     add text files using globbing pattern',
      '',
      '> hello',
      '',
      '[Start thinking]',
      'The user said hello. I should greet them warmly in a short reply.',
      'Maybe add a little Japanese.',
      '[End thinking]',
      '',
      'Hello! How is your day? \u304a\u5143\u6c17\uff1f',
      'Exiting...',
    ].join('\n')

    expect(extractCliResponseText(raw)).toBe('Hello! How is your day? \u304a\u5143\u6c17\uff1f')
  })

  it('drops an unterminated thinking block so partial reasoning never leaks', () => {
    const raw = [
      '> hello',
      '',
      '[Start thinking]',
      'Analyzing the request and it got cut off mid-thought',
    ].join('\n')

    expect(extractCliResponseText(raw)).toBe('')
  })

  it('returns empty string for empty output', () => {
    expect(extractCliResponseText('')).toBe('')
  })
})

describe('what the tutor sends off the machine (audit 5, F1)', () => {
  /* Hard line 2: what the learner asks the tutor stays local. The online dictionary looked up the
     learner's English words on jisho.org before the offline one; it is gone, and stays gone. */
  it('ships no online dictionary client', () => {
    const fs = require('node:fs')
    const path = require('node:path')
    const source = fs.readFileSync(path.join(__dirname, 'llm_runtime.cjs'), 'utf8')
    const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'))
    expect(source).not.toMatch(/jisho/i)
    expect(Object.keys(pkg.dependencies ?? {})).not.toContain('unofficial-jisho-api')
  })
})

describe('the tutor model server lifecycle (audit 5, F3/F7)', () => {
  const { httpRequestJson, createLlamaServerAdapter } = require('./llm_runtime.cjs')

  it('fails at once when the model server exits while starting', async () => {
    /* Node stands in for llama-server: it rejects the server's flags and exits straight away, as a
       bad model file or a missing DLL would. The load must say so, not poll port 0 for two minutes. */
    const adapter = createLlamaServerAdapter({
      executablePath: process.execPath,
      modelPath: __filename,
      startupTimeoutMs: 60000,
    })
    const started = Date.now()
    await expect(adapter.load()).rejects.toThrow(/exited before becoming ready/)
    expect(Date.now() - started).toBeLessThan(10000)
    expect(adapter.isRunning()).toBe(false)
  }, 20000)

  it('ends a request that runs past its timeout instead of waiting on it', async () => {
    const http = require('node:http')
    const server = http.createServer(() => { /* never answers */ })
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()))
    const port = (server.address() as { port: number }).port
    try {
      const started = Date.now()
      await expect(
        httpRequestJson({ host: '127.0.0.1', port, path: '/completion', method: 'POST', timeout: 200 }, { prompt: 'x' }),
      ).rejects.toMatchObject({ code: 'ETIMEDOUT' })
      expect(Date.now() - started).toBeLessThan(2000)
    } finally {
      server.closeAllConnections?.()
      server.close()
    }
  })

  function makeAdapter(state: { running: boolean, release?: () => void, hold?: boolean }) {
    return {
      async load() { state.running = true },
      async unload() { state.running = false },
      isRunning: () => state.running,
      async infer() {
        if (state.hold) await new Promise<void>((resolve) => { state.release = resolve })
        return { text: 'こんにちは。', provider: 'llama.cpp', model: 'test' }
      },
    }
  }

  it('starts the model again when its server has stopped', async () => {
    const state = { running: false }
    const adapterFactory = vi.fn(() => makeAdapter(state))
    const runtime = createTutorChatRuntime({ provider: 'stub', adapterFactory })

    await runtime.sendMessage('hello there')
    expect(adapterFactory).toHaveBeenCalledTimes(1)
    state.running = false // llama-server crashed after loading
    const reply = await runtime.sendMessage('hello again')
    expect(adapterFactory).toHaveBeenCalledTimes(2)
    expect(reply.provider).toBe('llama.cpp')
  })

  it('arms the inactivity unload only once a request has settled', async () => {
    vi.useFakeTimers()
    try {
      const state: { running: boolean, release?: () => void, hold?: boolean } = { running: false, hold: true }
      const runtime = createTutorChatRuntime({
        provider: 'stub', inactivityUnloadMs: 15000, adapterFactory: () => makeAdapter(state),
      })
      const pending = runtime.sendMessage('a long question')
      await vi.waitFor(() => expect(state.release).toBeTypeOf('function'))
      await vi.advanceTimersByTimeAsync(20000) // longer than the unload window, mid-request
      expect(runtime.getStatus().loaded).toBe(true)
      state.release?.()
      await expect(pending).resolves.toMatchObject({ ok: true })
      await vi.advanceTimersByTimeAsync(15000)
      expect(runtime.getStatus().loaded).toBe(false)
    } finally {
      vi.useRealTimers()
    }
  })

  it('unloads a model loaded for crossword clues once it is idle', async () => {
    vi.useFakeTimers()
    try {
      const state = { running: false }
      const runtime = createTutorChatRuntime({
        provider: 'llama.cpp', inactivityUnloadMs: 15000, adapterFactory: () => makeAdapter(state),
      })
      await runtime.generateCrosswordClues([{ poolPosition: 0, answer: '学校', fallbackClue: 'school' }])
      expect(runtime.getStatus().loaded).toBe(true)
      await vi.advanceTimersByTimeAsync(15000)
      expect(runtime.getStatus().loaded).toBe(false)
    } finally {
      vi.useRealTimers()
    }
  })
})
