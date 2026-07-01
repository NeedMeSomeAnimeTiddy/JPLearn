import { useCallback, useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'

// ── Types ─────────────────────────────────────────────────────────────────────

interface ModelOption {
  tier: 'low' | 'high' | 'ultra'
  filename: string
  sizeMb: number
  label: string
  description: string
  installed: boolean
}

interface SystemInfo {
  totalRamGb: number
  recommendedTier: 'low' | 'high'
  models: ModelOption[]
  voicevoxInstalled: boolean
  fontsInstalled: boolean
  isPackaged: boolean
}

interface ProgressEvent {
  id: 'model' | 'voicevox' | 'fonts'
  percent: number
  mb: number | null
  totalMb: number | null
  etaSec: number | null
  filesDone?: number | null
  filesTotal?: number | null
}

interface Props {
  onComplete: () => void
}

type ModelTier = 'low' | 'high' | 'ultra' | 'skip'

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatEta(sec: number | null): string {
  if (sec === null || sec <= 0) return ''
  if (sec < 60) return `~${sec}s remaining`
  const m = Math.round(sec / 60)
  return `~${m} min remaining`
}

function formatSize(mb: number): string {
  if (mb >= 1000) return `${(mb / 1000).toFixed(1)} GB`
  return `${mb} MB`
}

// ── Component ─────────────────────────────────────────────────────────────────

export function SetupWizard({ onComplete }: Props) {
  const [page, setPage] = useState<Page>(1)
  const [sysInfo, setSysInfo] = useState<SystemInfo | null>(null)
  const [selectedTier, setSelectedTier] = useState<ModelTier | null>(null)
  const [installVoicevox, setInstallVoicevox] = useState(true)
  const [modelProgress, setModelProgress] = useState(0)
  const [voicevoxProgress, setVoicevoxProgress] = useState(0)
  const [modelMb, setModelMb] = useState<{ done: number; total: number } | null>(null)
  const [voicevoxMb, setVoicevoxMb] = useState<number | null>(null)
  const [modelEta, setModelEta] = useState<number | null>(null)
  const [installFonts, setInstallFonts] = useState(true)
  const [fontsProgress, setFontsProgress] = useState(0)
  const [fontsFiles, setFontsFiles] = useState<{ done: number; total: number } | null>(null)
  const [createDesktop, setCreateDesktop] = useState(true)
  const [createStartMenu, setCreateStartMenu] = useState(true)
  const [downloadError, setDownloadError] = useState<string | null>(null)
  const [downloadDone, setDownloadDone] = useState(false)
  const unsubRef = useRef<(() => void) | null>(null)

  // Fetch system info when we land on page 2
  useEffect(() => {
    if (page !== 2 || sysInfo) return
    window.jplearnDesktop.getSetupSystemInfo?.().then((info: SystemInfo) => {
      setSysInfo(info)
      setSelectedTier(info.recommendedTier)
      if (info.voicevoxInstalled) setInstallVoicevox(false)
      if (info.fontsInstalled) setInstallFonts(false)
    }).catch(() => {
      setSysInfo({ totalRamGb: 0, recommendedTier: 'low', models: [], voicevoxInstalled: false, fontsInstalled: false, isPackaged: false })
      setSelectedTier('low')
    })
  }, [page, sysInfo])

  // Subscribe to download progress events
  useEffect(() => {
    const api = window.jplearnDesktop
    if (!api?.onSetupProgress) return
    const unsub = api.onSetupProgress((evt: ProgressEvent) => {
      if (evt.id === 'model') {
        setModelProgress(evt.percent)
        if (evt.mb !== null && evt.totalMb !== null) {
          setModelMb({ done: evt.mb, total: evt.totalMb })
        }
        setModelEta(evt.etaSec)
      } else if (evt.id === 'voicevox') {
        setVoicevoxProgress(evt.percent)
        if (evt.totalMb !== null) setVoicevoxMb(evt.totalMb)
      } else if (evt.id === 'fonts') {
        setFontsProgress(evt.percent)
        if (evt.filesDone !== null && evt.filesDone !== undefined && evt.filesTotal !== null && evt.filesTotal !== undefined) {
          setFontsFiles({ done: evt.filesDone, total: evt.filesTotal })
        }
      }
    })
    unsubRef.current = unsub
    return () => unsub()
  }, [])

  const startDownloads = useCallback(async () => {
    setDownloadError(null)
    setPage(6)

    const api = window.jplearnDesktop
    try {
      if (selectedTier && selectedTier !== 'skip') {
        await api.downloadModel?.(selectedTier)
      }
      if (installVoicevox) {
        await api.downloadVoicevox?.()
      }
      if (installFonts && !sysInfo?.fontsInstalled) {
        await api.downloadFonts?.()
      }
      await api.createShortcuts?.({ desktop: createDesktop, startMenu: createStartMenu })
      await api.completeSetup?.()
      setDownloadDone(true)
      setPage(7)
    } catch (err) {
      setDownloadError(err instanceof Error ? err.message : String(err))
    }
  }, [selectedTier, installVoicevox])

  const handleFinish = useCallback(async () => {
    if (!downloadDone) {
      await window.jplearnDesktop.skipSetup?.()
    }
    onComplete()
  }, [downloadDone, onComplete])

  // ── Render helpers ─────────────────────────────────────────────────────────

  function ProgressBar({ value, label }: { value: number; label: string }) {
    return (
      <div style={{ marginBottom: '1rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.3rem', fontSize: '0.85rem', opacity: 0.8 }}>
          <span>{label}</span>
          <span>{value}%</span>
        </div>
        <div style={{ height: '8px', borderRadius: '4px', background: 'rgba(255,255,255,0.12)', overflow: 'hidden' }}>
          <div style={{
            height: '100%',
            borderRadius: '4px',
            background: 'var(--accent, #7eb8ea)',
            width: `${value}%`,
            transition: 'width 0.3s ease',
          }} />
        </div>
      </div>
    )
  }

  // ── Page renders ───────────────────────────────────────────────────────────

  type Page = 1 | 2 | 3 | 4 | 5 | 6 | 7
  const pages: Record<Page, ReactNode> = {
    1: (
      <PageLayout
        title="Welcome to JPLearn"
        subtitle="Let's get everything set up in a few steps."
        onNext={() => setPage(2)}
        onSkip={() => handleFinish()}
        nextLabel="Get Started"
        skipLabel="Skip setup"
      >
        <p style={{ opacity: 0.75, lineHeight: 1.6 }}>
          JPLearn is a desktop Japanese learning app with spaced-repetition flashcards, game-like
          practice modes, and an optional AI tutor that runs privately on your device.
        </p>
        <p style={{ opacity: 0.75, lineHeight: 1.6, marginTop: '0.75rem' }}>
          This wizard will help you download the AI tutor model and Japanese voice engine.
          Both are optional — the core learning features work without them.
        </p>
      </PageLayout>
    ),

    2: (
      <PageLayout
        title="System Check"
        subtitle="Checking your hardware to recommend the best settings."
        onNext={() => setPage(3)}
        onBack={() => setPage(1)}
        nextLabel="Continue"
        nextDisabled={!sysInfo}
      >
        {!sysInfo ? (
          <p style={{ opacity: 0.6 }}>Detecting system…</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <InfoRow label="RAM" value={`${sysInfo.totalRamGb.toFixed(1)} GB`} />
            <InfoRow
              label="Recommended model"
              value={sysInfo.models.find(m => m.tier === sysInfo.recommendedTier)?.label ?? '—'}
              highlight
            />
          </div>
        )}
      </PageLayout>
    ),

    3: (
      <PageLayout
        title="AI Tutor (optional)"
        subtitle="Select a model or skip — you can always add one later."
        onNext={() => setPage(4)}
        onBack={() => setPage(2)}
        nextLabel="Continue"
      >
        <p style={{ opacity: 0.75, lineHeight: 1.6, marginBottom: '1rem' }}>
          JPLearn includes an AI tutor you can chat with about Japanese grammar, vocabulary, and
          pronunciation — running privately on your device, no internet required once set up.
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {sysInfo?.models.map(m => (
            <RadioOption
              key={m.tier}
              label={`${m.label}  (${formatSize(m.sizeMb)})`}
              sublabel={m.installed ? '✓ Already installed' : m.description}
              checked={selectedTier === m.tier}
              onChange={() => setSelectedTier(m.tier)}
              warning={m.tier === 'ultra' ? '⚠ Large download. May take 15–30 min on slower connections.' : undefined}
            />
          ))}
          <RadioOption
            label="Skip — I don't want the AI tutor"
            sublabel="You can install it later by running: python scripts/get_gguf_model.py"
            checked={selectedTier === 'skip'}
            onChange={() => setSelectedTier('skip')}
          />
        </div>
      </PageLayout>
    ),

    4: (
      <PageLayout
        title="Japanese Voice (optional)"
        subtitle="Hear vocabulary and kanji read aloud with natural pronunciation."
        onNext={() => setPage(5)}
        onBack={() => setPage(3)}
        nextLabel="Continue"
      >
        <p style={{ opacity: 0.75, lineHeight: 1.6, marginBottom: '1rem' }}>
          VOICEVOX is a local text-to-speech engine that powers the voice button in study sessions —
          useful for hearing correct readings of new words. It runs entirely on your device.
        </p>
        {sysInfo?.voicevoxInstalled ? (
          <p style={{ color: 'var(--accent, #7eb8ea)' }}>✓ VOICEVOX is already installed.</p>
        ) : (
          <CheckboxOption
            label="Install Japanese voice synthesis (~1 GB)"
            checked={installVoicevox}
            onChange={setInstallVoicevox}
          />
        )}
        {!installVoicevox && !sysInfo?.voicevoxInstalled && (
          <p style={{ opacity: 0.55, fontSize: '0.85rem', marginTop: '0.75rem' }}>
            Voice playback will be unavailable. Install later: <code>python scripts/get_voicevox.py</code>
          </p>
        )}

        {/* ── Japanese Fonts ── */}
        <div style={{ marginTop: '1.5rem', paddingTop: '1.5rem', borderTop: '1px solid rgba(255,255,255,0.08)' }}>
          <p style={{ fontWeight: 600, margin: '0 0 0.4rem', fontSize: '0.95rem' }}>Japanese Fonts (optional)</p>
          <p style={{ opacity: 0.7, lineHeight: 1.5, marginBottom: '0.75rem', fontSize: '0.88rem' }}>
            Custom display fonts for a better look. Without them the app uses system fonts
            (e.g. Yu Gothic on Windows), which work fine.
          </p>
          {sysInfo?.fontsInstalled ? (
            <p style={{ color: 'var(--accent, #7eb8ea)', fontSize: '0.9rem' }}>✓ Fonts are already installed.</p>
          ) : (
            <CheckboxOption
              label="Download Japanese fonts (~100 MB)"
              checked={installFonts}
              onChange={setInstallFonts}
            />
          )}
        </div>
      </PageLayout>
    ),

    5: (() => {
      const needsModel = selectedTier && selectedTier !== 'skip' && !sysInfo?.models.find(m => m.tier === selectedTier)?.installed
      const needsVoice = installVoicevox && !sysInfo?.voicevoxInstalled
      const needsFonts = installFonts && !sysInfo?.fontsInstalled
      const modelInfo = sysInfo?.models.find(m => m.tier === selectedTier)
      return (
        <PageLayout
          title="Ready to download"
          subtitle="Review what will be downloaded, then click Start Setup."
          onNext={startDownloads}
          onBack={() => setPage(4)}
          nextLabel={needsModel || needsVoice || needsFonts ? 'Start Setup' : 'Finish'}
        >
          {needsModel && modelInfo && (
            <SummaryRow label="AI Tutor model" detail={`${modelInfo.label} — ${formatSize(modelInfo.sizeMb)}`} />
          )}
          {needsVoice && (
            <SummaryRow label="Japanese voice (VOICEVOX)" detail="~1 GB" />
          )}
          {needsFonts && (
            <SummaryRow label="Japanese fonts" detail="~100 MB" />
          )}
          {!needsModel && !needsVoice && !needsFonts && (
            <p style={{ opacity: 0.7 }}>Nothing to download — all selected components are already installed.</p>
          )}
          {sysInfo?.isPackaged && (
            <div style={{ marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid rgba(255,255,255,0.08)' }}>
              <p style={{ fontWeight: 600, margin: '0 0 0.5rem', fontSize: '0.9rem' }}>Shortcuts</p>
              <CheckboxOption label="Create desktop shortcut" checked={createDesktop} onChange={setCreateDesktop} />
              <div style={{ marginTop: '0.4rem' }}>
                <CheckboxOption label="Add to Start Menu" checked={createStartMenu} onChange={setCreateStartMenu} />
              </div>
            </div>
          )}
          <p style={{ opacity: 0.55, fontSize: '0.85rem', marginTop: '1.25rem', lineHeight: 1.5 }}>
            ℹ Your downloads and progress are saved to <strong>Documents\JPLearn\</strong> — they will
            NOT be deleted if you uninstall or reinstall JPLearn.
          </p>
        </PageLayout>
      )
    })(),

    6: (
      <PageLayout title="Setting up…" subtitle="Please wait while files are downloaded." hideNav>
        {selectedTier && selectedTier !== 'skip' && (
          <>
            <ProgressBar
              value={modelProgress}
              label={`AI Tutor model${modelMb ? ` (${modelMb.done} / ${modelMb.total} MB)` : ''}`}
            />
            {modelEta !== null && modelProgress > 0 && modelProgress < 100 && (
              <p style={{ fontSize: '0.8rem', opacity: 0.6, marginTop: '-0.5rem', marginBottom: '0.75rem' }}>
                {formatEta(modelEta)}
              </p>
            )}
          </>
        )}
        {installVoicevox && !sysInfo?.voicevoxInstalled && (
          <ProgressBar
            value={voicevoxProgress}
            label={`Japanese voice${voicevoxMb ? ` (/ ${voicevoxMb} MB)` : ''}`}
          />
        )}
        {installFonts && !sysInfo?.fontsInstalled && (
          <>
            <ProgressBar value={fontsProgress} label="Japanese fonts" />
            {fontsFiles && fontsProgress > 0 && fontsProgress < 100 && (
              <p style={{ fontSize: '0.8rem', opacity: 0.6, marginTop: '-0.5rem', marginBottom: '0.75rem' }}>
                Downloading files {fontsFiles.done}/{fontsFiles.total}
              </p>
            )}
          </>
        )}
        {downloadError && (
          <p style={{ color: '#ff7b7b', marginTop: '1rem', lineHeight: 1.5 }}>
            Download error: {downloadError}
            <br />
            <button
              type="button"
              onClick={() => { setDownloadError(null); void startDownloads() }}
              style={btnStyle('secondary')}
            >
              Retry
            </button>
          </p>
        )}
      </PageLayout>
    ),

    7: (
      <PageLayout
        title="Setup complete"
        subtitle="Everything is ready. Enjoy learning Japanese!"
        onNext={handleFinish}
        nextLabel="Launch JPLearn"
        hideBack
      >
        <p style={{ opacity: 0.75, lineHeight: 1.6 }}>
          Your AI tutor and voice engine are installed. You can adjust settings at any time from the
          app&apos;s Settings panel.
        </p>
      </PageLayout>
    ),
  }

  return (
    <div style={overlayStyle}>
      <div style={cardStyle}>
        <StepDots total={7} current={page} />
        {pages[page]}
      </div>
    </div>
  )
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function PageLayout({
  title,
  subtitle,
  children,
  onNext,
  onBack,
  onSkip,
  nextLabel = 'Next',
  skipLabel,
  nextDisabled = false,
  hideNav = false,
  hideBack = false,
}: {
  title: string
  subtitle?: string
  children?: React.ReactNode
  onNext?: () => void
  onBack?: () => void
  onSkip?: () => void
  nextLabel?: string
  skipLabel?: string
  nextDisabled?: boolean
  hideNav?: boolean
  hideBack?: boolean
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <div>
        <h1 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 700 }}>{title}</h1>
        {subtitle && <p style={{ margin: '0.4rem 0 0', opacity: 0.65, fontSize: '0.95rem' }}>{subtitle}</p>}
      </div>
      <div style={{ flex: 1 }}>{children}</div>
      {!hideNav && (
        <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', alignItems: 'center', marginTop: '0.5rem' }}>
          {skipLabel && onSkip && (
            <button type="button" onClick={onSkip} style={btnStyle('ghost')}>{skipLabel}</button>
          )}
          {!hideBack && onBack && (
            <button type="button" onClick={onBack} style={btnStyle('secondary')}>Back</button>
          )}
          {onNext && (
            <button type="button" onClick={onNext} disabled={nextDisabled} style={btnStyle('primary', nextDisabled)}>
              {nextLabel}
            </button>
          )}
        </div>
      )}
    </div>
  )
}

function RadioOption({ label, sublabel, checked, onChange, warning }: {
  label: string; sublabel?: string; checked: boolean; onChange: () => void; warning?: string
}) {
  return (
    <label style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-start', cursor: 'pointer', padding: '0.65rem 0.75rem', borderRadius: '8px', background: checked ? 'rgba(255,255,255,0.06)' : 'transparent', border: `1px solid ${checked ? 'rgba(255,255,255,0.18)' : 'transparent'}`, transition: 'background 0.15s' }}>
      <input type="radio" checked={checked} onChange={onChange} style={{ marginTop: '0.15rem', accentColor: 'var(--accent, #7eb8ea)', flexShrink: 0 }} />
      <div>
        <div style={{ fontWeight: 500 }}>{label}</div>
        {sublabel && <div style={{ fontSize: '0.82rem', opacity: 0.6, marginTop: '0.15rem' }}>{sublabel}</div>}
        {warning && checked && <div style={{ fontSize: '0.82rem', color: '#ffc107', marginTop: '0.25rem' }}>{warning}</div>}
      </div>
    </label>
  )
}

function CheckboxOption({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', cursor: 'pointer', padding: '0.65rem 0.75rem', borderRadius: '8px', background: checked ? 'rgba(255,255,255,0.06)' : 'transparent', border: `1px solid ${checked ? 'rgba(255,255,255,0.18)' : 'transparent'}` }}>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} style={{ accentColor: 'var(--accent, #7eb8ea)', width: '1rem', height: '1rem', flexShrink: 0 }} />
      <span style={{ fontWeight: 500 }}>{label}</span>
    </label>
  )
}

function InfoRow({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.5rem 0.75rem', borderRadius: '6px', background: 'rgba(255,255,255,0.05)' }}>
      <span style={{ opacity: 0.7 }}>{label}</span>
      <span style={{ fontWeight: 600, color: highlight ? 'var(--accent, #7eb8ea)' : undefined }}>{value}</span>
    </div>
  )
}

function SummaryRow({ label, detail }: { label: string; detail: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.6rem 0.75rem', borderRadius: '6px', background: 'rgba(255,255,255,0.05)', marginBottom: '0.4rem' }}>
      <span>{label}</span>
      <span style={{ opacity: 0.65, fontSize: '0.9rem' }}>{detail}</span>
    </div>
  )
}

function StepDots({ total, current }: { total: number; current: number }) {
  return (
    <div style={{ display: 'flex', gap: '6px', justifyContent: 'center', marginBottom: '1.5rem' }}>
      {Array.from({ length: total }, (_, i) => (
        <div
          key={i}
          style={{
            width: i + 1 === current ? '20px' : '8px',
            height: '8px',
            borderRadius: '4px',
            background: i + 1 === current ? 'var(--accent, #7eb8ea)' : 'rgba(255,255,255,0.25)',
            transition: 'width 0.25s, background 0.25s',
          }}
        />
      ))}
    </div>
  )
}

// ── Styles ─────────────────────────────────────────────────────────────────────

const overlayStyle: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  background: 'rgba(10, 14, 20, 0.97)',
  zIndex: 9999,
}

const cardStyle: React.CSSProperties = {
  width: '100%',
  maxWidth: '520px',
  padding: '2rem',
  borderRadius: '14px',
  background: 'rgba(25, 35, 48, 0.98)',
  border: '1px solid rgba(255,255,255,0.1)',
  boxShadow: '0 24px 64px rgba(0,0,0,0.5)',
  color: '#e8f0fa',
  fontFamily: 'inherit',
}

function btnStyle(variant: 'primary' | 'secondary' | 'ghost', disabled = false): React.CSSProperties {
  const base: React.CSSProperties = {
    padding: '0.5rem 1.25rem',
    borderRadius: '7px',
    fontSize: '0.9rem',
    fontWeight: 600,
    cursor: disabled ? 'not-allowed' : 'pointer',
    border: 'none',
    transition: 'opacity 0.15s',
    opacity: disabled ? 0.45 : 1,
  }
  if (variant === 'primary') return { ...base, background: 'var(--accent, #7eb8ea)', color: '#0b1620' }
  if (variant === 'secondary') return { ...base, background: 'rgba(255,255,255,0.1)', color: '#e8f0fa' }
  return { ...base, background: 'transparent', color: 'rgba(255,255,255,0.5)', padding: '0.5rem 0.75rem' }
}
