import { ipcErrorReason } from './ipcErrorReason'

/* WHAT A FAILED SETTINGS ACTION SAYS (audit 17, F2; Robbie's ruling). A plain sentence a learner can
   act on, and under it, smaller, the main process's own reason for anyone who needs it: the routes
   throw things like "Model download failed: getaddrinfo ENOTFOUND huggingface.co", which is true and
   not a sentence. The reason is peeled of Electron's IPC wrapper by `ipcErrorReason`. */
export type SettingsActionKind =
  | 'download' | 'install' | 'select' | 'uninstall' | 'apply' | 'reset-scheduler' | 'save-setting'

const HEADLINES: Record<SettingsActionKind, string> = {
  download: 'DOWNLOAD FAILED. CHECK YOUR CONNECTION AND TRY AGAIN.',
  install: "COULDN'T INSTALL THIS. TRY AGAIN.",
  select: "COULDN'T SWITCH TO THIS. TRY AGAIN.",
  uninstall: "COULDN'T REMOVE THIS. TRY AGAIN.",
  apply: "COULDN'T APPLY THIS. TRY AGAIN.",
  'reset-scheduler': "COULDN'T RESET THE SCHEDULER. TRY AGAIN.",
  'save-setting': "COULDN'T SAVE THIS SETTING. TRY AGAIN.",
}

const NO_REASON = 'Something went wrong. Try again.'

export interface SettingsFailure {
  headline: string
  reason: string
}

/* WHAT RUNS AFTER AN ACTION HAS SUCCEEDED (re-reading what is installed, warming the voice) is
   not the action. If it fails the action still happened, so it is logged and never shown as the
   action failing. */
export async function afterSuccess(what: string, step: () => Promise<unknown>): Promise<void> {
  try {
    await step()
  } catch (error) {
    console.warn(`[settings] ${what} succeeded; the step after it failed:`, error)
  }
}

export function settingsFailure(kind: SettingsActionKind, error: unknown): SettingsFailure {
  /* a reason is someone else's text, so an em or en dash in it is turned into a comma before it is
     shown (the app shows none) */
  const reason = ipcErrorReason(error).replace(/\s*[–—]\s*/g, ', ').trim()
  return { headline: HEADLINES[kind], reason: reason || NO_REASON }
}
