import type { BadgeMeta } from './types'

export const BADGE_METADATA: Record<string, BadgeMeta> = {
  listening_mode_unlocked: {
    descriptor: 'listening_mode_unlocked',
    name: 'Sound Catcher',
    description: 'Unlocked listening practice by mastering Hiragana.',
    icon: 'headphones',
    category: 'learning_mode',
  },
  conversation_mode_unlocked: {
    descriptor: 'conversation_mode_unlocked',
    name: 'First Words',
    description: 'Unlocked conversation practice by mastering N5 grammar.',
    icon: 'messageCircle',
    category: 'learning_mode',
  },
  kanji_mode_unlocked: {
    descriptor: 'kanji_mode_unlocked',
    name: 'Character Seeker',
    description: 'Unlocked kanji study by mastering N5 vocabulary and grammar.',
    icon: 'penTool',
    category: 'learning_mode',
  },
  reading_mode_unlocked: {
    descriptor: 'reading_mode_unlocked',
    name: 'Bookworm',
    description: 'Unlocked reading mode by mastering free conversation.',
    icon: 'bookOpen',
    category: 'learning_mode',
  },
  jlpt_dashboard_unlocked: {
    descriptor: 'jlpt_dashboard_unlocked',
    name: 'Exam Ready',
    description: 'Unlocked the JLPT prep dashboard.',
    icon: 'target',
    category: 'milestone',
  },
  tutor_chat_unlocked: {
    descriptor: 'tutor_chat_unlocked',
    name: 'AI Companion',
    description: 'Unlocked the AI tutor by progressing through conversation.',
    icon: 'bot',
    category: 'learning_mode',
  },
}

export const EARNED_BADGE_ORDER = [
  'listening_mode_unlocked',
  'conversation_mode_unlocked',
  'kanji_mode_unlocked',
  'reading_mode_unlocked',
  'jlpt_dashboard_unlocked',
  'tutor_chat_unlocked',
]
