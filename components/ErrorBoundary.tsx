import React from 'react';

interface ErrorBoundaryProps {
  children: React.ReactNode;
  title?: string;
  description?: string;
  onReset?: () => void;
}

interface ErrorBoundaryState {
  hasError: boolean;
}

class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: Error) {
    console.error('ErrorBoundary caught an error:', error);
  }

  handleReset = () => {
    this.setState({ hasError: false });
    this.props.onReset?.();
  };

  render() {
    const { hasError } = this.state;
    const { children, title, description } = this.props;

    if (!hasError) return children;

    return (
      <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4 rounded-2xl border border-slate-200 bg-white px-6 py-10 text-center text-slate-700 shadow-sm dark:border-white/10 dark:bg-dark-card dark:text-slate-200">
        <div className="text-lg font-semibold">{title || 'Something went wrong'}</div>
        <p className="max-w-md text-sm text-slate-500 dark:text-slate-400">
          {description || 'Try refreshing the page or resetting the view.'}
        </p>
        <button
          type="button"
          onClick={this.handleReset}
          className="rounded-xl bg-primary px-4 py-2 text-xs font-semibold text-white shadow-sm transition hover:opacity-90"
        >
          Reset View
        </button>
      </div>
    );
  }
}

export default ErrorBoundary;
