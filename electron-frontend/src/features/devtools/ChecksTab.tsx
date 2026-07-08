import { CheckCircle2, XCircle, Loader2, Play } from 'lucide-react'
import type { CheckResult } from './types'

const CHECKS = [
  { key: 'arch', label: 'Architecture Check' },
  { key: 'db', label: 'DB Schema Check' },
  { key: 'srs', label: 'SRS Integrity Check' },
]

interface ChecksTabProps {
  checkResults: Record<string, CheckResult>
  loading: Record<string, boolean>
  error: Record<string, string | null>
  onRunCheck: (name: string) => void
}

export function ChecksTab({ checkResults, loading, error, onRunCheck }: ChecksTabProps) {
  return (
    <div className="devtools-tab-content">
      <p className="devtools-help">Run validation checks against the project. Each check runs as a separate subprocess.</p>
      <div className="devtools-checks-grid">
        {CHECKS.map(({ key, label }) => {
          const result = checkResults[key]
          const isLoading = loading[`check_${key}`]
          const checkError = error[`check_${key}`]

          return (
            <div key={key} className="devtools-check-card">
              <div className="devtools-check-header">
                <h4>{label}</h4>
                <button
                  type="button"
                  className="devtools-run-btn"
                  onClick={() => onRunCheck(key)}
                  disabled={isLoading}
                >
                  {isLoading ? (
                    <Loader2 size={14} className="spin-icon" />
                  ) : (
                    <Play size={14} />
                  )}
                  {isLoading ? 'Running...' : 'Run'}
                </button>
              </div>

              {result ? (
                <div className="devtools-check-result">
                  <div className="devtools-check-status">
                    {result.passed ? (
                      <CheckCircle2 size={16} className="devtools-text-ok" />
                    ) : (
                      <XCircle size={16} className="devtools-text-err" />
                    )}
                    <span className={result.passed ? 'devtools-text-ok' : 'devtools-text-err'}>
                      {result.passed ? 'Passed' : 'Failed'}
                    </span>
                    <span className="devtools-text-dim">(exit {result.exitCode})</span>
                  </div>
                  {result.output && (
                    <pre className="devtools-output-block">{result.output}</pre>
                  )}
                  {result.error && (
                    <p className="devtools-text-err">Error: {result.error}</p>
                  )}
                </div>
              ) : checkError ? (
                <p className="devtools-text-err">Error: {checkError}</p>
              ) : null}

              {!result && !checkError && !isLoading && (
                <p className="devtools-text-dim">Not yet run.</p>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
