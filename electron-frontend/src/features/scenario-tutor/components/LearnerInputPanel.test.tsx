import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { LearnerInputPanel } from './LearnerInputPanel'

afterEach(() => {
  cleanup()
})

function renderPanel(props: Partial<Parameters<typeof LearnerInputPanel>[0]> = {}) {
  const onChange = vi.fn()
  const onSubmit = vi.fn()
  const onStartRecording = vi.fn()
  const onStopRecording = vi.fn()
  render(
    <LearnerInputPanel
      value=""
      onChange={onChange}
      onSubmit={onSubmit}
      speechInputAvailable
      onStartRecording={onStartRecording}
      onStopRecording={onStopRecording}
      romajiConversionEnabled
      {...props}
    />,
  )
  return { onChange, onSubmit, onStartRecording, onStopRecording }
}

describe('LearnerInputPanel', () => {
  it('always renders the typed field, with no mic when speech input is unavailable', () => {
    renderPanel({ speechInputAvailable: false })
    expect(screen.getByRole('textbox', { name: 'Your response' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: /recording/i })).toBeNull()
  })

  it('starts recording when idle and stops it while recording', () => {
    const { onStartRecording } = renderPanel()
    const micButton = screen.getByRole('button', { name: 'Start recording your response' })
    expect(micButton.getAttribute('aria-pressed')).toBe('false')
    fireEvent.click(micButton)
    expect(onStartRecording).toHaveBeenCalledOnce()

    cleanup()
    const recording = renderPanel({ micState: 'recording' })
    const stopButton = screen.getByRole('button', { name: 'Stop recording' })
    expect(stopButton.getAttribute('aria-pressed')).toBe('true')
    fireEvent.click(stopButton)
    expect(recording.onStopRecording).toHaveBeenCalledOnce()
    expect(recording.onStartRecording).not.toHaveBeenCalled()
  })

  it('disables the mic while permission is pending or a clip is transcribing', () => {
    renderPanel({ micState: 'requesting-permission' })
    expect(screen.getByRole('button', { name: 'Start recording your response' }).hasAttribute('disabled')).toBe(true)
    expect(screen.getByText('Requesting microphone access…')).toBeTruthy()

    cleanup()
    renderPanel({ micState: 'processing' })
    expect(screen.getByRole('button', { name: 'Start recording your response' }).hasAttribute('disabled')).toBe(true)
    expect(screen.getByText('Transcribing…')).toBeTruthy()
  })

  it('shows a countdown while listening', () => {
    renderPanel({ micState: 'recording', micElapsedMs: 3000, micMaxDurationMs: 8000 })
    expect(screen.getByText('Listening… (max 5s)')).toBeTruthy()
  })

  it.each([
    ['permission', /Microphone permission was denied/],
    ['no-device', /No microphone was found/],
    ['unsupported', /isn't supported in this build/],
    ['unknown', /Recording failed/],
  ] as const)('explains a %s failure and still points at typing', (errorReason, expected) => {
    renderPanel({ micState: 'error', micErrorReason: errorReason })
    expect(screen.getByText(expected)).toBeTruthy()
    // The typed field is never removed or disabled by an audio failure.
    const input = screen.getByRole('textbox', { name: 'Your response' })
    expect(input.hasAttribute('disabled')).toBe(false)
  })

  it('shows a transcription error as an alert alongside the usable typed field', () => {
    renderPanel({ sttError: 'whisper crashed. You can type your response instead.' })
    expect(screen.getByRole('alert').textContent).toContain('whisper crashed')
    expect(screen.getByRole('textbox', { name: 'Your response' }).hasAttribute('disabled')).toBe(false)
  })

  it('offers the heard transcript for confirmation before submitting', () => {
    const { onSubmit } = renderPanel({ value: 'こんにちは', heardTranscript: 'こんにちは' })
    expect(screen.getByText(/Heard: “こんにちは”/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Submit response' }))
    expect(onSubmit).toHaveBeenCalledOnce()
  })

  it('blocks submission of an empty draft and while a confirmation is pending', () => {
    renderPanel({ value: '   ' })
    expect(screen.getByRole('button', { name: 'Submit response' }).hasAttribute('disabled')).toBe(true)

    cleanup()
    renderPanel({ value: 'こんにちは', disabled: true })
    expect(screen.getByRole('button', { name: 'Submit response' }).hasAttribute('disabled')).toBe(true)
    expect(screen.getByRole('button', { name: 'Start recording your response' }).hasAttribute('disabled')).toBe(true)
  })

  it('submits on Enter but not Shift+Enter', () => {
    const { onSubmit } = renderPanel({ value: 'こんにちは' })
    const input = screen.getByRole('textbox', { name: 'Your response' })
    fireEvent.keyDown(input, { key: 'Enter', shiftKey: true })
    expect(onSubmit).not.toHaveBeenCalled()
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(onSubmit).toHaveBeenCalledOnce()
  })
})
