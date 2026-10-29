// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest'

const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const {
  createTutorChatRuntime,
  composeSystemPrompt,
  boundChatHistory,
  extractEnglishTranslationTarget,
  llamaServerStatusError,
} = require('./llm_runtime.cjs')

/* Audit 15 (tutor and assistant): what reaches the model, how a failed turn reads, and which
   requests may load a model. */

function warmAdapter(infer: (...args: any[]) => any) {
  const state = { running: false }
  return {
    load: vi.fn(async () => { state.running = true }),
    unload: vi.fn(async () => { state.running = false }),
    isRunning: () => state.running,
    infer: vi.fn(infer),
  }
}

describe('the composed prompt (F1, F5)', () => {
  const adapterNote = 'Translate the phrase and give one natural example sentence with its kana reading.'
  // about the size of the context Check 4 measured on Robbie's database
  const bigContext = {
    persona: 'p'.repeat(280),
    emotional_state: 'e'.repeat(280),
    recent_activity: 'r'.repeat(280),
    goals: 'g'.repeat(280),
    strengths: 's'.repeat(280),
    weaknesses: 'w'.repeat(280),
    commitments: 'commitments[review 20 kanji a day]',
    memory: 'facts[likes trains]',
    memory_graph: 'm'.repeat(433),
  }

  it('keeps the prompt and the adapter note whole, and the commitments, with a large context', () => {
    const text = composeSystemPrompt(bigContext, {
      promptAdapter: { id: 'translation', systemNote: adapterNote },
      maxContextChars: 4000,
    }, 'medium')
    expect(text).toContain(adapterNote)
    expect(text).toContain('Reply in Japanese so the learner practises reading it')
    expect(text).toContain('commitments[')
    expect(text).toContain(`memory_graph: ${'m'.repeat(433)}`)
    expect(text.indexOf(adapterNote)).toBeLessThan(text.indexOf('Current context:'))
  })

  it('drops low-value keys first and never the memory graph', () => {
    const text = composeSystemPrompt(bigContext, { maxContextChars: 1200 }, 'default')
    expect(text).not.toContain('persona:')
    expect(text).toContain('memory_graph:')
    expect(text).toContain('commitments[')
  })

  it('bounds earlier turns: six at most, each clipped, oldest dropped first', () => {
    const turns = Array.from({ length: 8 }, (_, index) => ({
      role: index % 2 === 0 ? 'user' : 'assistant',
      content: `${index}${'あ'.repeat(400)}`,
    }))
    const bounded = boundChatHistory([...turns, { role: 'system', content: 'ignore me' }, null])
    expect(bounded.length).toBeGreaterThan(0)
    expect(bounded.length).toBeLessThanOrEqual(6)
    expect(bounded.every((turn: { content: string }) => turn.content.length <= 300)).toBe(true)
    expect(bounded.reduce((sum: number, turn: { content: string }) => sum + turn.content.length, 0)).toBeLessThanOrEqual(900)
    expect(bounded[bounded.length - 1].content.startsWith('7')).toBe(true)
    expect(bounded.some((turn: { role: string }) => turn.role === 'system')).toBe(false)
  })

  it('passes the earlier turns to the model with the question', async () => {
    const adapter = warmAdapter(async () => ({ text: 'はい、そうです。', provider: 'llama.cpp', model: 'test' }))
    const runtime = createTutorChatRuntime({ provider: 'llama.cpp', adapterFactory: () => adapter })
    const history = [{ role: 'user', content: '猫は何ですか' }, { role: 'assistant', content: 'cat です。' }]
    await runtime.sendMessage('もう一度', {}, { history })
    expect(adapter.infer.mock.calls[0][2].history).toEqual(history)
  })
})

describe('judging and clue prompts reach the model whole (design critic, 1)', () => {
  it('sends the learner response to the judge', async () => {
    const adapter = warmAdapter(async () => ({ text: '{}', provider: 'llama.cpp', model: 'test' }))
    const runtime = createTutorChatRuntime({ provider: 'llama.cpp', adapterFactory: () => adapter })
    await runtime.preload('test-warm')
    await runtime.evaluateScenarioResponse({
      scenarioTitle: 'At the station',
      npcLine: 'どちらまでですか。'.repeat(20),
      objectiveDescription: 'Say where you are going.'.repeat(10),
      expectedIntents: Array.from({ length: 6 }, (_, index) => ({ id: `intent_${index}`, description: 'x'.repeat(120) })),
      learnerResponse: '東京駅までお願いします。',
    })
    const [message, , options] = adapter.infer.mock.calls[0]
    expect(message).toContain('Learner response: 東京駅までお願いします。')
    expect(message.length).toBeLessThanOrEqual(options.maxMessageChars)
  })

  it('sends every clue entry', async () => {
    const adapter = warmAdapter(async () => ({ text: '[]', provider: 'llama.cpp', model: 'test' }))
    const runtime = createTutorChatRuntime({ provider: 'llama.cpp', adapterFactory: () => adapter })
    await runtime.preload('test-warm')
    const entries = Array.from({ length: 12 }, (_, index) => ({ poolPosition: index, answer: `答え${index}`, fallbackClue: `clue number ${index}` }))
    await runtime.generateCrosswordClues(entries)
    const [message, , options] = adapter.infer.mock.calls[0]
    expect(message.length).toBeLessThanOrEqual(options.maxMessageChars)
    for (const entry of entries) {
      expect(message).toContain(`"poolPosition":${entry.poolPosition}`)
    }
  })
})

