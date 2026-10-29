// Auto-update wiring via update-electron-app (GitHub Releases update source).
//
// Resolves the target repo from JPLEARN_UPDATE_REPO ("owner/repo") or, if
// unset, from this package's package.json "repository" field (wired to
// NeedMeSomeAnimeTiddy/JPLearn in audit 13; Robbie: "wire updates up to github repo").
// One check at launch and none after (Robbie: "Launch only"); the Settings switch
// "Check for updates automatically" turns it off. With no published release the
// service answers 404, which update-electron-app only logs.
const path = require('node:path')

function resolveRepoSlug() {
  const fromEnv = (process.env.JPLEARN_UPDATE_REPO || '').trim()
  if (fromEnv) {
    return fromEnv
  }

  try {
    // eslint-disable-next-line global-require
    const pkg = require(path.join(__dirname, '..', 'package.json'))
    const repoUrl = typeof pkg.repository === 'string' ? pkg.repository : pkg.repository && pkg.repository.url
    if (!repoUrl) {
      return null
    }
    const match = String(repoUrl).match(/github\.com[/:]([^/]+\/[^/.]+)/i)
    return match ? match[1] : null
  } catch {
    return null
  }
}

/**
 * Initialize update-electron-app against the GitHub Releases update source.
 * No-op (returns null) in dev mode, when the app isn't packaged, or when no
 * repo slug can be resolved. Never throws — update failures must not block
 * app startup.
 *
 * @param {{ isPackaged: boolean, logger?: Console }} options
 * @returns {{ stopUpdates: () => void } | null}
 */
function initAutoUpdater({ isPackaged, logger = console, argv = process.argv } = {}) {
  if (process.env.ELECTRON_DEV === '1' || !isPackaged) {
    return null
  }
  // Squirrel holds a lock on the install during its first run; checking then fails (audit 13 critique).
  if (argv.includes('--squirrel-firstrun')) {
    logger.log('[updater] first run after install; no update check this launch')
    return null
  }

  const repo = resolveRepoSlug()
  if (!repo) {
    logger.log('[updater] no repo configured (set JPLEARN_UPDATE_REPO); auto-update disabled')
    return null
  }

  try {
    // eslint-disable-next-line global-require
    const { updateElectronApp, UpdateSourceType } = require('update-electron-app')
    const updates = updateElectronApp({
      updateSource: {
        type: UpdateSourceType.ElectronPublicUpdateService,
        repo,
      },
      updateInterval: '1 hour',
      notifyUser: true,
      logger,
    })
    // The library checks at once and then on an interval; launch only means stopping the interval.
    // Its own 'ready' listener is registered first, so ours runs after the interval exists.
    // eslint-disable-next-line global-require
    const { app } = require('electron')
    if (app.isReady()) updates.stopUpdates()
    else app.once('ready', () => updates.stopUpdates())
    return updates
  } catch (err) {
    logger.log('[updater] initialization failed (non-fatal):', err && err.message ? err.message : err)
    return null
  }
}

module.exports = { initAutoUpdater, resolveRepoSlug }
