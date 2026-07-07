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
