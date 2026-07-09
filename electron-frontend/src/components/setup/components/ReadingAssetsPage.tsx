import type { SystemInfo, TranslationProfileTier, CompactDropdownOption } from '../types'
import { formatSize, formatDurationMinutes } from '../utils'
import { CheckboxOption } from './CheckboxOption'
import { CompactDropdown } from './CompactDropdown'

interface ReadingAssetsPageProps {
  sysInfo: SystemInfo | null
  installFonts: boolean
  installDictionary: boolean
  selectedTranslationProfileTier: TranslationProfileTier
  onFontsChange: (value: boolean) => void
  onDictionaryChange: (value: boolean) => void
  onTranslationChange: (tier: TranslationProfileTier) => void
}

export function ReadingAssetsPage({
  sysInfo,
  installFonts,
  installDictionary,
  selectedTranslationProfileTier,
  onFontsChange,
  onDictionaryChange,
  onTranslationChange,
}: ReadingAssetsPageProps) {
  const translationProfileOptions: CompactDropdownOption[] = [
    ...(sysInfo?.translationProfiles?.map((profile) => ({
      value: profile.tier,
      label: profile.label,
      meta: `${formatSize(profile.sizeMb)} • ${formatDurationMinutes(profile.estimatedDownloadMinutes)}${profile.installed ? ' • Installed' : ''}`,
      badge: profile.badge,
      badgeTone: 'recommended' as const,
    })) ?? []),
    {
      value: 'skip',
      label: 'Skip OCR translation install',
      meta: 'Install later from settings',
    },
  ]
  const selectedTranslationProfile = sysInfo?.translationProfiles?.find((profile) => profile.tier === selectedTranslationProfileTier)
  const selectedTranslationProfileDescription = selectedTranslationProfileTier === 'skip'
    ? 'You can install OCR translation profiles later from Settings.'
    : selectedTranslationProfile?.description

  return (
    <>
      <div>
        <p style={{ fontWeight: 600, margin: '0 0 0.4rem', fontSize: '0.95rem' }}>Japanese Fonts (optional)</p>
        <p style={{ opacity: 0.7, lineHeight: 1.5, marginBottom: '0.75rem', fontSize: '0.88rem' }}>
          Custom display fonts for a better look. Without them the app uses system fonts
          (e.g. Yu Gothic on Windows), which work fine.
        </p>
        {sysInfo?.fontsInstalled ? (
          <p style={{ color: 'var(--accent)', fontSize: '0.9rem' }}>✓ Fonts are already installed.</p>
        ) : (
          <CheckboxOption
            label={`Download Japanese fonts (~100 MB)  •  ${formatDurationMinutes(sysInfo?.fontsEstimatedDownloadMinutes)}`}
            checked={installFonts}
            onChange={onFontsChange}
          />
        )}
      </div>

      <div style={{ marginTop: '1.5rem', paddingTop: '1.5rem', borderTop: '1px solid rgba(255,255,255,0.08)' }}>
        <p style={{ fontWeight: 600, margin: '0 0 0.4rem', fontSize: '0.95rem' }}>Offline Dictionary (optional)</p>
        <p style={{ opacity: 0.7, lineHeight: 1.5, marginBottom: '0.75rem', fontSize: '0.88rem' }}>
          Lets the Tutor chat look up Japanese↔English word translations without an internet
          connection. Downloaded from the open-source jmdict-simplified project.
        </p>
        {sysInfo?.dictionaryInstalled ? (
          <p style={{ color: 'var(--accent)', fontSize: '0.9rem' }}>✓ Offline dictionary is already installed.</p>
        ) : (
          <CheckboxOption
            label={`Download offline dictionary (~30 MB)  •  ${formatDurationMinutes(sysInfo?.dictionaryEstimatedDownloadMinutes)}`}
            checked={installDictionary}
            onChange={onDictionaryChange}
          />
        )}
      </div>

      <div style={{ marginTop: '1.5rem', paddingTop: '1.5rem', borderTop: '1px solid rgba(255,255,255,0.08)' }}>
        <p style={{ fontWeight: 600, margin: '0 0 0.4rem', fontSize: '0.95rem' }}>OCR Translation Profile (optional)</p>
        <p style={{ opacity: 0.7, lineHeight: 1.5, marginBottom: '0.75rem', fontSize: '0.88rem' }}>
          Installs the OCR translation bundle: OCR Standard + Qwen3.5-0.8B-JP local translation model.
        </p>
        <CompactDropdown
          ariaLabel="OCR translation profile"
          options={translationProfileOptions}
          value={selectedTranslationProfileTier}
          onChange={(value) => onTranslationChange(value as TranslationProfileTier)}
        />
        {selectedTranslationProfileDescription ? (
          <p style={{ opacity: 0.65, fontSize: '0.84rem', lineHeight: 1.45, margin: '0.6rem 0 0' }}>
            {selectedTranslationProfileDescription}
          </p>
        ) : null}
      </div>
    </>
  )
}
