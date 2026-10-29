/* The main process's short-lived cache of bridge reads (moved out of main.cjs for audit 11).

   A read listed in `ttlsMs` is answered from the cache while fresh, and callers asking while it is
   being computed share the one request. Anything else goes straight to its loader.

   Every clear bumps the generation of the commands it clears (all of them for a full clear). A read
   that started before a clear of its command still answers its own callers, but never lands in the
   cache, and nobody new joins it: without that, a slow read that began before an answer was saved
   could put the old figures back after the save cleared them (audit 11, design critic M1). A clear
   of some commands leaves every other read alone (audit 11 review, finding 2). */

const KEY_SEPARATOR = '\u001f'

function commandOf(commandOrArgs) {
  return Array.isArray(commandOrArgs) ? commandOrArgs[0] : commandOrArgs
}

function keyOf(commandOrArgs) {
  return Array.isArray(commandOrArgs) ? commandOrArgs.join(KEY_SEPARATOR) : commandOrArgs
}

/**
 * @param {object} options
 * @param {Record<string, number>} options.ttlsMs  command -> milliseconds a result stays fresh
 * @param {() => number} [options.now]
 */
function createBridgeReadCache(options) {
  const ttlsMs = options.ttlsMs
  const now = typeof options.now === 'function' ? options.now : Date.now
  /** key -> { payload, expiresAt, command } */
  const cache = new Map()
  /** key -> { promise, generation, command } */
  const inFlight = new Map()
  let allGeneration = 0
  /** command -> clears of that command alone */
  const commandGenerations = new Map()
  const generationOf = (command) => `${allGeneration}:${commandGenerations.get(command) || 0}`

  function read(commandOrArgs, loader) {
    const command = commandOf(commandOrArgs)
    const ttlMs = ttlsMs[command] || 0
    if (ttlMs <= 0) {
      return loader()
    }

    const key = keyOf(commandOrArgs)
    const cached = cache.get(key)
    if (cached && cached.expiresAt > now()) {
      return Promise.resolve(cached.payload)
    }

    const running = inFlight.get(key)
    if (running && running.generation === generationOf(command)) {
      return running.promise
    }

    const startedIn = generationOf(command)
    const promise = Promise.resolve()
      .then(loader)
      .then((payload) => {
        if (startedIn === generationOf(command)) {
          cache.set(key, { payload, expiresAt: now() + ttlMs, command })
        }
        return payload
      })
      .finally(() => {
        if (inFlight.get(key)?.promise === promise) {
          inFlight.delete(key)
        }
      })

    inFlight.set(key, { promise, generation: startedIn, command })
    return promise
  }

  /** Forget cached reads: all of them, or only those of the commands named. */
  function clear(commands) {
    const only = Array.isArray(commands) ? new Set(commands) : null
    if (only) {
      for (const command of only) {
        commandGenerations.set(command, (commandGenerations.get(command) || 0) + 1)
      }
    } else {
      allGeneration += 1
    }
    for (const map of [cache, inFlight]) {
      for (const [key, entry] of Array.from(map.entries())) {
        if (!only || only.has(entry.command)) {
          map.delete(key)
        }
      }
    }
  }

  return {
    read,
    clear,
    get size() {
      return cache.size
    },
  }
}

module.exports = { createBridgeReadCache }
