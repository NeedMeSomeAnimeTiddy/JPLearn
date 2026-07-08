import { it } from 'vitest'
import { launchApp, waitForReactApp, dumpDOM } from './e2e-helpers'
import fs from 'node:fs'
import path from 'node:path'

/**
 * Dump the DOM structure so the AI agent can "see" the app state.
 *
 * Usage:
 *   npx vitest run --config vitest.e2e.config.ts src/tests/snapshot.e2e.ts
 */
it('dump DOM structure', async () => {
  const { app, main } = await launchApp()
  await waitForReactApp(main)
  await main.waitForTimeout(1000)

  const dom = await dumpDOM(main)

  // Write to file for inspection
  const outPath = path.resolve(__dirname, '..', '..', 'dom-snapshot.txt')
  fs.writeFileSync(outPath, dom, 'utf-8')

  console.log('\n=== DOM STRUCTURE ===')
  console.log(dom.slice(0, 3000))
  console.log(`\n... (full output at ${outPath})`)

  await app.close()
})
