/**
 * font_loader.cjs — loads locally downloaded fontsource fonts and returns CSS
 * suitable for injection into the renderer via webContents.insertCSS().
 *
 * Fonts live in Documents\JPLearn\fonts\{family}\{weight}.css alongside their
 * woff2 files in Documents\JPLearn\fonts\{family}\files\. The CSS from
 * fontsource uses relative ./files/ paths; this module rewrites them to
 * absolute file:// URLs so the renderer can load them from disk.
 */

const fs = require('node:fs')
const path = require('node:path')

/**
 * Read all downloaded font CSS files from fontsBaseDir and return a single
 * CSS string with absolute file:// src URLs, ready for insertCSS().
 *
 * @param {string} fontsBaseDir  Path to Documents\JPLearn\fonts\
 * @returns {string}  Combined @font-face CSS, or '' if fonts not downloaded.
 */
function loadFontCSS(fontsBaseDir) {
  if (!fontsBaseDir) return ''
  let families
  try {
    if (!fs.existsSync(fontsBaseDir)) return ''
    families = fs.readdirSync(fontsBaseDir, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => e.name)
  } catch {
    return ''
  }

  const chunks = []

  for (const family of families) {
    const familyDir = path.join(fontsBaseDir, family)
    let cssFiles
    try {
      cssFiles = fs.readdirSync(familyDir)
        .filter((f) => f.endsWith('.css'))
        .sort()
    } catch {
      continue
    }

    // Build the file:// base URL for this family's files/ subdirectory.
    // On Windows: C:\...\fonts\noto-sans-jp\files → file:///C:/.../fonts/noto-sans-jp/files
    const rawFilesDir = path.join(familyDir, 'files')
    const filesDirURL = (() => {
      const fwd = rawFilesDir.replace(/\\/g, '/')
      return process.platform === 'win32' ? `file:///${fwd}` : `file://${fwd}`
    })()

    for (const cssFile of cssFiles) {
      let css
      try {
        css = fs.readFileSync(path.join(familyDir, cssFile), 'utf8')
      } catch {
        continue
      }

      // Rewrite  url(./files/X.woff2)  →  url('file:///path/files/X.woff2')
      css = css.replace(
        /url\(\s*['"]?\.\/files\/([^'")\s]+\.woff2)['"]?\s*\)/g,
        (_, filename) => `url('${filesDirURL}/${filename}')`,
      )

      // Remove woff (non-woff2) fallback entries — we only download woff2 files
      css = css.replace(
        /,\s*url\(\s*['"]?\.\/files\/[^'")\s]+\.woff['"]?\s*\)\s*format\(\s*['"]woff['"]\s*\)/g,
        '',
      )

      chunks.push(css)
    }
  }

  return chunks.join('\n')
}

module.exports = { loadFontCSS }
