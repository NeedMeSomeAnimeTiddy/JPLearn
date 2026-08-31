const fs = require("node:fs")
const path = require("node:path")
const { verifyPackagedHandwritingAssets } = require("./scripts/verify-handwriting-assets.cjs")

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
    // Everything the renderer needs is already bundled into dist/ by vite. Shipping the sources
    // it was built from puts them in the asar twice: public/ is copied verbatim into dist/, and
    // node_modules/three ships ~26MB of examples and sources for a library vite already inlined
    // into three-vendor.js. Measured: dropping both took the package from 570MB to 500MB.
    ignore: [
      /^\/public($|\/)/,
      /^\/node_modules\/three($|\/)/,
      /^\/src($|\/)/,
      /^\/mockups($|\/)/,
      /^\/out($|\/)/,
      /^\/\.smoke($|\/)/,
    ],
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
        verifyPackagedHandwritingAssets(path.join(resourcesDir, "app.asar"))
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
