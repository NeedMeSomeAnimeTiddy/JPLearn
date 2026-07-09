const fs = require("node:fs")
const path = require("node:path")

const extraResourceCandidates = ["../scripts", "../data", "../domain", "../python-bundle"]
const extraResource = extraResourceCandidates.filter((relativePath) => {
  const absolutePath = path.resolve(__dirname, relativePath)
  return fs.existsSync(absolutePath)
})

module.exports = {
  packagerConfig: {
    asar: true,
    // Path without extension - Forge appends .ico on Windows, .icns on macOS.
    icon: "./assets/icon",
    extraResource,
  },
  hooks: {
    // Remove large runtime-only directories from bundled extraResources.
    postPackage: async (_config, packageResult) => {
      for (const outputPath of packageResult.outputPaths) {
        const resourcesDir = path.join(outputPath, "resources")
        const toRemove = [
          path.join(resourcesDir, "data", "whisper"),
          path.join(resourcesDir, "data", "translation"),
          path.join(resourcesDir, "data", "external_sources", "offline_dictionary"),
        ]
        for (const dir of toRemove) {
          if (fs.existsSync(dir)) {
            fs.rmSync(dir, { recursive: true, force: true })
            console.log("[forge hook] removed: " + dir)
          }
        }
      }
    },
  },
  rebuildConfig: {},
  makers: [
    {
      name: "@electron-forge/maker-squirrel",
      config: {
        name: "jplearn",
        setupExe: "JPLearn-Installer.exe",
        setupIcon: "./assets/icon.ico",
      },
    },
    {
      name: "@electron-forge/maker-zip",
      platforms: ["win32"],
    },
  ],
}
