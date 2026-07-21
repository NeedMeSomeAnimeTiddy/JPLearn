/** Mime types the speech bridge accepts; anything else is coerced to webm. */
const ALLOWED_SPEECH_MIME_TYPES = new Set(['audio/webm', 'audio/ogg', 'audio/wav', 'audio/wave', 'audio/x-wav'])

export type SpeechMimeType = 'audio/webm' | 'audio/ogg' | 'audio/wav' | 'audio/wave' | 'audio/x-wav'

/**
 * Encodes a recorded audio Blob as base64 for the `audio:transcribe` bridge.
 * The Blob is read once and never written to disk here — the main process
 * deletes its own temp file after transcription, so no raw audio is retained.
 */
export async function blobToBase64(blob: Blob): Promise<string> {
  const buffer = await blob.arrayBuffer()
  const bytes = new Uint8Array(buffer)
  let binary = ''
  const chunkSize = 0x8000
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize))
  }
  return btoa(binary)
}

/** Falls back to audio/webm for recorder mime types the bridge rejects. */
export function normalizeSpeechMimeType(mimeType: string): SpeechMimeType {
  return (ALLOWED_SPEECH_MIME_TYPES.has(mimeType) ? mimeType : 'audio/webm') as SpeechMimeType
}
