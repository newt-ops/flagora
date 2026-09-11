import { useEffect, useState, useCallback } from 'react';
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
import { useStreakStatus } from './hooks/useStreakStatus.js';
import { useBattleSocket } from './hooks/useBattleSocket.js';
import { useRank } from './hooks/useRank.js';
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
import { PlayScreen } from './components/PlayScreen.js';
import { ShopScreen } from './components/ShopScreen.js';
import { BottomNav, type NavTab } from './components/BottomNav.js';
import { PlaySkeleton, CardSkeleton } from './components/Skeletons.js';
import {
  initTelegramWebApp,
  syncTelegramBackButton,
} from './telegram/telegramWebApp.js';

export function App() {
  const queryClient = useQueryClient();
  const { profile, isLoading, error, refetch } = useProfile();
  const { sessionToken } = useStore();
  const { startRun, isStarting } = useGameRun();
  const { dailyStatus, startDaily, isStartingDaily } = useDailyChallenge(sessionToken);
  const { streakStatus, refetchStreakStatus } = useStreakStatus(sessionToken);
  const { rankStatus, refetchRank } = useRank(sessionToken);

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
  const [runMode, setRunMode] = useState<'practice' | 'daily' | 'challenge' | 'custom'>('practice');
  const [activeTab, setActiveTab] = useState<NavTab>('play');
  const [activeRole, setActiveRole] = useState<'challenger' | 'opponent' | null>(null);
  const [leaderboardMode, setLeaderboardMode] = useState<'global' | 'daily' | 'ranked'>('global');
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
    opponentReady: isBattleOpponentReady,
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
      void queryClient.invalidateQueries({ queryKey: ['rank', 'status'] });
      void queryClient.invalidateQueries({ queryKey: ['leaderboard', 'ranked'] });
    },
  });

  const checkBattleFinishedFallback = useCallback(async () => {
    if (!sessionToken || !activeBattleId) return;
    try {
      const info = await getBattleInfo(sessionToken, activeBattleId);
      if (info.status === 'completed' && info.challengerResult && info.opponentResult) {
        setActiveBattleInfo(info);
        setActiveBattleFinished({
          battleId: info.battleId,
          winner: info.winner || 'tie',
          challengerScore: info.challengerScore ?? 0,
          opponentScore: info.opponentScore ?? 0,
          completedAt: String(info.completedAt || new Date().toISOString()),
          challengerResult: info.challengerResult,
          opponentResult: info.opponentResult,
        });
        setScreen('battle_result');
        void queryClient.invalidateQueries({ queryKey: ['profile'] });
        void queryClient.invalidateQueries({ queryKey: ['rank', 'status'] });
        void queryClient.invalidateQueries({ queryKey: ['leaderboard', 'ranked'] });
      }
    } catch {
      void 0;
    }
  }, [sessionToken, activeBattleId, queryClient]);

  useEffect(() => {
    if (screen !== 'battle_live' || !activeBattleId || !sessionToken) return;

    const fallbackTimer = setTimeout(() => {
      void checkBattleFinishedFallback();
    }, 62000);

    const interval = setInterval(() => {
      void checkBattleFinishedFallback();
    }, 3000);

    return () => {
      clearTimeout(fallbackTimer);
      clearInterval(interval);
    };
  }, [screen, activeBattleId, sessionToken, checkBattleFinishedFallback]);

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

  const handleStartPractice = async (options?: {
    continent?: string;
    flagCount?: number;
    durationSeconds?: number;
  }) => {
    if (!sessionToken) {
      return;
    }
    setStartError(null);
    try {
      const run = await startRun(sessionToken, options);
      setRunMode(
        options?.continent || options?.flagCount || options?.durationSeconds ? 'custom' : 'practice',
      );
      setCurrentRun(run);
      setScreen('playing');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to start run';
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
    setActiveTab('play');
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
    setActiveTab('leaderboard');
    setScreen('profile');
  };

  const handleOpenDailyLeaderboard = () => {
    setLeaderboardMode('daily');
    setActiveTab('leaderboard');
    setScreen('profile');
  };

  useEffect(() => {
    initTelegramWebApp();
  }, []);

  useEffect(() => {
    return syncTelegramBackButton(screen !== 'profile' || activeTab !== 'play', handleBackToProfile);
  }, [screen, activeTab]);

  return (
    <main
      className="flex min-h-screen flex-col items-center justify-start bg-tg-secondary-bg text-tg-text px-4 pt-[calc(var(--app-safe-top,0px)+1.25rem)] pb-[calc(var(--tg-safe-area-inset-bottom,env(safe-area-inset-bottom,0px))+5.5rem)]"
    >
      {isLoading && <PlaySkeleton />}

      {isLoadingChallengeInfo && <CardSkeleton message="Loading challenge..." />}

      {isLoadingBattleInfo && <CardSkeleton message="Loading live battle..." />}

      {!isLoading && error && <ErrorState message={error} onRetry={refetch} />}

      {!isLoading && !error && startError && (
        <div className="mb-4 w-full max-w-sm">
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
        <>
          {activeTab === 'play' && (
            <PlayScreen
              profile={profile}
              dailyStatus={dailyStatus}
              streakStatus={streakStatus}
              rankStatus={rankStatus}
              sessionToken={sessionToken}
              onPlayPractice={handleStartPractice}
              onStartCustomGame={handleStartPractice}
              onStartDaily={handleStartDaily}
              onChallengeFriend={handleStartChallenge}
              onBattleFriend={handleStartBattle}
              onViewDailyLeaderboard={handleOpenDailyLeaderboard}
              onNavigateToProfile={() => setActiveTab('profile')}
              onRefetchProfile={() => {
                refetch();
                refetchRank();
              }}
              onRefetchStreakStatus={refetchStreakStatus}
              isStarting={isStarting}
              isStartingDaily={isStartingDaily}
              isStartingChallenge={isStartingChallenge}
              isStartingBattle={isStartingBattle}
            />
          )}

          {activeTab === 'leaderboard' && sessionToken && (
            <div className="w-full max-w-sm pb-20">
              <LeaderboardScreen
                sessionToken={sessionToken}
                currentUserId={profile.telegramUserId}
                initialMode={leaderboardMode}
                onBack={() => setActiveTab('play')}
                showBackButton={false}
                onPlay={handleStartPractice}
                onPlayDaily={handleStartDaily}
                onBattleLive={handleStartBattle}
                isStarting={isStarting || isStartingDaily}
                dailyAttempted={Boolean(dailyStatus?.attempted)}
                userAvatarFrame={profile.equipped?.avatarFrame}
              />
            </div>
          )}

          {activeTab === 'shop' && (
            <div className="w-full max-w-sm pb-20">
              <ShopScreen
                profile={profile}
                sessionToken={sessionToken}
                onRefetchProfile={refetch}
              />
            </div>
          )}

          {activeTab === 'profile' && (
            <div className="w-full max-w-sm pb-20">
              <ProfileCard
                profile={profile}
                dailyStatus={dailyStatus}
                streakStatus={streakStatus}
                rankStatus={rankStatus}
                sessionToken={sessionToken}
                onRefetchProfile={() => {
                  refetch();
                  refetchRank();
                }}
                onRefetchStreakStatus={refetchStreakStatus}
                showGameActions={false}
              />
            </div>
          )}

          <BottomNav activeTab={activeTab} onTabChange={setActiveTab} />
        </>
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
          userAvatarFrame={profile.equipped?.avatarFrame}
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
          opponentReady={
            isBattleOpponentReady ||
            Boolean(
              activeBattleInfo?.challengerUserId === profile.telegramUserId
                ? activeBattleInfo?.opponentReady
                : activeBattleInfo?.challengerReady
            )
          }
          countdown={battleCountdown}
          onReady={sendBattleReady}
          onBack={handleBackToProfile}
          isConnecting={isBattleSocketConnecting}
          error={battleSocketError}
          userAvatarFrame={profile.equipped?.avatarFrame}
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
          onCheckFinished={checkBattleFinishedFallback}
          flagTheme={profile.equipped?.flagTheme}
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
          userAvatarFrame={profile.equipped?.avatarFrame}
        />
      )}

      {!isLoading && !error && screen === 'playing' && currentRun && sessionToken && (
        <GameScreen
          run={currentRun}
          sessionToken={sessionToken}
          onFinish={handleFinishGame}
          flagTheme={profile?.equipped?.flagTheme}
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
          onBattleLive={handleStartBattle}
          isStarting={isStarting || isStartingDaily}
          dailyAttempted={Boolean(dailyStatus?.attempted)}
          userAvatarFrame={profile.equipped?.avatarFrame}
        />
      )}
    </main>
  );
}
