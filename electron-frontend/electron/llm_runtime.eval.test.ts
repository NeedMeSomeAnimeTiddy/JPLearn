// @vitest-environment node
import { describe, expect, it } from 'vitest'

const { createTutorChatRuntime } = require('./llm_runtime.cjs')

describe('llm runtime quality evals', () => {
  it('routes core prompt families to expected adapters', async () => {
    const seen: string[] = []
    const runtime = createTutorChatRuntime({
      provider: 'stub',
      translationOfflineEntries: [],
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
          seen.push(String(runtimeOptions.promptAdapter?.id || ''))
          return {
            text: 'ok',
            provider: 'stub',
            model: 'stub-model',
          }
        },
      }),
    })

    const prompts = [
      { text: 'How do you say this in Japanese?', expected: 'translation' },
      { text: 'Can you correct the grammar in this sentence?', expected: 'grammar' },
      { text: 'What should I study next this week?', expected: 'study_plan' },
      { text: 'Give me a quick encouragement.', expected: 'default' },
    ]

    for (const prompt of prompts) {
      const response = await runtime.sendMessage(prompt.text)
      expect(response.ok).toBe(true)
      expect(response.adapter).toBe(prompt.expected)
    }

    expect(seen).toEqual(['translation', 'grammar', 'study_plan', 'default'])
  })

  it('converts low-confidence model replies into intent-specific clarifying questions', async () => {
    const runtime = createTutorChatRuntime({
      provider: 'stub',
      adapterFactory: () => ({
        async load() {
          return undefined
        },
        async unload() {
          return undefined
        },
        async infer(message) {
          return {
            text: `I'm not sure about this yet: ${message}`,
            provider: 'stub',
            model: 'stub-model',
          }
        },
      }),
    })

    const grammar = await runtime.sendMessage('Can you correct my grammar?')
    expect(grammar.text).toMatch(/full sentence|exact Japanese sentence/i)

    const translation = await runtime.sendMessage('Translate this in Japanese please')
    expect(translation.text).toMatch(/exact phrase|where you want to use it/i)

    const study = await runtime.sendMessage('What should I study next?')
    expect(study.text).toMatch(/10-minute|20-minute|30-minute/i)
  })
})
