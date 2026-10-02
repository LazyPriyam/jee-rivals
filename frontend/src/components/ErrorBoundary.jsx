import React from 'react';
import { AlertCircle, RotateCcw, Home } from 'lucide-react';

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('ErrorBoundary caught an unhandled error:', error, errorInfo);
    this.setState({ errorInfo });
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
    if (this.props.onReset) {
      this.props.onReset();
    } else {
      window.location.reload();
    }
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-[500px] flex items-center justify-center p-6 text-center">
          <div className="max-w-lg w-full bg-[#262c3c] border border-red-500/30 rounded-3xl p-8 shadow-2xl">
            <div className="w-14 h-14 rounded-2xl bg-red-950/60 border border-red-500/40 text-red-400 flex items-center justify-center mx-auto mb-4">
              <AlertCircle className="w-7 h-7" />
            </div>
            <h2 className="text-xl font-black text-white mb-2">View Render Error Encountered</h2>
            <p className="text-xs text-slate-400 mb-6 leading-relaxed">
              An unexpected error prevented this section from rendering properly. You can recover immediately by refreshing or switching back to the arena.
            </p>

            {this.state.error && (
              <div className="p-3 rounded-xl bg-[#1e2433] border border-red-500/20 text-left font-mono text-[11px] text-red-300 mb-6 overflow-x-auto max-h-32">
                {this.state.error.toString()}
              </div>
            )}

            <div className="flex items-center justify-center gap-3">
              <button
                type="button"
                onClick={() => {
                  this.setState({ hasError: false, error: null, errorInfo: null });
                  if (this.props.onNavigateArena) {
                    this.props.onNavigateArena();
                  } else {
                    window.location.href = '/';
                  }
                }}
                className="px-4 py-2.5 rounded-xl bg-[#1e2433] hover:bg-[#2d354a] border border-white/10 text-xs font-bold text-white transition cursor-pointer flex items-center gap-2"
              >
                <Home className="w-4 h-4 text-orange-400" />
                <span>Return to Arena</span>
              </button>

              <button
                type="button"
                onClick={this.handleReset}
                className="px-5 py-2.5 rounded-xl bg-orange-500 hover:bg-orange-600 text-xs font-black text-white transition cursor-pointer flex items-center gap-2 shadow-lg shadow-orange-950/50"
              >
                <RotateCcw className="w-4 h-4" />
                <span>Reload View</span>
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
