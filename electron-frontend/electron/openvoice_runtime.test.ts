// @vitest-environment node
import { describe, expect, it } from 'vitest'

const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { isOpenVoiceInstalled, loadVoiceProfiles } = require('./openvoice_runtime.cjs')

const repoRoot = path.resolve(__dirname, '..', '..')

describe('openvoice runtime assets', () => {
  it('loads the seeded OpenVoice voice profiles', () => {
    const profiles = loadVoiceProfiles(path.join(repoRoot, 'data', 'openvoice', 'voices'))

    expect(profiles.map((profile) => profile.voiceId)).toEqual([
      'female_aya',
      'female_mina',
      'male_haru',
      'male_kenji',
    ])
  })

  it('does not report OpenVoice installed until the checkpoints are present', () => {
    const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'jplearn-openvoice-test-'))
    const originalAssetsDir = process.env.JPLEARN_ASSETS_DIR

    try {
      const voiceDir = path.join(tmpRoot, 'openvoice', 'voices', 'test_voice')
      fs.mkdirSync(voiceDir, { recursive: true })
      fs.writeFileSync(
        path.join(voiceDir, 'manifest.json'),
        JSON.stringify({ voiceId: 'test_voice', label: 'Test Voice' }),
        'utf8',
      )

      process.env.JPLEARN_ASSETS_DIR = tmpRoot
      expect(isOpenVoiceInstalled(repoRoot)).toBe(false)
    } finally {
      if (typeof originalAssetsDir === 'string') {
        process.env.JPLEARN_ASSETS_DIR = originalAssetsDir
      } else {
        delete process.env.JPLEARN_ASSETS_DIR
      }
      fs.rmSync(tmpRoot, { recursive: true, force: true })
    }
  })
})