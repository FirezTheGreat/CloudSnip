import { Component, type ReactNode, type ErrorInfo } from "react";

interface Props {
  children: ReactNode;
  /** Optional label shown in the fallback card header */
  label?: string;
}

interface State {
  error: Error | null;
}

/**
 * PanelErrorBoundary — wraps any dashboard panel.
 * If it throws, renders a calm "failed to load" card instead of
 * crashing the whole dashboard.
 */
export class PanelErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(`[PanelError] ${this.props.label ?? "Panel"} threw:`, error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="flex flex-col items-center justify-center gap-2 py-8 px-4 text-center">
          <div className="w-8 h-8 rounded-full bg-red-50 border border-red-200 flex items-center justify-center">
            <svg className="w-4 h-4 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M12 3a9 9 0 100 18A9 9 0 0012 3z" />
            </svg>
          </div>
          <p className="text-xs font-semibold text-red-600">
            {this.props.label ?? "Panel"} failed to load
          </p>
          <p className="text-[10px] text-slate-600 font-mono max-w-[200px] break-words">
            {this.state.error.message}
          </p>
          <button
            className="mt-1 px-3 py-1 text-[10px] font-semibold text-slate-600 hover:text-slate-800 border border-border rounded-lg transition-colors cursor-pointer"
            onClick={() => this.setState({ error: null })}
          >
            Retry
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
