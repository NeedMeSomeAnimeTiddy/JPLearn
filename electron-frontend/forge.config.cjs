const fs = require('node:fs')
const path = require('node:path')

module.exports = {
  packagerConfig: {
    asar: true,
    // Path without extension — Forge appends .ico on Windows, .icns on macOS.
    // Place your icon at electron-frontend/assets/icon.ico before running make.
    icon: './assets/icon',
    extraResource: ['../scripts', '../data', '../domain', '../python-bundle'],
  },
  hooks: {
    // Remove large runtime-only directories from the bundled extraResources so
    // they never accidentally inflate the installer size.
    // voicevox (~1 GB) is downloaded at first-run by the setup wizard, not bundled.
    postPackage: async (_config, packageResult) => {
      for (const outputPath of packageResult.outputPaths) {
        const resourcesDir = path.join(outputPath, 'resources')
        const toRemove = [
          path.join(resourcesDir, 'data', 'voicevox'),
          path.join(resourcesDir, 'data', 'piper'),
        ]
        for (const dir of toRemove) {
          if (fs.existsSync(dir)) {
            fs.rmSync(dir, { recursive: true, force: true })
            console.log(`[forge hook] removed: ${dir}`)
          }
        }
      }
    },
  },
  rebuildConfig: {},
  makers: [
    {
      name: '@electron-forge/maker-squirrel',
      config: {
        name: 'jplearn',
        // Custom installer filename
        setupExe: 'JPLearn-Installer.exe',
        // Installer window icon — requires electron-frontend/assets/icon.ico
        setupIcon: './assets/icon.ico',
      },
    },
    {
      name: '@electron-forge/maker-zip',
      platforms: ['win32'],
    },
  ],
}
