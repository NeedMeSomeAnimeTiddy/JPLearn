// @vitest-environment node
import { describe, expect, it } from 'vitest'

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
    expect(response.text).toContain('custom:hello coach')
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
    expect(response.text).toMatch(/let's keep momentum/i)
    expect(response.text.length).toBeLessThanOrEqual(700)
  })

  it('uses unofficial-jisho-api translation before adapter inference', async () => {
    const runtime = createTutorChatRuntime({
      provider: 'stub',
      translationJishoClient: {
        async searchForPhrase() {
          return {
            data: [
              {
                japanese: [{ word: 'トイレ', reading: 'といれ' }],
                senses: [{ english_definitions: ['bathroom'] }],
              },
            ],
          }
        },
      },
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
    expect(response.provider).toBe('unofficial-jisho-api')
    expect(response.text).toBe('トイレ (といれ)')
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
      translationJishoClient: {
        async searchForPhrase() {
          return { data: [] }
        },
      },
    })

    const response = await runtime.sendMessage('Translate "launch sequence" to Japanese.')
    expect(response.ok).toBe(true)
    expect(response.provider).toBe('stub')
    expect(response.text).toContain('文脈を教えてください')
  })

  it('uses offline JMdict translation when online dictionary is unavailable', async () => {
    const runtime = createTutorChatRuntime({
      provider: 'stub',
      translationJishoClient: {
        async searchForPhrase() {
          throw new Error('network unreachable')
        },
      },
      translationOfflineEntries: [
        {
          id: 'offline-test-1',
          kanji: [{ common: true, text: 'お手洗い', tags: [] }],
          kana: [{ common: true, text: 'おてあらい', tags: [], appliesToKanji: ['*'] }],
          sense: [{ gloss: [{ lang: 'eng', text: 'bathroom' }] }],
        },
      ],
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

  it('uses offline JMdict SQLite lookup when available', async () => {
    const fs = require('node:fs')
    const os = require('node:os')
    const path = require('node:path')
    let DatabaseSync = null
    try {
      ;({ DatabaseSync } = require('node:sqlite'))
    } catch {
      DatabaseSync = null
    }

    if (!DatabaseSync) {
      return
    }

    const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'jplearn-dict-'))
    const sqlitePath = path.join(tmpRoot, 'jmdict_lookup.sqlite')

    try {
      const db = new DatabaseSync(sqlitePath)
      db.exec(
        [
          'CREATE TABLE dictionary_lookup (lookup_key TEXT PRIMARY KEY, japanese TEXT NOT NULL, reading TEXT NOT NULL, gloss TEXT NOT NULL, entry_id TEXT);',
          "INSERT INTO dictionary_lookup (lookup_key, japanese, reading, gloss, entry_id) VALUES ('bathroom', 'お手洗い', 'おてあらい', 'bathroom', 'sqlite-test-1');",
        ].join('\n'),
      )
      db.close()

      const runtime = createTutorChatRuntime({
        provider: 'stub',
        translationJishoClient: {
          async searchForPhrase() {
            throw new Error('network unreachable')
          },
        },
        translationOfflineDictionarySqlitePath: sqlitePath,
        adapterFactory: () => ({
          async load() {
            return undefined
          },
          async unload() {
            return undefined
          },
          async infer() {
            throw new Error('infer should not be called for sqlite dictionary hit')
          },
        }),
      })

      const response = await runtime.sendMessage('How do you say "bathroom" in Japanese?')
      expect(response.ok).toBe(true)
      expect(response.provider).toBe('offline-jmdict')
      expect(response.model).toBe('jmdict-offline-sqlite')
      expect(response.text).toBe('お手洗い (おてあらい)')
    } finally {
      try {
        fs.rmSync(tmpRoot, { recursive: true, force: true })
      } catch {
        // Windows can hold a read lock briefly for SQLite handles in CI/dev.
      }
    }
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
    await expect(pending).resolves.toMatchObject({ ok: true, provider: 'scripted-fallback' })
  })

  it('auto-selects translation adapter by intent', async () => {
    const seen = {
      adapterId: '',
    }
    const runtime = createTutorChatRuntime({
      provider: 'stub',
      translationJishoClient: {
        async searchForPhrase() {
          return { data: [] }
        },
      },
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
