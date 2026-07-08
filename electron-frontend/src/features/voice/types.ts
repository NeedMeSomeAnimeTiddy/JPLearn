export type VoiceStatusPayload = Awaited<ReturnType<NonNullable<typeof window.jplearnDesktop.getVoiceStatus>>>

export interface VoiceSynthesisMeta {
  mode: 'single' | 'mixed_stitched'
  profile: 'main' | 'jp' | 'en'
  mixedSegmentCount: number
  streamingAttempted: boolean
  streamingFallbackUsed: boolean
  elapsedMs: number
}

export interface SpeechSegment {
  text: string
  language: 'ja' | 'en'
}

export type VoiceOptionEntry = { id: string; name: string; jp: string; search: string }

export interface VoiceSettingsFields {
  voiceEnabled: boolean
  voiceSpeaker: string
  ambientAudioEnabled: boolean
}
