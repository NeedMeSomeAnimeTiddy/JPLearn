// Lightweight persisted app config via electron-store. New settings only —
// existing JSON settings files (theme, telemetry, etc.) are left untouched.
//
// electron-store v11+ is ESM-only; this module is CommonJS, so the Store
// class is loaded lazily via dynamic import() and cached.

const CONFIG_DEFAULTS = {
  autoUpdateEnabled: true,
  notificationsEnabled: true,
}

const ALLOWED_KEYS = new Set(Object.keys(CONFIG_DEFAULTS))

let _storePromise = null

function getStore() {
  if (!_storePromise) {
    _storePromise = import('electron-store').then(({ default: Store }) => {
      return new Store({
        name: 'jplearn-config',
        defaults: CONFIG_DEFAULTS,
      })
    })
  }
  return _storePromise
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
  const store = await getStore()
  store.set(key, value)
  return value
}

module.exports = { getConfigValue, setConfigValue, isAllowedConfigKey, CONFIG_DEFAULTS, ALLOWED_KEYS }
