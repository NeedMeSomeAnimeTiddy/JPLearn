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
    expect(response.text).toMatch(/coach note/i)
    expect(response.text.length).toBeLessThanOrEqual(700)
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