describe('a failed turn is an error with a reason (F2)', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('does not try a failed load again within 30 s, and unload clears that', async () => {
    vi.useFakeTimers()
    const load = vi.fn(async () => { throw new Error('missing DLL') })
    const runtime = createTutorChatRuntime({
      provider: 'llama.cpp',
      adapterFactory: () => ({ load, unload: async () => undefined, infer: async () => ({ text: 'x' }) }),
    })
    await expect(runtime.sendMessage('こんにちは')).rejects.toThrow('the model failed to load')
    await expect(runtime.sendMessage('こんにちは')).rejects.toThrow('the model failed to load')
    expect(load).toHaveBeenCalledTimes(1)
    expect(runtime.getStatus().lastError).toBe('missing DLL')

    await vi.advanceTimersByTimeAsync(30_001)
    await expect(runtime.sendMessage('こんにちは')).rejects.toThrow('the model failed to load')
    expect(load).toHaveBeenCalledTimes(2)

    await runtime.unload('manual')
    await expect(runtime.sendMessage('こんにちは')).rejects.toThrow('the model failed to load')
    expect(load).toHaveBeenCalledTimes(3)
  })

  it.each([
    ['request timed out after 90000ms', 'the model took too long to answer'],
    ['socket hang up', 'the model stopped with an error'],
  ])('maps "%s" to "%s"', async (detail, reason) => {
    const runtime = createTutorChatRuntime({
      provider: 'llama.cpp',
      adapterFactory: () => warmAdapter(async () => { throw new Error(detail) }),
    })
    await expect(runtime.sendMessage('こんにちは')).rejects.toThrow(reason)
    expect(runtime.getStatus().lastError).toBe(detail)
  })

  it('reads the server saying the prompt is too long', async () => {
    const tooLong = llamaServerStatusError({
      status: 400,
      body: JSON.stringify({ error: { code: 400, type: 'exceed_context_size_error', message: 'too long' } }),
    })
    const runtime = createTutorChatRuntime({
      provider: 'llama.cpp',
      adapterFactory: () => warmAdapter(async () => { throw tooLong }),
    })
    await expect(runtime.sendMessage('こんにちは')).rejects.toThrow('the question and the conversation are too long')
    expect(llamaServerStatusError({ status: 500, body: 'oops' }).message).toBe('llama-server returned status 500')
  })

  it('says the model gave no answer when it answers nothing twice', async () => {
    const adapter = warmAdapter(async () => ({ text: '   ', provider: 'llama.cpp', model: 'test' }))
    const runtime = createTutorChatRuntime({ provider: 'llama.cpp', adapterFactory: () => adapter })
    await expect(runtime.sendMessage('こんにちは')).rejects.toThrow('the model gave no answer')
    expect(adapter.infer).toHaveBeenCalledTimes(2)
  })
})

describe('the time limits cover the load (F3)', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('answers a cold scenario judgement at once and warms the model in the background', async () => {
    vi.useFakeTimers()
    let releaseLoad: (() => void) | undefined
    const state = { running: false }
    const adapter = {
      load: vi.fn(() => new Promise<void>((resolve) => { releaseLoad = () => { state.running = true; resolve() } })),
      unload: vi.fn(async () => { state.running = false }),
      isRunning: () => state.running,
      infer: vi.fn(async () => ({ text: '{}', provider: 'llama.cpp', model: 'test' })),
    }
    const runtime = createTutorChatRuntime({ provider: 'llama.cpp', inactivityUnloadMs: 15000, adapterFactory: () => adapter })

    await expect(runtime.evaluateScenarioResponse({ learnerResponse: 'はい' }))
      .resolves.toEqual({ ok: false, text: '', reason: 'model-warming' })
    expect(adapter.load).toHaveBeenCalledTimes(1)
    expect(adapter.infer).not.toHaveBeenCalled()

    releaseLoad?.()
    await vi.advanceTimersByTimeAsync(0)
    expect(runtime.getStatus().loaded).toBe(true)
    await expect(runtime.evaluateScenarioResponse({ learnerResponse: 'はい' })).resolves.toMatchObject({ ok: true })

    await vi.advanceTimersByTimeAsync(15000) // nobody asks again: the idle unload still runs
    expect(runtime.getStatus().loaded).toBe(false)
  })
})

