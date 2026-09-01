// Global test setup for jsdom environment.
// Polyfill browser APIs that jsdom doesn't implement.

if (typeof globalThis.requestAnimationFrame !== 'function') {
  const rafCallbacks = new Map<number, FrameRequestCallback>()
  let rafId = 0
  globalThis.requestAnimationFrame = function requestAnimationFrame(cb: FrameRequestCallback) {
    const id = ++rafId
    rafCallbacks.set(id, cb)
    queueMicrotask(() => {
      const fn = rafCallbacks.get(id)
      if (fn) { rafCallbacks.delete(id); fn(performance.now()) }
    })
    return id
  }
}
if (typeof globalThis.cancelAnimationFrame !== 'function') {
  globalThis.cancelAnimationFrame = function cancelAnimationFrame(_id: number) {
    // no-op — our rAF polyfill fires synchronously via queueMicrotask
  }
}

// Polyfill HTMLCanvasElement for jsdom (axe-core color-contrast checks + app background/tutor utils)
if (typeof HTMLCanvasElement !== 'undefined') {
  // @ts-expect-error minimal jsdom canvas stub (replaces jsdom's throw-on-call implementation)
  HTMLCanvasElement.prototype.getContext = function (contextType: string) {
    if (contextType === '2d') {
      return {
        drawImage: () => undefined,
        getImageData: () => ({ data: new Uint8ClampedArray() }),
        fillRect: () => undefined,
        fillText: () => undefined,
        measureText: () => ({ width: 0 }),
        clearRect: () => undefined,
        beginPath: () => undefined,
        arc: () => undefined,
        fill: () => undefined,
        canvas: this,
      } as unknown as CanvasRenderingContext2D
    }
    return null
  }
  // stub toDataURL for jsdom
  HTMLCanvasElement.prototype.toDataURL = () => 'data:image/png;base64,'
}

/* THE FRONT DOOR IS THE CLASSIC HOME SCREEN IN TESTS, DELIBERATELY.
   Phase 2 of the menu port makes the valley menu the app's default front door, with the old
   `HomeView` one titlebar click away. Almost every suite here starts by reaching for something on
   that old screen — a deck cassette, the "Up next" heading, the Daily Games button — because what
   they are testing is the flow behind the door, not the door.

   Set in a global `beforeEach` rather than once, because ten of these suites call
   `localStorage.clear()` in their own `afterEach`: set once, the flag survives exactly the first
   test in each file and every later one silently gets the new front door instead. Setup-file
   hooks run before file-level ones, so this re-establishes it for every test.

   The menu has its own tests, and they opt back in. */
import { beforeEach } from 'vitest'

beforeEach(() => {
  try {
    window.localStorage.setItem('jplearn.menu.frontDoor', 'off')
  } catch {
    /* no localStorage here; the menu's own tests are the ones that care */
  }
})
