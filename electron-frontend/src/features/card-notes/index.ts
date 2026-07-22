// Card-notes feature module: per-card personal notes (the editor + its
// controller hook) plus the dictionary-identity helpers the notes key off.

export { CardNoteEditor } from './components/CardNoteEditor'
export type { CardNoteEditorProps } from './components/CardNoteEditor'

export { useCardNote, CARD_NOTE_MAX_LENGTH } from './useCardNote'
export type {
  CardNoteController,
  CardNoteErrorOperation,
  CardNoteFocusRequest,
  CardNoteFocusTarget,
  CardNoteMode,
  UseCardNoteOptions,
} from './useCardNote'

export {
  countNoteCharacters,
  dedupeDictionaryCards,
  dictionaryItemRenderKey,
  isValidCardNoteKey,
} from './utils'
export type { DictionaryIdentityItem } from './utils'
