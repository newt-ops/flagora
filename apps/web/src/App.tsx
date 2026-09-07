import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type {
  StartRunResponse,
  FinishRunResponse,
  ChallengeInfoResponse,
  BattleInfoResponse,
  BattleStartPayload,
  BattleFinishedPayload,
} from '@flagora/shared';
import { useProfile } from './hooks/useProfile.js';
import { useStore } from './store/useStore.js';
import { useGameRun } from './hooks/useGameRun.js';
import { useDailyChallenge } from './hooks/useDailyChallenge.js';
import { useBattleSocket } from './hooks/useBattleSocket.js';
import {
  createChallenge,
  getChallengeInfo,
  acceptChallenge,
  rematchChallenge,
  createBattle,
  getBattleInfo,
  joinBattle,
} from './api/client.js';
import { shareChallenge } from './components/challengeShareHelpers.js';
import { getChallengeStartParam } from './components/challengeViewHelpers.js';
import { getBattleStartParam } from './components/battleHelpers.js';
import { ProfileCard } from './components/ProfileCard.js';
import { GameScreen } from './components/GameScreen.js';
import { ResultsScreen } from './components/ResultsScreen.js';
import { LeaderboardScreen } from './components/LeaderboardScreen.js';
import { ChallengeLandingScreen } from './components/ChallengeLandingScreen.js';
import { HeadToHeadResultScreen } from './components/HeadToHeadResultScreen.js';
import { BattleLobbyScreen } from './components/BattleLobbyScreen.js';
import { LiveBattleScreen } from './components/LiveBattleScreen.js';
import { BattleResultScreen } from './components/BattleResultScreen.js';
import { ErrorState } from './components/ErrorState.js';

