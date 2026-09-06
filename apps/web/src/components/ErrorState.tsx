interface ErrorStateProps {
  message: string;
  onRetry?: () => void;
}

export function ErrorState({ message, onRetry }: ErrorStateProps) {
  return (
    <div className="w-full max-w-sm rounded-2xl bg-tg-secondary-bg p-6 text-center text-tg-text">
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-rose-500/10 text-rose-500">
        <svg
          className="h-6 w-6"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
          />
        </svg>
      </div>

      <h3 className="mt-4 text-base font-semibold text-tg-text">Authentication Error</h3>
      <p className="mt-1 text-xs text-tg-hint">{message}</p>

      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="mt-5 w-full rounded-xl bg-tg-button py-2.5 text-sm font-medium text-tg-button-text active:opacity-80"
        >
          Retry
        </button>
      )}
    </div>
  );
}
