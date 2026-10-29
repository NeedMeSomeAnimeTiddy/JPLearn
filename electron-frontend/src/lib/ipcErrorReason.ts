/* Electron wraps anything the main process throws as
   `Error invoking remote method 'study:search-dictionary': Error: <the real one>`, which is a
   sentence about IPC rather than about the app. The wrapper is peeled off before anyone sees it. */
export function ipcErrorReason(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error)
  const unwrapped = raw.replace(/^Error invoking remote method '[^']*':\s*/i, '')
  return unwrapped.replace(/^(Error|Exception):\s*/i, '').trim() || raw
}
