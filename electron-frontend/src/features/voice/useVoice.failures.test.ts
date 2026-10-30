import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useVoice } from './useVoice'
import { useModels } from '../models/useModels'
import type { VoiceSettingsFields } from './types'

/* audit 17, F2 review: only the action's own failure is shown as the action failing; a step that
   runs after it succeeded (re-reading what is installed, warming the voice) is logged instead */

const settings = { voiceSpeaker: 'zundamon_normal', voiceSpeed: 1, ambientAudioEnabled: false } as unknown as VoiceSettingsFields

describe('a Settings action and the step after it', () => {
  afterEach(() => {
    window.jplearnDesktop = undefined as unknown as Window['jplearnDesktop']
    vi.restoreAllMocks()
  })

  it('does not call a voice install failed when only the warm-up after it fails', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    window.jplearnDesktop = {
      downloadVoiceEngine: async () => ({ ok: true }),
      preloadVoice: async () => { throw new Error('voice runtime not ready') },
    } as unknown as Window['jplearnDesktop']
    const refresh = vi.fn(async () => {})
    const { result } = renderHook(() => useVoice(settings, vi.fn(), { tutorInstallInfo: null, refreshTutorInstallInfo: refresh }))
    await act(async () => { await result.current.downloadVoiceEngineModel('0.6b') })
    expect(refresh).toHaveBeenCalled()
    expect(result.current.failureOf('install', '0.6b')).toBeNull()
    expect(warn).toHaveBeenCalled()
  })

  it('still calls a voice install failed when the install itself fails', async () => {
    window.jplearnDesktop = {
      downloadVoiceEngine: async () => { throw new Error('Voice install failed: disk full') },
    } as unknown as Window['jplearnDesktop']
    const refresh = vi.fn(async () => {})
    const { result } = renderHook(() => useVoice(settings, vi.fn(), { tutorInstallInfo: null, refreshTutorInstallInfo: refresh }))
    await act(async () => { await result.current.downloadVoiceEngineModel('0.6b') })
    expect(result.current.failureOf('install', '0.6b')?.reason).toBe('Voice install failed: disk full')
    expect(refresh).not.toHaveBeenCalled()
  })

  it('does not call a speech model switch failed when only the refresh after it fails', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    window.jplearnDesktop = { setActiveSpeechModel: async () => ({ ok: true }) } as unknown as Window['jplearnDesktop']
    const refresh = vi.fn(async () => { throw new Error('setup info unavailable') })
    const { result } = renderHook(() => useVoice(settings, vi.fn(), { tutorInstallInfo: null, refreshTutorInstallInfo: refresh }))
    await act(async () => { await result.current.selectSpeechModel('fast') })
    expect(result.current.failureOf('select', 'fast')).toBeNull()
    expect(warn).toHaveBeenCalled()
  })

  it('keeps a tutor model download that succeeded off the failure line', async () => {
    window.jplearnDesktop = {
      downloadModel: async () => ({ ok: true }),
      getSetupSystemInfo: async () => { throw new Error('setup info unavailable') },
    } as unknown as Window['jplearnDesktop']
    const { result } = renderHook(() => useModels())
    await act(async () => { await result.current.downloadTutorModel('low') })
    expect(result.current.failureOf('download', 'low')).toBeNull()
  })
})
