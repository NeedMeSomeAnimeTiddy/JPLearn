import { describe, expect, it } from 'vitest'
import { ipcErrorReason } from './ipcErrorReason'

describe('ipcErrorReason', () => {
  it('peels the Electron IPC wrapper off a main-process error', () => {
    const error = new Error("Error invoking remote method 'study:apply-known-items': Error: Python bridge exited")
    expect(ipcErrorReason(error)).toBe('Python bridge exited')
  })

  it('keeps a plain message as it is', () => {
    expect(ipcErrorReason(new Error('Database is locked'))).toBe('Database is locked')
  })

  it('accepts a non-Error rejection', () => {
    expect(ipcErrorReason('Exception: no such table')).toBe('no such table')
  })

  it('falls back to the raw text when nothing is left after peeling', () => {
    const raw = "Error invoking remote method 'study:x': Error: "
    expect(ipcErrorReason(new Error(raw))).toBe(raw)
  })
})
