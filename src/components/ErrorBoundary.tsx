import React from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';

interface ErrorBoundaryState {
  hasError: boolean;
  errorMessage: string;
}

export class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  ErrorBoundaryState
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, errorMessage: '' };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return {
      hasError: true,
      errorMessage: error.message || 'An unexpected application error occurred.',
    };
  }

  override componentDidCatch(error: Error, info: React.ErrorInfo): void {
    console.error('NIROG.AI ErrorBoundary caught:', error, info);
  }

  override render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-[#f4f7f7] flex items-center justify-center p-6">
          <div className="max-w-lg w-full bg-white border border-slate-200 rounded-xl p-6 space-y-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-6 h-6 text-amber-700 shrink-0 mt-0.5" />
              <div>
                <h1 className="text-lg font-bold text-[#071e26]">
                  Workspace Data Sync Interrupted
                </h1>
                <p className="text-sm text-slate-600 mt-1">
                  A database or runtime boundary caught an error so your session stays protected.
                </p>
              </div>
            </div>
            <pre className="rounded-lg bg-slate-50 border border-slate-200 p-3 text-xs font-mono text-slate-700 overflow-x-auto max-h-48">
              {this.state.errorMessage}
            </pre>
            <button
              type="button"
              onClick={() => {
                this.setState({ hasError: false, errorMessage: '' });
                window.location.hash = 'home';
              }}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[#03151c] text-white text-xs font-semibold hover:bg-[#072430]"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Return to Home Workspace</span>
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
