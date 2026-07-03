// Auto-update wiring via update-electron-app (GitHub Releases update source).
//
// Resolves the target repo from JPLEARN_UPDATE_REPO ("owner/repo") or, if
// unset, from this package's package.json "repository" field. If neither is
// configured, auto-update is skipped (logged once) rather than guessing a
// repo — packaged/dev builds still work fine without it.
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
function initAutoUpdater({ isPackaged, logger = console } = {}) {
  if (process.env.ELECTRON_DEV === '1' || !isPackaged) {
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
    return updateElectronApp({
      updateSource: {
        type: UpdateSourceType.ElectronPublicUpdateService,
        repo,
      },
      updateInterval: '1 hour',
      notifyUser: true,
      logger,
    })
  } catch (err) {
    logger.log('[updater] initialization failed (non-fatal):', err && err.message ? err.message : err)
    return null
  }
}

module.exports = { initAutoUpdater, resolveRepoSlug }
