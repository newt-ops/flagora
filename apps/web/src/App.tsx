import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type {
  StartRunResponse,
  FinishRunResponse,
  ChallengeInfoResponse,
} from '@flagora/shared';
import { useProfile } from './hooks/useProfile.js';
import { useStore } from './store/useStore.js';
import { useGameRun } from './hooks/useGameRun.js';
import { useDailyChallenge } from './hooks/useDailyChallenge.js';
import {
  createChallenge,
  getChallengeInfo,
  acceptChallenge,
  rematchChallenge,
} from './api/client.js';
import { shareChallenge } from './components/challengeShareHelpers.js';
import { getChallengeStartParam } from './components/challengeViewHelpers.js';
import { ProfileCard } from './components/ProfileCard.js';
import { GameScreen } from './components/GameScreen.js';
import { ResultsScreen } from './components/ResultsScreen.js';
import { LeaderboardScreen } from './components/LeaderboardScreen.js';
import { ChallengeLandingScreen } from './components/ChallengeLandingScreen.js';
import { HeadToHeadResultScreen } from './components/HeadToHeadResultScreen.js';
import { ErrorState } from './components/ErrorState.js';

export function App() {
  const queryClient = useQueryClient();
  const { profile, isLoading, error, refetch } = useProfile();
  const { sessionToken } = useStore();
  const { startRun, isStarting } = useGameRun();
  const { dailyStatus, startDaily, isStartingDaily } = useDailyChallenge(sessionToken);

  const [screen, setScreen] = useState<
    'profile' | 'playing' | 'results' | 'leaderboard' | 'challenge_landing' | 'head_to_head'
  >('profile');
  const [runMode, setRunMode] = useState<'practice' | 'daily' | 'challenge'>('practice');
  const [activeRole, setActiveRole] = useState<'challenger' | 'opponent' | null>(null);
  const [leaderboardMode, setLeaderboardMode] = useState<'global' | 'daily'>('global');
  const [currentRun, setCurrentRun] = useState<StartRunResponse | null>(null);
  const [lastResult, setLastResult] = useState<FinishRunResponse | null>(null);
  const [activeChallengeId, setActiveChallengeId] = useState<string | null>(null);
  const [activeChallengeInfo, setActiveChallengeInfo] = useState<ChallengeInfoResponse | null>(null);
  const [isStartingChallenge, setIsStartingChallenge] = useState(false);
  const [isAcceptingChallenge, setIsAcceptingChallenge] = useState(false);
  const [isStartingRematch, setIsStartingRematch] = useState(false);
  const [isLoadingChallengeInfo, setIsLoadingChallengeInfo] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);

  useEffect(() => {
    if (!sessionToken || !profile) {
      return;
    }
    const initialChallengeId = getChallengeStartParam();
    if (!initialChallengeId) {
      return;
    }

    let isMounted = true;
    setIsLoadingChallengeInfo(true);
    getChallengeInfo(sessionToken, initialChallengeId)
      .then((info) => {
        if (!isMounted) {
          return;
        }
        setActiveChallengeId(info.challengeId);
        setActiveChallengeInfo(info);
        if (info.status === 'completed') {
          setScreen('head_to_head');
        } else {
          setScreen('challenge_landing');
        }
      })
      .catch((err) => {
        if (!isMounted) {
          return;
        }
        const message = err instanceof Error ? err.message : 'Failed to load challenge';
        setStartError(message);
      })
      .finally(() => {
        if (isMounted) {
          setIsLoadingChallengeInfo(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [sessionToken, profile]);

  const handleStartPractice = async () => {
    if (!sessionToken) {
      return;
    }
    setStartError(null);
    try {
      const run = await startRun(sessionToken);
      setRunMode('practice');
      setCurrentRun(run);
      setScreen('playing');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to start practice run';
      setStartError(message);
    }
  };

  const handleStartDaily = async () => {
    if (!sessionToken) {
      return;
    }
    setStartError(null);
    try {
      const run = await startDaily();
      setRunMode('daily');
      setCurrentRun(run);
      setScreen('playing');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to start daily challenge';
      setStartError(message);
    }
  };

  const handleStartChallenge = async () => {
    if (!sessionToken) {
      return;
    }
    setStartError(null);
    setIsStartingChallenge(true);
    try {
      const response = await createChallenge(sessionToken);
      setActiveChallengeId(response.challengeId);
      setActiveRole('challenger');
      setRunMode('challenge');
      setCurrentRun(response);
      setScreen('playing');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to start challenge';
      setStartError(message);
    } finally {
      setIsStartingChallenge(false);
    }
  };

  const handleAcceptChallenge = async () => {
    if (!sessionToken || !activeChallengeId) {
      return;
    }
    setStartError(null);
    setIsAcceptingChallenge(true);
    try {
      const response = await acceptChallenge(sessionToken, activeChallengeId);
      setActiveRole('opponent');
      setRunMode('challenge');
      setCurrentRun(response);
      setScreen('playing');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to accept challenge';
      setStartError(message);
    } finally {
      setIsAcceptingChallenge(false);
    }
  };

  const handleRematch = async () => {
    if (!sessionToken || !activeChallengeId) {
      return;
    }
    setStartError(null);
    setIsStartingRematch(true);
    try {
      const response = await rematchChallenge(sessionToken, activeChallengeId);
      setActiveChallengeId(response.challengeId);
      setActiveRole('challenger');
      setRunMode('challenge');
      setCurrentRun(response);
      setScreen('playing');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to create rematch';
      setStartError(message);
    } finally {
      setIsStartingRematch(false);
    }
  };

  const handleShareChallenge = () => {
    if (!activeChallengeId || !lastResult) {
      return;
    }
    shareChallenge(activeChallengeId, lastResult.totalScore);
  };

  const handleFinishGame = async (result: FinishRunResponse) => {
    setLastResult(result);
    void queryClient.invalidateQueries({ queryKey: ['profile'] });
    void queryClient.invalidateQueries({ queryKey: ['leaderboard'] });
    void queryClient.invalidateQueries({ queryKey: ['daily', 'status'] });

    if (runMode === 'challenge' && activeChallengeId && activeRole === 'opponent' && sessionToken) {
      try {
        const updatedInfo = await getChallengeInfo(sessionToken, activeChallengeId);
        setActiveChallengeInfo(updatedInfo);
        setScreen('head_to_head');
        return;
      } catch {
        void 0;
      }
    }

    setScreen('results');
  };

  const handleBackToProfile = () => {
    setScreen('profile');
    setCurrentRun(null);
    setLastResult(null);
    setStartError(null);
    setActiveChallengeId(null);
    setActiveChallengeInfo(null);
    setActiveRole(null);
  };

  const handleOpenGlobalLeaderboard = () => {
    setLeaderboardMode('global');
    setScreen('leaderboard');
  };

  const handleOpenDailyLeaderboard = () => {
    setLeaderboardMode('daily');
    setScreen('leaderboard');
  };

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-tg-bg px-4 py-8">
      {isLoading && (
        <div className="flex flex-col items-center gap-3 text-center">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-tg-button border-t-transparent" />
          <p className="text-xs font-medium text-tg-hint">Connecting to Flagora...</p>
        </div>
      )}

      {isLoadingChallengeInfo && (
        <div className="flex flex-col items-center gap-3 text-center">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-indigo-500 border-t-transparent" />
          <p className="text-xs font-medium text-tg-hint">Loading challenge...</p>
        </div>
      )}

      {!isLoading && error && <ErrorState message={error} onRetry={refetch} />}

      {!isLoading && !error && startError && (
        <div className="mb-4">
          <ErrorState
            message={startError}
            onRetry={
              runMode === 'daily'
                ? handleStartDaily
                : runMode === 'challenge'
                ? handleStartChallenge
                : handleStartPractice
            }
          />
        </div>
      )}

      {!isLoading && !isLoadingChallengeInfo && !error && screen === 'profile' && profile && (
        <ProfileCard
          profile={profile}
          dailyStatus={dailyStatus}
          onPlay={handleStartPractice}
          onStartDaily={handleStartDaily}
          onChallengeFriend={handleStartChallenge}
          onViewLeaderboard={handleOpenGlobalLeaderboard}
          onViewDailyLeaderboard={handleOpenDailyLeaderboard}
          isStarting={isStarting}
          isStartingDaily={isStartingDaily}
          isStartingChallenge={isStartingChallenge}
        />
      )}

      {!isLoading && !isLoadingChallengeInfo && !error && screen === 'challenge_landing' && activeChallengeInfo && (
        <ChallengeLandingScreen
          challengeInfo={activeChallengeInfo}
          onAccept={handleAcceptChallenge}
          onDismiss={handleBackToProfile}
          onShareChallenge={handleShareChallenge}
          isAccepting={isAcceptingChallenge}
        />
      )}

      {!isLoading && !isLoadingChallengeInfo && !error && screen === 'head_to_head' && activeChallengeInfo && profile && (
        <HeadToHeadResultScreen
          challengeInfo={activeChallengeInfo}
          currentUserId={profile.telegramUserId}
          onRematch={handleRematch}
          onBackToProfile={handleBackToProfile}
          isStartingRematch={isStartingRematch}
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
          mode={runMode}
          onPlayAgain={handleStartPractice}
          onBackToProfile={handleBackToProfile}
          onViewLeaderboard={
            runMode === 'daily' ? handleOpenDailyLeaderboard : handleOpenGlobalLeaderboard
          }
          onShareChallenge={handleShareChallenge}
          isStartingAgain={isStarting}
        />
      )}

      {!isLoading && !error && screen === 'leaderboard' && profile && sessionToken && (
        <LeaderboardScreen
          sessionToken={sessionToken}
          currentUserId={profile.telegramUserId}
          initialMode={leaderboardMode}
          onBack={() => setScreen('profile')}
          onPlay={handleStartPractice}
          onPlayDaily={handleStartDaily}
          isStarting={isStarting || isStartingDaily}
          dailyAttempted={Boolean(dailyStatus?.attempted)}
        />
      )}
    </main>
  );
}
