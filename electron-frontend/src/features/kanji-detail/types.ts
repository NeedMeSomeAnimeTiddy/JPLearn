import type { KanjiDetailPayload } from '../../generated/types'

export type KanjiDetailStatus = 'loading' | 'ready' | 'unavailable' | 'error'

export type KanjiDetailRequestState =
  | { status: 'loading'; message: string }
  | { status: 'ready'; detail: KanjiDetailPayload }
  | { status: 'unavailable'; message: string }
  | { status: 'error'; message: string }

export type KanjiDetailRequest = KanjiDetailRequestState & {
  retry: () => void
}

export interface KanjiDetailPanelProps {
  character: string
  onClose: () => void
}
