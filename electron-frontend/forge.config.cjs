module.exports = {
  packagerConfig: {
    asar: true,
    // Path without extension — Forge appends .ico on Windows, .icns on macOS.
    // Place your icon at electron-frontend/assets/icon.ico before running make.
    icon: './assets/icon',
    extraResource: ['../scripts', '../data', '../domain', '../python-bundle'],
  },
  rebuildConfig: {},
  makers: [
    {
      name: '@electron-forge/maker-squirrel',
      config: {
        name: 'jplearn',
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
