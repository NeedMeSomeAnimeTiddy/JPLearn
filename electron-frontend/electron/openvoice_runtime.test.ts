// @vitest-environment node
import { describe, expect, it } from 'vitest'

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
    expect(isOpenVoiceInstalled(repoRoot)).toBe(false)
  })
})