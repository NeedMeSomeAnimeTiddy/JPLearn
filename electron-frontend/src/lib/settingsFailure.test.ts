import { describe, expect, it } from 'vitest'
import { settingsFailure } from './settingsFailure'

describe('settingsFailure', () => {
  it('pairs a plain sentence with the main process reason, unwrapped', () => {
    const error = new Error("Error invoking remote method 'setup:download-model': Error: Model download failed: getaddrinfo ENOTFOUND huggingface.co")
    expect(settingsFailure('download', error)).toEqual({
      headline: 'DOWNLOAD FAILED. CHECK YOUR CONNECTION AND TRY AGAIN.',
      reason: 'Model download failed: getaddrinfo ENOTFOUND huggingface.co',
    })
  })

  it('names each action in its sentence', () => {
    expect(settingsFailure('install', new Error('x')).headline).toBe("COULDN'T INSTALL THIS. TRY AGAIN.")
    expect(settingsFailure('select', new Error('x')).headline).toBe("COULDN'T SWITCH TO THIS. TRY AGAIN.")
    expect(settingsFailure('uninstall', new Error('x')).headline).toBe("COULDN'T REMOVE THIS. TRY AGAIN.")
    expect(settingsFailure('apply', new Error('x')).headline).toBe("COULDN'T APPLY THIS. TRY AGAIN.")
    expect(settingsFailure('reset-scheduler', new Error('x')).headline).toBe("COULDN'T RESET THE SCHEDULER. TRY AGAIN.")
    expect(settingsFailure('save-setting', new Error('x')).headline).toBe("COULDN'T SAVE THIS SETTING. TRY AGAIN.")
  })

  it('turns a long dash in a reason into a comma', () => {
    expect(settingsFailure('apply', new Error('Profile failed — disk full – retry')).reason)
      .toBe('Profile failed, disk full, retry')
  })

  it('falls back to a plain reason when the error carries none', () => {
    expect(settingsFailure('download', new Error('')).reason).toBe('Something went wrong. Try again.')
    expect(settingsFailure('download', new Error("Error invoking remote method 'x': Error: ")).reason)
      .not.toBe('')
  })
})
