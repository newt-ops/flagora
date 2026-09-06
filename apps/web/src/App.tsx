import { useProfile } from './hooks/useProfile.js';
import { ProfileCard } from './components/ProfileCard.js';
import { ErrorState } from './components/ErrorState.js';

export function App() {
  const { profile, isLoading, error, refetch } = useProfile();

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-tg-bg px-4 py-8">
      {isLoading && (
        <div className="flex flex-col items-center gap-3 text-center">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-tg-button border-t-transparent" />
          <p className="text-xs font-medium text-tg-hint">Connecting to Flagora...</p>
        </div>
      )}

      {!isLoading && error && <ErrorState message={error} onRetry={refetch} />}

      {!isLoading && !error && profile && <ProfileCard profile={profile} />}
    </main>
  );
}
