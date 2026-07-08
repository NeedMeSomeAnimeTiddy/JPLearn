import { _electron, type ElectronApplication, type Page } from 'playwright'
import path from 'node:path'

export type LaunchResult = {
  app: ElectronApplication
  main: Page
}

/**
 * Shared helper: launch Electron and return the main window.
 *
 * The app creates two BrowserWindows at startup:
 *  1. Splash window ("Starting JPLearn" title, closes after ~1.1s)
 *  2. Main window
 *
 * We collect both windows as they open, then wait for the splash to close.
 * The remaining page is the main window.
 */
export async function launchApp(): Promise<LaunchResult> {
  const app = await _electron.launch({
    args: ['.'],
    cwd: path.resolve(__dirname, '..', '..'),
    env: {
      ...process.env,
      NODE_ENV: 'production',
      ELECTRON_DEV: '0',
    },
  })

  // Wait for both windows to appear (splash + main)
  const started = Date.now()
  while (app.windows().length < 2 && Date.now() - started < 20_000) {
    await new Promise((r) => setTimeout(r, 200))
  }

  // Now wait for splash to close → only 1 window remains (the main one)
  while (app.windows().length !== 1 && Date.now() - started < 20_000) {
    await new Promise((r) => setTimeout(r, 200))
  }

  const main = app.windows()[0]
  if (!main) throw new Error('Main window did not appear within 20s')

  return { app, main }
}

/**
 * Wait for the React app to render inside #root.
 */
export async function waitForReactApp(page: Page, timeout = 30_000): Promise<void> {
  // Use evaluate to poll for #root (avoids race with page close)
  const deadline = Date.now() + timeout
  while (Date.now() < deadline) {
    try {
      const hasRoot = await page.evaluate(() => !!document.getElementById('root'))
      if (hasRoot) return
    } catch {
      // page might be navigating — retry
    }
    await new Promise((r) => setTimeout(r, 200))
  }
  throw new Error('#root element did not appear within the timeout')
}

/**
 * Dump the page's DOM structure as a simplified text tree.
 */
export async function dumpDOM(page: Page): Promise<string> {
  const html = await page.evaluate(() => {
    function walk(node: Node, depth: number): string {
      const indent = '  '.repeat(depth)
      if (node.nodeType === Node.TEXT_NODE) {
        const text = node.textContent?.trim()
        if (!text) return ''
        if (text.length > 80) return `${indent}${text.slice(0, 80)}...`
        return `${indent}${text}`
      }
      if (node.nodeType !== Node.ELEMENT_NODE) return ''

      const el = node as Element
      const tag = el.tagName.toLowerCase()

      if (tag === 'script' || tag === 'style' || tag === 'noscript') return ''
      if (el instanceof HTMLElement && el.hidden) return ''
      if (tag === 'div' && !el.textContent?.trim()) return ''

      const attrs: string[] = []
      const id = el.id
      if (id) attrs.push(`#${id}`)
      for (const cls of el.classList) {
        if (cls.startsWith('_') || cls.startsWith('css-')) continue
        attrs.push(`.${cls}`)
      }
      const ariaLabel = el.getAttribute('aria-label')
      if (ariaLabel) attrs.push(`[label="${ariaLabel}"]`)
      const role = el.getAttribute('role')
      if (role) attrs.push(`[role=${role}]`)
      const testId = el.getAttribute('data-testid')
      if (testId) attrs.push(`[data-testid=${testId}]`)

      const attrStr = attrs.length > 0 ? attrs.join('') : ''
      const label = `${tag}${attrStr}`

      if (!el.children.length || (el.children.length === 1 && el.children[0].nodeType === Node.TEXT_NODE)) {
        const text = el.textContent?.trim()
        if (text && text.length < 100) {
          return `${indent}<${label}> ${text}`
        }
        return `${indent}<${label}>`
      }

      const children = Array.from(el.childNodes).map((c) => walk(c, depth + 1)).filter(Boolean).join('\n')
      if (!children) return `${indent}<${label}>`
      return `${indent}<${label}>\n${children}`
    }

    return walk(document.body, 0)
  })

  return html
}
