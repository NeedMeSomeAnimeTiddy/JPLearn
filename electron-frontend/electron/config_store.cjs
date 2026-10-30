// Lightweight persisted app config via electron-store. New settings only —
// existing JSON settings files (theme, telemetry, etc.) are left untouched.
//
// electron-store v11+ is ESM-only; this module is CommonJS, so the Store
// class is loaded lazily via dynamic import() and cached.

// Every key here is settable from the renderer through IPC (`config:set`; ipc_security.cjs takes
// its allow-list from ALLOWED_KEYS below). A key whose value is not a boolean needs its own value
// check in setConfigValue (and in validateConfigSetPayload), as closeBehavior has.
const CONFIG_DEFAULTS = {
  autoUpdateEnabled: true,
  notificationsEnabled: true,
  closeBehavior: 'ask',
  autoStartOnLogin: false,
}

const ALLOWED_KEYS = new Set(Object.keys(CONFIG_DEFAULTS))

/** the values `closeBehavior` may take; the renderer's union is held to this list by a test */
const CLOSE_BEHAVIORS = Object.freeze(['ask', 'tray', 'quit'])

const loadStoreClass = async () => (await import('electron-store')).default

let _loadStoreClass = loadStoreClass
let _storePromise = null

/* ONE STORE, BUILT ONCE, AND A FAILED BUILD IS NOT KEPT (audit 17, F6). The file holds four
   preferences, not learner history, so a damaged one is replaced with the defaults
   (`clearInvalidConfig`) instead of making every read and write fail. Anything else that stops the
   store being built clears the cached promise, so the next caller tries again; callers that
   arrive while a build is running share it. */
function getStore() {
  if (!_storePromise) {
    _storePromise = _loadStoreClass()
      .then((Store) => new Store({
        name: 'jplearn-config',
        defaults: CONFIG_DEFAULTS,
        clearInvalidConfig: true,
      }))
      .catch((error) => {
        _storePromise = null
        throw error
      })
  }
  return _storePromise
}

/** tests only: build the store from another class (or the real one again with `null`) */
function _setStoreClassLoaderForTests(loader) {
  _loadStoreClass = loader ?? loadStoreClass
  _storePromise = null
}

function isAllowedConfigKey(key) {
  return typeof key === 'string' && ALLOWED_KEYS.has(key)
}

async function getConfigValue(key) {
  if (!isAllowedConfigKey(key)) {
    throw new Error(`Invalid config key: ${String(key)}`)
  }
  const store = await getStore()
  return store.get(key, CONFIG_DEFAULTS[key])
}

async function setConfigValue(key, value) {
  if (!isAllowedConfigKey(key)) {
    throw new Error(`Invalid config key: ${String(key)}`)
  }
  if (typeof value !== typeof CONFIG_DEFAULTS[key]) {
    throw new Error(`Invalid value type for config key: ${String(key)}`)
  }
  if (key === 'closeBehavior' && !CLOSE_BEHAVIORS.includes(value)) {
    throw new Error(`Invalid closeBehavior value: ${String(value)}. Must be 'ask', 'tray', or 'quit'.`)
  }
  const store = await getStore()
  store.set(key, value)
  return value
}

module.exports = {
  getConfigValue,
  setConfigValue,
  isAllowedConfigKey,
  CONFIG_DEFAULTS,
  ALLOWED_KEYS,
  CLOSE_BEHAVIORS,
  _setStoreClassLoaderForTests,
}
