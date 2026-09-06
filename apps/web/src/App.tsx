import { useState } from 'react';
import type { StartRunResponse, FinishRunResponse } from '@flagora/shared';
import { useProfile } from './hooks/useProfile.js';
import { useStore } from './store/useStore.js';
import { useGameRun } from './hooks/useGameRun.js';
import { ProfileCard } from './components/ProfileCard.js';
import { GameScreen } from './components/GameScreen.js';
import { ResultsScreen } from './components/ResultsScreen.js';
import { ErrorState } from './components/ErrorState.js';

export function App() {
  const { profile, isLoading, error, refetch } = useProfile();
  const { sessionToken } = useStore();
  const { startRun, isStarting } = useGameRun();

  const [screen, setScreen] = useState<'profile' | 'playing' | 'results'>('profile');
  const [currentRun, setCurrentRun] = useState<StartRunResponse | null>(null);
  const [lastResult, setLastResult] = useState<FinishRunResponse | null>(null);
  const [startError, setStartError] = useState<string | null>(null);

  const handleStartGame = async () => {
    if (!sessionToken) {
      return;
    }
    setStartError(null);
    try {
      const run = await startRun(sessionToken);
      setCurrentRun(run);
      setScreen('playing');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to start game';
      setStartError(message);
    }
  };

  const handleFinishGame = (result: FinishRunResponse) => {
    setLastResult(result);
    setScreen('results');
  };

  const handleBackToProfile = () => {
    setScreen('profile');
    setCurrentRun(null);
    setLastResult(null);
    setStartError(null);
  };

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-tg-bg px-4 py-8">
      {isLoading && (
        <div className="flex flex-col items-center gap-3 text-center">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-tg-button border-t-transparent" />
          <p className="text-xs font-medium text-tg-hint">Connecting to Flagora...</p>
        </div>
      )}

      {!isLoading && error && <ErrorState message={error} onRetry={refetch} />}

      {!isLoading && !error && startError && (
        <div className="mb-4">
          <ErrorState message={startError} onRetry={handleStartGame} />
        </div>
      )}

      {!isLoading && !error && screen === 'profile' && profile && (
        <ProfileCard
          profile={profile}
          onPlay={handleStartGame}
          isStarting={isStarting}
        />
      )}

      {!isLoading && !error && screen === 'playing' && currentRun && sessionToken && (
        <GameScreen
          run={currentRun}
          sessionToken={sessionToken}
          onFinish={handleFinishGame}
        />
      )}

      {!isLoading && !error && screen === 'results' && lastResult && (
        <ResultsScreen
          result={lastResult}
          onPlayAgain={handleStartGame}
          onBackToProfile={handleBackToProfile}
          isStartingAgain={isStarting}
        />
      )}
    </main>
  );
}