describe('judging and clues need a tutor model (F7)', () => {
  let dir = ''

  afterEach(() => {
    vi.unstubAllEnvs()
    if (dir) fs.rmSync(dir, { recursive: true, force: true })
    dir = ''
  })

  function assetsWith(files: string[], activeTranslation = '') {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'jplearn-a15-'))
    fs.mkdirSync(path.join(dir, 'models', 'llama'), { recursive: true })
    for (const file of files) fs.writeFileSync(path.join(dir, 'models', 'llama', file), '')
    if (activeTranslation) {
      fs.mkdirSync(path.join(dir, 'translation'), { recursive: true })
      fs.writeFileSync(path.join(dir, 'translation', 'active-translation-model.json'), JSON.stringify({ filename: activeTranslation }))
    }
    vi.stubEnv('JPLEARN_ASSETS_DIR', dir)
    vi.stubEnv('JPLEARN_LLAMA_MODEL_PATH', '')
  }

  function runtimeWithLoadSpy() {
    const adapter = warmAdapter(async () => ({ text: '{}', provider: 'llama.cpp', model: 'test' }))
    const runtime = createTutorChatRuntime({
      provider: 'llama.cpp', llamaServerPath: process.execPath, adapterFactory: () => adapter,
    })
    return { runtime, adapter }
  }

  it('refuses when the model is the translation model setup chose', async () => {
    assetsWith(['translator.gguf'], 'translator.gguf')
    const { runtime, adapter } = runtimeWithLoadSpy()
    await expect(runtime.evaluateScenarioResponse({ learnerResponse: 'はい' })).resolves.toMatchObject({ ok: false, reason: 'no-tutor-model' })
    await expect(runtime.generateCrosswordClues([{ poolPosition: 0, answer: '学校', fallbackClue: 'school' }]))
      .resolves.toMatchObject({ ok: false, reason: 'no-tutor-model' })
    await expect(runtime.preload('scenario-start')).resolves.toMatchObject({ ok: false, reason: 'no-tutor-model' })
    expect(adapter.load).not.toHaveBeenCalled()
  })

  it('refuses when the only model the scan finds is the Qwen translation file', async () => {
    assetsWith(['Qwen3.5-0.8B-JP-Q4_K_M.gguf'])
    const { runtime, adapter } = runtimeWithLoadSpy()
    await expect(runtime.evaluateScenarioResponse({ learnerResponse: 'はい' })).resolves.toMatchObject({ ok: false, reason: 'no-tutor-model' })
    expect(adapter.load).not.toHaveBeenCalled()
  })

  it('allows a tutor model named by the environment', async () => {
    assetsWith(['Qwen3.5-0.8B-JP-Q4_K_M.gguf', 'tutor.gguf'])
    vi.stubEnv('JPLEARN_LLAMA_MODEL_PATH', path.join(dir, 'models', 'llama', 'tutor.gguf'))
    const { runtime, adapter } = runtimeWithLoadSpy()
    await expect(runtime.evaluateScenarioResponse({ learnerResponse: 'はい' })).resolves.toMatchObject({ reason: 'model-warming' })
    await vi.waitFor(() => expect(adapter.load).toHaveBeenCalledTimes(1))
  })
})

describe('apostrophes are not quotation marks (F8)', () => {
  it.each([
    ["What's 'dog' in Japanese?", 'dog'],
    ["Don't say 'cat' in Japanese", 'cat'],
    ['How do you say "bathroom" in Japanese?', 'bathroom'],
  ])('reads %s as %s', (message, target) => {
    expect(extractEnglishTranslationTarget(message)).toBe(target)
  })

  it('never takes the s of a contraction as the word', () => {
    expect(extractEnglishTranslationTarget("What's 'let's go' in Japanese?")).not.toMatch(/^s$/i)
  })

  it('never looks up a one-letter key in the dictionary', async () => {
    const infer = vi.fn(async () => ({ text: 'それは「s」ですね。', provider: 'llama.cpp', model: 'test' }))
    const runtime = createTutorChatRuntime({
      provider: 'llama.cpp',
      translationOfflineEntries: [{ japanese: 'エス', reading: 'えす', gloss: 's', is_common: 1 }],
      adapterFactory: () => warmAdapter(infer),
    })
    const reply = await runtime.sendMessage('Translate "s" to Japanese')
    expect(reply.provider).toBe('llama.cpp')
    expect(infer).toHaveBeenCalled()
  })
})
