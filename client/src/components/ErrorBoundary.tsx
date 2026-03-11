import { cn } from "@/lib/utils";
import { AlertTriangle, RotateCcw, ChevronDown, ChevronUp, Bug, Shield } from "lucide-react";
import { Component, ReactNode } from "react";

/* ── Glass-Panel Error Boundary ─────────────────────────────────────────────
 * Two-tier error boundary:
 *  1. App-level  — wraps the entire app in App.tsx  (fullscreen fallback)
 *  2. Page-level — wraps individual routes inside DashboardLayout (inline)
 *
 * Both use the Amethyst Nexus glass-panel aesthetic so a crash never
 * shows a white screen.
 * ────────────────────────────────────────────────────────────────────────── */

interface Props {
  children: ReactNode;
  /** When true, renders an inline card instead of a fullscreen overlay */
  inline?: boolean;
  /** Optional label shown in the header (e.g., the page name) */
  label?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
  showStack: boolean;
}

class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null, showStack: false };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  handleReload = () => window.location.reload();

  handleRetry = () => this.setState({ hasError: false, error: null, showStack: false });

  toggleStack = () => this.setState((s) => ({ showStack: !s.showStack }));

  render() {
    if (!this.state.hasError) return this.props.children;

    const { inline, label } = this.props;
    const { error, showStack } = this.state;

    /* ── Inline (page-level) variant ─────────────────────────────────── */
    if (inline) {
      return (
        <div className="w-full animate-fade-in">
          <div className="glass-panel p-6 space-y-4">
            {/* Header */}
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-threat-critical/10 border border-threat-critical/20 flex items-center justify-center">
                <Bug className="h-5 w-5 text-threat-critical" />
              </div>
              <div>
                <h3 className="text-sm font-display font-semibold text-foreground">
                  {label ? `${label} crashed` : "Component crashed"}
                </h3>
                <p className="text-xs text-muted-foreground">
                  {error?.message ?? "An unexpected error occurred"}
                </p>
              </div>
            </div>

            {/* Stack trace (collapsible) */}
            {error?.stack && (
              <div>
                <button
                  onClick={this.toggleStack}
                  className="flex items-center gap-1.5 text-[10px] text-muted-foreground hover:text-foreground transition-colors"
                >
                  {showStack ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                  {showStack ? "Hide" : "Show"} stack trace
                </button>
                {showStack && (
                  <pre className="mt-2 p-3 rounded-lg bg-secondary/30 border border-border/20 text-[10px] font-mono text-muted-foreground overflow-auto max-h-48 whitespace-pre-wrap">
                    {error.stack}
                  </pre>
                )}
              </div>
            )}

            {/* Actions */}
            <div className="flex items-center gap-3">
              <button
                onClick={this.handleRetry}
                className={cn(
                  "flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-medium",
                  "bg-primary/20 text-primary border border-primary/30",
                  "hover:bg-primary/30 transition-colors"
                )}
              >
                <RotateCcw className="h-3.5 w-3.5" />
                Retry
              </button>
              <button
                onClick={this.handleReload}
                className="flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-medium text-muted-foreground hover:text-foreground bg-secondary/30 border border-border/20 hover:bg-secondary/50 transition-colors"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                Reload Page
              </button>
            </div>
          </div>
        </div>
      );
    }

    /* ── Fullscreen (app-level) variant ───────────────────────────────── */
    return (
      <div
        className="flex items-center justify-center min-h-screen p-8"
        style={{
          background:
            "linear-gradient(135deg, oklch(0.1 0.035 290) 0%, oklch(0.13 0.028 286) 40%, oklch(0.11 0.02 280) 100%)",
        }}
      >
        <div className="glass-panel p-8 max-w-2xl w-full space-y-6 amethyst-glow">
          {/* Header */}
          <div className="flex flex-col items-center text-center gap-4">
            <div className="h-16 w-16 rounded-2xl bg-threat-critical/10 border border-threat-critical/20 flex items-center justify-center">
              <AlertTriangle className="h-8 w-8 text-threat-critical" />
            </div>
            <div>
              <h2 className="text-lg font-display font-bold text-foreground mb-1">
                Application Error
              </h2>
              <p className="text-sm text-muted-foreground">
                {error?.message ?? "An unexpected error occurred."}
              </p>
            </div>
          </div>

          {/* Stack trace (collapsible) */}
          {error?.stack && (
            <div>
              <button
                onClick={this.toggleStack}
                className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors mb-2"
              >
                {showStack ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                {showStack ? "Hide" : "Show"} stack trace
              </button>
              {showStack && (
                <pre className="p-4 rounded-lg bg-secondary/30 border border-border/20 text-[10px] font-mono text-muted-foreground overflow-auto max-h-64 whitespace-pre-wrap">
                  {error.stack}
                </pre>
              )}
            </div>
          )}

          {/* Security note */}
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-primary/5 border border-primary/10">
            <Shield className="h-4 w-4 text-primary shrink-0" />
            <p className="text-[10px] text-muted-foreground">
              No telemetry data was lost. Wazuh connections are read-only and stateless.
            </p>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-center gap-3">
            <button
              onClick={this.handleReload}
              className={cn(
                "flex items-center gap-2 px-6 py-2.5 rounded-lg text-sm font-medium",
                "bg-primary text-primary-foreground",
                "hover:opacity-90 transition-opacity"
              )}
            >
              <RotateCcw className="h-4 w-4" />
              Reload Application
            </button>
          </div>
        </div>
      </div>
    );
  }
}

export default ErrorBoundary;
