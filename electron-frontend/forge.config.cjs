module.exports = {
  packagerConfig: {
    asar: true,
    extraResource: ['../scripts', '../data', '../domain'],
  },
  rebuildConfig: {},
  makers: [
    {
      name: '@electron-forge/maker-squirrel',
      config: {
        name: 'jplearn',
      },
    },
    {
      name: '@electron-forge/maker-zip',
      platforms: ['win32'],
    },
  ],
}
