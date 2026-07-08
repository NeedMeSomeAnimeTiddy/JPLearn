import type { VoiceOptionEntry } from './types'

export const FIXED_JAPANESE_VOICE_OPTIONS: VoiceOptionEntry[] = [
  { id: 'zundamon_normal', name: 'Zundamon', jp: 'ずんだもん', search: 'zundamon normal' },
  { id: 'shikoku_metan_normal', name: 'Shikoku Metan', jp: '四国めたん', search: 'shikoku metan normal' },
  { id: 'kasukabe_tsumugi_normal', name: 'Kasukabe Tsumugi', jp: '春日部つむぎ', search: 'kasukabe tsumugi normal' },
  { id: 'namine_ritsu_normal', name: 'Namine Ritsu', jp: '波音リツ', search: 'namine ritsu normal' },
  { id: 'genno_takehiro_normal', name: 'Genno Takehiro', jp: '玄野武宏', search: 'genno takehiro normal' },
  { id: 'shirakami_kotaro_normal', name: 'Shirakami Kotaro', jp: '白上虎太郎', search: 'shirakami kotaro normal' },
  { id: 'meimei_himari_normal', name: 'Meimei Himari', jp: '冥鳴ひまり', search: 'meimei himari normal' },
  { id: 'kyushu_sora_normal', name: 'Kyushu Sora', jp: '九州そら', search: 'kyushu sora normal' },
]

export const DEFAULT_VOICE_SPEAKER = FIXED_JAPANESE_VOICE_OPTIONS[0].id
export const VOICE_SAMPLE_LINE = 'こんにちは。いっしょにがんばりましょう。'
