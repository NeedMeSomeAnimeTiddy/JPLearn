import type { UseBackgroundReturn } from '../useBackground'
import { clampBackgroundBlur } from '../utils'
import { BACKGROUND_BLUR_MIN, BACKGROUND_BLUR_MAX } from '../constants'

interface BackgroundSettingsTabProps {
  background: UseBackgroundReturn
}

export function BackgroundSettingsTab({ background }: BackgroundSettingsTabProps) {
  const {
    backgroundOptions,
    backgroundPreviewUrls,
    selectedBackgroundOption,
    backgroundBlur,
    customBackgroundDataUrl,
    customBackgroundActionMessage,
    selectBackground,
    setBackgroundBlur,
    openCustomBackgroundPicker,
    clearCustomBackground,
    handleCustomBackgroundFileImport,
    customBackgroundImportInputRef,
  } = background

  return (
    <>
      <p className="settings-section-label">Background</p>
      <div className="settings-background-grid" role="radiogroup" aria-label="Background selection">
        {backgroundOptions.map((bgOption) => {
          const isActive = selectedBackgroundOption.key === bgOption.key
          const customPreview = bgOption.key === 'custom_upload' ? customBackgroundDataUrl : null
          const previewSrc = customPreview ?? backgroundPreviewUrls[bgOption.key]
          const hasPreview = Boolean(previewSrc)
          return (
            <button
              key={bgOption.key}
              type="button"
              className={`settings-icon-entry settings-background-entry ${isActive ? 'is-active' : ''}`}
              onClick={() => {
                if (bgOption.key === 'custom_upload' && !customBackgroundDataUrl) {
                  openCustomBackgroundPicker()
                  return
                }
                selectBackground(bgOption.key)
              }}
              aria-label={`Use ${bgOption.label} background`}
              aria-pressed={isActive}
              title={bgOption.label}
            >
              <span
                className={`settings-background-preview ${hasPreview ? 'is-photo' : 'is-classic'}`}
                aria-hidden="true"
              >
                {previewSrc ? (
                  <img
                    className="settings-background-preview-image"
                    src={previewSrc}
                    alt=""
                    loading="eager"
                    decoding="async"
                  />
                ) : null}
              </span>
              <span className="settings-background-copy">
                <span className="settings-icon-entry-label">{bgOption.label}</span>
                <span className="settings-background-note">{bgOption.note}</span>
              </span>
            </button>
          )
        })}
      </div>

      <div className="settings-inline-action-group" style={{ marginTop: 10 }}>
        <button
          type="button"
          className="settings-inline-button"
          onClick={openCustomBackgroundPicker}
        >
          Choose Image
        </button>
        <button
          type="button"
          className="settings-inline-button"
          onClick={clearCustomBackground}
          disabled={!customBackgroundDataUrl}
        >
          Remove Custom
        </button>
      </div>
      <input
        ref={customBackgroundImportInputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/avif,image/gif,image/bmp"
        className="settings-hidden-file-input"
        onChange={(event) => { void handleCustomBackgroundFileImport(event) }}
      />
      {customBackgroundActionMessage ? (
        <p className="settings-help settings-help-inline">{customBackgroundActionMessage}</p>
      ) : null}

      <div className="settings-background-slider">
        <div className="settings-background-slider-head">
          <span>Blur amount</span>
          <span>{clampBackgroundBlur(backgroundBlur)}px</span>
        </div>
        <input
          type="range"
          min={BACKGROUND_BLUR_MIN}
          max={BACKGROUND_BLUR_MAX}
          step={1}
          className="settings-range"
          value={clampBackgroundBlur(backgroundBlur)}
          onChange={(event) => {
            const nextBlur = Number(event.currentTarget.value)
            setBackgroundBlur(nextBlur)
          }}
          aria-label="Background blur amount"
          disabled={selectedBackgroundOption.key === 'classic_scene'}
        />
        <p className="settings-help">
          Applies to image backgrounds, including your custom upload. Choose No Background to restore the simpler pre-drawing background.
        </p>
      </div>
    </>
  )
}
