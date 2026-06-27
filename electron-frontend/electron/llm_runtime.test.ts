// @vitest-environment node
import { describe, expect, it } from 'vitest'

const { createTutorChatRuntime } = require('./llm_runtime.cjs')

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
      llamaCppPath: 'C:/missing/llama-cli.exe',
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
})