export function App() {
  const queryClient = useQueryClient();
  const { profile, isLoading, error, refetch } = useProfile();
  const { sessionToken } = useStore();
  const { startRun, isStarting } = useGameRun();
  const { dailyStatus, startDaily, isStartingDaily } = useDailyChallenge(sessionToken);

  const [screen, setScreen] = useState<
    | 'profile'
    | 'playing'
    | 'results'
    | 'leaderboard'
    | 'challenge_landing'
    | 'head_to_head'
    | 'battle_lobby'
    | 'battle_live'
    | 'battle_result'
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

  const [activeBattleId, setActiveBattleId] = useState<string | null>(null);
  const [activeBattleInfo, setActiveBattleInfo] = useState<BattleInfoResponse | null>(null);
  const [activeBattleStart, setActiveBattleStart] = useState<BattleStartPayload | null>(null);
  const [activeBattleFinished, setActiveBattleFinished] = useState<BattleFinishedPayload | null>(null);
  const [isStartingBattle, setIsStartingBattle] = useState(false);
  const [isLoadingBattleInfo, setIsLoadingBattleInfo] = useState(false);

  const {
    isConnecting: isBattleSocketConnecting,
    isReconnecting: isBattleSocketReconnecting,
    bothPlayersPresent: isBattleBothPresent,
    opponentJoined: battleOpponentJoined,
    isReady: isBattleReady,
    countdown: battleCountdown,
    startPayload: battleStartPayload,
    opponentProgress: battleOpponentProgress,
    finishedPayload: battleFinishedPayload,
    error: battleSocketError,
    sendReady: sendBattleReady,
    submitAnswer: submitBattleAnswer,
  } = useBattleSocket({
    sessionToken,
    battleId: activeBattleId,
    onBattleStart: (payload) => {
      setActiveBattleStart(payload);
      setScreen('battle_live');
    },
    onBattleFinished: (payload) => {
      setActiveBattleFinished(payload);
      setScreen('battle_result');
      void queryClient.invalidateQueries({ queryKey: ['profile'] });
    },
  });

  useEffect(() => {
    if (!sessionToken || !profile) {
      return;
    }

    const initialBattleId = getBattleStartParam();
    if (initialBattleId) {
      let isMounted = true;
      setIsLoadingBattleInfo(true);
      getBattleInfo(sessionToken, initialBattleId)
        .then(async (info) => {
          if (!isMounted) {
            return;
          }
          setActiveBattleId(info.battleId);
          setActiveBattleInfo(info);
          if (info.status === 'completed') {
            setScreen('battle_result');
          } else {
            if (info.isJoinable && !info.isChallenger) {
              try {
                await joinBattle(sessionToken, info.battleId);
                const refreshed = await getBattleInfo(sessionToken, info.battleId);
                if (isMounted) {
                  setActiveBattleInfo(refreshed);
                }
              } catch {
                void 0;
              }
            }
            setScreen('battle_lobby');
          }
        })
        .catch((err) => {
          if (!isMounted) {
            return;
          }
          const message = err instanceof Error ? err.message : 'Failed to load battle';
          setStartError(message);
        })
        .finally(() => {
          if (isMounted) {
            setIsLoadingBattleInfo(false);
          }
        });

      return () => {
        isMounted = false;
      };
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

  const handleStartBattle = async () => {
    if (!sessionToken) {
      return;
    }
    setStartError(null);
    setIsStartingBattle(true);
    try {
      const response = await createBattle(sessionToken);
      setActiveBattleId(response.battleId);
      const info = await getBattleInfo(sessionToken, response.battleId);
      setActiveBattleInfo(info);
      setScreen('battle_lobby');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to create battle';
      setStartError(message);
    } finally {
      setIsStartingBattle(false);
    }
  };

  const handleBattleAgain = async () => {
    if (!sessionToken) {
      return;
    }
    setStartError(null);
    setIsStartingBattle(true);
    setActiveBattleStart(null);
    setActiveBattleFinished(null);
    try {
      const response = await createBattle(sessionToken);
      setActiveBattleId(response.battleId);
      const info = await getBattleInfo(sessionToken, response.battleId);
      setActiveBattleInfo(info);
      setScreen('battle_lobby');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to create battle';
      setStartError(message);
    } finally {
      setIsStartingBattle(false);
    }
  };

  const handleBackToProfile = () => {
    setScreen('profile');
    setCurrentRun(null);
    setLastResult(null);
    setStartError(null);
    setActiveChallengeId(null);
    setActiveChallengeInfo(null);
    setActiveRole(null);
    setActiveBattleId(null);
    setActiveBattleInfo(null);
    setActiveBattleStart(null);
    setActiveBattleFinished(null);
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

      {isLoadingBattleInfo && (
        <div className="flex flex-col items-center gap-3 text-center">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-violet-500 border-t-transparent" />
          <p className="text-xs font-medium text-tg-hint">Loading live battle...</p>
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

      {!isLoading && !isLoadingChallengeInfo && !isLoadingBattleInfo && !error && screen === 'profile' && profile && (
        <ProfileCard
          profile={profile}
          dailyStatus={dailyStatus}
          onPlay={handleStartPractice}
          onStartDaily={handleStartDaily}
          onChallengeFriend={handleStartChallenge}
          onBattleFriend={handleStartBattle}
          onViewLeaderboard={handleOpenGlobalLeaderboard}
          onViewDailyLeaderboard={handleOpenDailyLeaderboard}
          isStarting={isStarting}
          isStartingDaily={isStartingDaily}
          isStartingChallenge={isStartingChallenge}
          isStartingBattle={isStartingBattle}
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

      {!isLoading && !isLoadingBattleInfo && screen === 'battle_lobby' && activeBattleId && profile && (
        <BattleLobbyScreen
          battleId={activeBattleId}
          battleInfo={activeBattleInfo}
          currentUserId={profile.telegramUserId}
          bothPlayersPresent={
            isBattleBothPresent ||
            Boolean(activeBattleInfo?.opponentUserId && activeBattleInfo.status !== 'waiting')
          }
          opponentJoinedPayload={battleOpponentJoined}
          isReady={isBattleReady}
          countdown={battleCountdown}
          onReady={sendBattleReady}
          onBack={handleBackToProfile}
          isConnecting={isBattleSocketConnecting}
          error={battleSocketError}
        />
      )}

      {screen === 'battle_live' && (activeBattleStart || battleStartPayload) && profile && (
        <LiveBattleScreen
          battleStart={activeBattleStart || battleStartPayload!}
          opponentDisplayName={
            activeBattleInfo?.challengerUserId === profile.telegramUserId
              ? battleOpponentJoined?.opponentDisplayName || activeBattleInfo?.opponentDisplayName || 'Opponent'
              : activeBattleInfo?.challengerDisplayName || 'Host'
          }
          opponentProgress={battleOpponentProgress}
          isReconnecting={isBattleSocketReconnecting}
          onSubmitAnswer={submitBattleAnswer}
        />
      )}

      {screen === 'battle_result' && activeBattleId && profile && (
        <BattleResultScreen
          battleId={activeBattleId}
          finishedPayload={activeBattleFinished || battleFinishedPayload}
          battleInfo={activeBattleInfo}
          currentUserId={profile.telegramUserId}
          onBattleAgain={handleBattleAgain}
          onBackToProfile={handleBackToProfile}
          isStartingBattleAgain={isStartingBattle}
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
