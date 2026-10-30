import type { SettingsFailure } from '../lib/settingsFailure'

/* BESIDE THE CONTROL THAT FAILED (audit 17, F2): the plain sentence, and the main process's reason
   in a smaller muted line under it. The live region is always in the page, empty until something
   fails, so a screen reader hears the failure when it arrives. */
export function SettingsFailureLine({ failures }: { failures: ReadonlyArray<SettingsFailure | null | undefined> }) {
  const shown = failures.filter((failure): failure is SettingsFailure => Boolean(failure))
  return (
    <div className="settings-failure" role="status" aria-live="polite">
      {shown.map((failure) => (
        <p key={failure.headline} className="settings-failure-item">
          <span className="settings-failure-headline">{failure.headline}</span>
          <span className="settings-failure-reason">{failure.reason}</span>
        </p>
      ))}
    </div>
  )
}
