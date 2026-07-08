// Ambient audio controller for the Lofi Dusk atmosphere.
//
// Wraps howler so the rest of the UI never touches the audio library directly.
// The controller is intentionally defensive: it lazily constructs the Howl only
// when playback is requested, tolerates missing/unloadable sources (ambience is
// always optional), and honors a reduced-motion / muted preference. Sources are
// expected to live under electron-frontend/public/audio and are passed in by the
// caller so this module owns no asset paths itself.

import { Howl } from 'howler'

export interface AmbientAudioOptions {
  /** Ordered candidate sources (e.g. ['/audio/rain.webm', '/audio/rain.mp3']). */
  sources: string[]
  /** Target loop volume in the 0..1 range. Defaults to a subtle 0.35. */
  volume?: number
  /** Milliseconds to fade in/out when starting or stopping. Defaults to 800. */
  fadeMs?: number
}

export class AmbientAudioController {
  private howl: Howl | null = null
  private readonly sources: string[]
  private targetVolume: number
  private readonly fadeMs: number
  private enabled = false

  constructor(options: AmbientAudioOptions) {
    this.sources = options.sources
    this.targetVolume = clampVolume(options.volume ?? 0.35)
    this.fadeMs = Math.max(0, options.fadeMs ?? 800)
  }

  /** Whether ambience is currently meant to be playing. */
  get isEnabled(): boolean {
    return this.enabled
  }

  /** Start (or resume) the ambient loop with a gentle fade-in. */
  start(): void {
    if (this.enabled) return
    this.enabled = true

    if (this.sources.length === 0) return
    if (!this.howl) {
      this.howl = new Howl({
        src: this.sources,
        loop: true,
        volume: 0,
        html5: true,
      })
    }

    this.howl.play()
    this.howl.fade(0, this.targetVolume, this.fadeMs)
  }

  /** Fade out and pause the ambient loop. */
  stop(): void {
    if (!this.enabled) return
    this.enabled = false

    const activeHowl = this.howl
    if (!activeHowl) return

    activeHowl.fade(activeHowl.volume(), 0, this.fadeMs)
    window.setTimeout(() => {
      // Only pause if the user has not restarted ambience during the fade.
      if (!this.enabled) activeHowl.pause()
    }, this.fadeMs)
  }

  /** Update the loop volume, applying it live if currently playing. */
  setVolume(volume: number): void {
    this.targetVolume = clampVolume(volume)
    if (this.enabled && this.howl) {
      this.howl.volume(this.targetVolume)
    }
  }

  /** Release the underlying Howl and its buffers. */
  dispose(): void {
    this.enabled = false
    if (this.howl) {
      this.howl.unload()
      this.howl = null
    }
  }
}

function clampVolume(volume: number): number {
  return Math.min(1, Math.max(0, volume))
}
