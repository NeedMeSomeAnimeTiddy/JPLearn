import { Component } from 'react'
import type { ErrorInfo, ReactNode } from 'react'
import { AlertTriangle, ArrowLeft, RotateCw } from 'lucide-react'

interface ErrorBoundaryProps {
  children: ReactNode
  fallback?: ReactNode
  /** A way out of a crashed screen that has no chrome of its own: the titlebar is bare everywhere. */
  onBack?: () => void
}

interface ErrorBoundaryState {
  error: Error | null
  hasError: boolean
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props)
    this.state = { error: null, hasError: false }
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error, hasError: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('[ErrorBoundary]', error, info.componentStack)
  }

  handleReset = () => {
    this.setState({ error: null, hasError: false })
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback

      return (
        <div className="error-boundary-fallback" role="alert">
          <div className="error-boundary-card panel-glass">
            <AlertTriangle
              size={32}
              strokeWidth={1.8}
              aria-hidden="true"
              className="error-boundary-icon"
            />
            <h2 className="error-boundary-title">Something went wrong</h2>
            <p className="error-boundary-message">
              {this.state.error?.message ?? 'An unexpected error occurred.'}
            </p>
            <button
              type="button"
              className="error-boundary-retry btn-primary"
              onClick={this.handleReset}
            >
              <RotateCw size={14} strokeWidth={2.2} aria-hidden="true" />
              Try again
            </button>
            {this.props.onBack ? (
              <button
                type="button"
                className="error-boundary-retry error-boundary-back btn-primary"
                onClick={this.props.onBack}
              >
                <ArrowLeft size={14} strokeWidth={2.2} aria-hidden="true" />
                Back
              </button>
            ) : null}
          </div>
        </div>
      )
    }

    return this.props.children
  }
}
