// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'

const { createBridgeReadCache } = require('./bridge_read_cache.cjs')

function deferred<T>() {
  let resolve: (value: T) => void = () => {}
  const promise = new Promise<T>((res) => { resolve = res })
  return { promise, resolve }
}

function createCache(ttlsMs: Record<string, number> = { summary: 30_000, recommendations: 15_000 }) {
  let clock = 1_000
  const cache = createBridgeReadCache({ ttlsMs, now: () => clock })
  return { cache, advance: (ms: number) => { clock += ms } }
}

describe('bridge read cache (audit 11)', () => {
  it('answers a fresh read from the cache, and an uncached command from its loader every time', async () => {
    const { cache, advance } = createCache()
    const loader = vi.fn(async () => ({ due: 3 }))
    await cache.read('summary', loader)
    await expect(cache.read('summary', loader)).resolves.toEqual({ due: 3 })
    expect(loader).toHaveBeenCalledTimes(1)

    advance(30_001)
    await cache.read('summary', loader)
    expect(loader).toHaveBeenCalledTimes(2)

    const uncached = vi.fn(async () => 1)
    await cache.read('xp-progress', uncached)
    await cache.read('xp-progress', uncached)
    expect(uncached).toHaveBeenCalledTimes(2)
  })

  it('shares one computation whichever caller asks first', async () => {
    const { cache } = createCache()
    const pending = deferred<string>()
    const loader = vi.fn(() => pending.promise)
    const first = cache.read('recommendations', loader)
    const second = cache.read('recommendations', loader)
    pending.resolve('block')
    await expect(Promise.all([first, second])).resolves.toEqual(['block', 'block'])
    expect(loader).toHaveBeenCalledTimes(1)
  })

  it('never caches a read that started before a clear, and nobody new joins it', async () => {
    const { cache } = createCache()
    const old = deferred<string>()
    const oldRead = cache.read('summary', () => old.promise)

    cache.clear()
    const fresh = vi.fn(async () => 'after the save')
    const newRead = cache.read('summary', fresh)

    old.resolve('before the save')
    await expect(oldRead).resolves.toBe('before the save')
    await expect(newRead).resolves.toBe('after the save')
    await expect(cache.read('summary', fresh)).resolves.toBe('after the save')
    expect(fresh).toHaveBeenCalledTimes(1)
  })

  it('a clear of named commands forgets only those, but still keeps late reads out', async () => {
    const { cache } = createCache()
    await cache.read('summary', async () => 's1')
    await cache.read('recommendations', async () => 'r1')

    cache.clear(['recommendations'])

    await expect(cache.read('summary', async () => 's2')).resolves.toBe('s1')
    await expect(cache.read('recommendations', async () => 'r2')).resolves.toBe('r2')
  })

  it('a clear of named commands still caches and shares the other reads already running', async () => {
    const { cache } = createCache()
    const summary = deferred<string>()
    const summaryRead = cache.read('summary', () => summary.promise)
    const recommendations = deferred<string>()
    const recommendationsRead = cache.read('recommendations', () => recommendations.promise)

    cache.clear(['recommendations'])

    const joined = vi.fn(async () => 'second summary')
    const joinedRead = cache.read('summary', joined)
    summary.resolve('s1')
    recommendations.resolve('old r')
    await expect(Promise.all([summaryRead, joinedRead, recommendationsRead])).resolves.toEqual(['s1', 's1', 'old r'])
    expect(joined).not.toHaveBeenCalled()
    await expect(cache.read('summary', async () => 's2')).resolves.toBe('s1')
    await expect(cache.read('recommendations', async () => 'new r')).resolves.toBe('new r')
  })

  it('does not cache a failure', async () => {
    const { cache } = createCache()
    await expect(cache.read('summary', async () => { throw new Error('down') })).rejects.toThrow('down')
    await expect(cache.read('summary', async () => 'up')).resolves.toBe('up')
  })
})
