// @vitest-environment node
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import Conf from 'conf'

const configStore = require('./config_store.cjs')

/* electron-store needs Electron; `conf` is the class it extends, so a subclass that writes to a
   scratch folder stands in for it with the same constructor options. */
function storeClassIn(dir: string) {
  return class TestStore extends Conf<Record<string, unknown>> {
    constructor(options: { name: string, defaults: Record<string, unknown>, clearInvalidConfig?: boolean }) {
      super({
        projectName: 'jplearn-test',
        cwd: dir,
        configName: options.name,
        defaults: options.defaults,
        clearInvalidConfig: options.clearInvalidConfig,
      })
    }
  }
}

function scratchDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'jplearn-config-'))
}

afterEach(() => {
  configStore._setStoreClassLoaderForTests(null)
})

describe('config store (audit 17, F6)', () => {
  it('replaces a damaged settings file with the defaults and keeps working', async () => {
    const dir = scratchDir()
    fs.writeFileSync(path.join(dir, 'jplearn-config.json'), '{bad')
    configStore._setStoreClassLoaderForTests(async () => storeClassIn(dir))

    expect(await configStore.getConfigValue('closeBehavior')).toBe('ask')
    expect(await configStore.setConfigValue('closeBehavior', 'tray')).toBe('tray')
    expect(await configStore.getConfigValue('closeBehavior')).toBe('tray')
    expect(JSON.parse(fs.readFileSync(path.join(dir, 'jplearn-config.json'), 'utf8')).closeBehavior).toBe('tray')
  })

  it('tries again after a store that could not be built', async () => {
    const dir = scratchDir()
    const loader = vi.fn()
      .mockRejectedValueOnce(new Error('settings folder is locked'))
      .mockResolvedValue(storeClassIn(dir))
    configStore._setStoreClassLoaderForTests(loader)

    await expect(configStore.getConfigValue('autoUpdateEnabled')).rejects.toThrow('settings folder is locked')
    expect(await configStore.getConfigValue('autoUpdateEnabled')).toBe(true)
    expect(loader).toHaveBeenCalledTimes(2)
  })

  it('callers that arrive together share one build', async () => {
    const dir = scratchDir()
    const loader = vi.fn(async () => storeClassIn(dir))
    configStore._setStoreClassLoaderForTests(loader)

    const values = await Promise.all([
      configStore.getConfigValue('autoUpdateEnabled'),
      configStore.getConfigValue('notificationsEnabled'),
      configStore.getConfigValue('autoStartOnLogin'),
    ])

    expect(values).toEqual([true, true, false])
    expect(loader).toHaveBeenCalledTimes(1)
  })

  it('callers that arrive together all see one failed build, and the next call retries', async () => {
    const dir = scratchDir()
    const loader = vi.fn()
      .mockRejectedValueOnce(new Error('no store'))
      .mockResolvedValue(storeClassIn(dir))
    configStore._setStoreClassLoaderForTests(loader)

    const results = await Promise.allSettled([
      configStore.getConfigValue('autoUpdateEnabled'),
      configStore.getConfigValue('closeBehavior'),
    ])

    expect(results.map((result) => result.status)).toEqual(['rejected', 'rejected'])
    expect(loader).toHaveBeenCalledTimes(1)
    expect(await configStore.getConfigValue('closeBehavior')).toBe('ask')
  })

  it('still refuses an unknown key and a wrong value', async () => {
    configStore._setStoreClassLoaderForTests(async () => storeClassIn(scratchDir()))

    await expect(configStore.getConfigValue('theme')).rejects.toThrow('Invalid config key')
    await expect(configStore.setConfigValue('closeBehavior', 'minimise')).rejects.toThrow('Invalid closeBehavior')
    await expect(configStore.setConfigValue('autoStartOnLogin', 'yes')).rejects.toThrow('Invalid value type')
  })
})
