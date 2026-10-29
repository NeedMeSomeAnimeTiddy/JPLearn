// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'

const { initAutoUpdater, resolveRepoSlug } = require('./updater.cjs')

// Audit 13, F8: updates are wired to the GitHub repository; one check at launch.

describe('the update source', () => {
  it('is read from the real package.json', () => {
    const saved = process.env.JPLEARN_UPDATE_REPO
    delete process.env.JPLEARN_UPDATE_REPO
    try {
      expect(resolveRepoSlug()).toBe('NeedMeSomeAnimeTiddy/JPLearn')
    } finally {
      if (saved !== undefined) process.env.JPLEARN_UPDATE_REPO = saved
    }
  })

  it('carries a plain x.y.z version, which Squirrel orders correctly', () => {
    const pkg = require('../package.json')
    expect(pkg.version).toMatch(/^\d+\.\d+\.\d+$/)
  })
})

describe('initAutoUpdater', () => {
  it('does nothing unpackaged', () => {
    expect(initAutoUpdater({ isPackaged: false, logger: { log: vi.fn() } })).toBeNull()
  })

  it('skips Squirrel\'s first run after install, when the install is locked', () => {
    const logger = { log: vi.fn() }
    expect(initAutoUpdater({ isPackaged: true, logger, argv: ['JPLearn.exe', '--squirrel-firstrun'] })).toBeNull()
    expect(logger.log).toHaveBeenCalledWith(expect.stringMatching(/first run/))
  })
})
