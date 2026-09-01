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
