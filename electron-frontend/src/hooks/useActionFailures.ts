import { useCallback, useState } from 'react'
import { settingsFailure, type SettingsActionKind, type SettingsFailure } from '../lib/settingsFailure'

export interface ActionFailures {
  /** what the last try of this action on this target said, or null */
  failureOf: (kind: SettingsActionKind, target: string) => SettingsFailure | null
  /** a new try of the same action on the same target: its old failure goes */
  clear: (kind: SettingsActionKind, target: string) => void
  fail: (kind: SettingsActionKind, target: string, error: unknown) => void
}

/* ONE FAILURE PER ACTION AND TARGET (audit 17, F2). Downloading the small model failing says nothing
   about removing the large one, so each is kept apart and only a retry of the same one clears it. */
export function useActionFailures(): ActionFailures {
  const [failures, setFailures] = useState<Readonly<Record<string, SettingsFailure>>>({})

  const failureOf = useCallback(
    (kind: SettingsActionKind, target: string) => failures[`${kind}:${target}`] ?? null,
    [failures],
  )
  const clear = useCallback((kind: SettingsActionKind, target: string) => {
    const key = `${kind}:${target}`
    setFailures((previous) => {
      if (!(key in previous)) return previous
      const next = { ...previous }
      delete next[key]
      return next
    })
  }, [])
  const fail = useCallback((kind: SettingsActionKind, target: string, error: unknown) => {
    setFailures((previous) => ({ ...previous, [`${kind}:${target}`]: settingsFailure(kind, error) }))
  }, [])

  return { failureOf, clear, fail }
}
