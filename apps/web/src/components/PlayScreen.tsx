import { useState } from 'react';
import {
  Play,
  Flame,
  Trophy,
  Calendar,
  CheckCircle2,
  Swords,
  Zap,
  Coins,
  Globe,
  Sliders,
} from 'lucide-react';
import type {
  PlayerProfile,
  DailyChallengeStatusResponse,
  StreakStatusResponse,
  RankStatusResponse,
} from '@flagora/shared';
import { getDisplayName } from '@flagora/shared';
import { getDailyResultSummary } from './dailyChallengeHelpers.js';
import { CustomGameModal, type CustomGameConfig } from './CustomGameModal.js';
import { StreakSaveBanner } from './StreakSaveBanner.js';
import { getAvatarFrameClass } from './cosmeticHelpers.js';
import { formatSeasonName, getTierBadgeColors, getTierIcon } from './rankHelpers.js';
import { TierBadge } from './TierBadge.js';

interface PlayScreenProps {
  profile: PlayerProfile;
  dailyStatus?: DailyChallengeStatusResponse | null;
  streakStatus?: StreakStatusResponse | null;
  rankStatus?: RankStatusResponse | null;
  sessionToken?: string | null;
  onPlayPractice: () => void;
  onStartDaily: () => void;
  onChallengeFriend: () => void;
  onBattleFriend: () => void;
  onStartCustomGame?: (config: CustomGameConfig) => void;
  onViewDailyLeaderboard: () => void;
  onNavigateToProfile: () => void;
  onRefetchProfile?: () => void;
  onRefetchStreakStatus?: () => void;
  isStarting?: boolean;
  isStartingDaily?: boolean;
  isStartingChallenge?: boolean;
  isStartingBattle?: boolean;
}

export function PlayScreen({
  profile,
  dailyStatus,
  streakStatus,
  rankStatus,
  sessionToken,
  onPlayPractice,
  onStartDaily,
  onChallengeFriend,
  onBattleFriend,
  onStartCustomGame,
  onViewDailyLeaderboard,
  onNavigateToProfile,
  onRefetchProfile,
  onRefetchStreakStatus,
  isStarting = false,
  isStartingDaily = false,
  isStartingChallenge = false,
  isStartingBattle = false,
}: PlayScreenProps) {
  const [isCustomModalOpen, setIsCustomModalOpen] = useState(false);
  const displayName = getDisplayName(profile);
  const firstName = profile.firstName || displayName;
  const initial = profile.firstName ? profile.firstName.charAt(0).toUpperCase() : 'P';
  const dailySummary = getDailyResultSummary(dailyStatus?.result ?? null);
  const frameClass = getAvatarFrameClass(profile.equipped?.avatarFrame);

  const currentTier = rankStatus?.tier ?? 'Bronze';
  const currentRating = rankStatus?.battleRating ?? 0;
  const seasonName = formatSeasonName(rankStatus?.season);
  const tierColors = getTierBadgeColors(currentTier);
  const TierIcon = getTierIcon(currentTier);

  return (
    <div className="flex w-full max-w-sm flex-col gap-4 text-tg-text pb-20">
      <div
        role="button"
        tabIndex={0}
        onClick={onNavigateToProfile}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            onNavigateToProfile();
          }
        }}
        className="flex cursor-pointer items-center justify-between rounded-2xl bg-tg-section border border-tg-separator p-4 shadow-sm transition-opacity hover:opacity-95 active:scale-[0.99]"
      >
        <div className="flex items-center gap-3">
          {profile.photoUrl ? (
            <img
              src={profile.photoUrl}
              alt={firstName}
              className={`h-12 w-12 rounded-full object-cover bg-tg-section ${
                frameClass ? frameClass : 'ring-2 ring-tg-button'
              }`}
            />
          ) : (
            <div
              className={`flex h-12 w-12 items-center justify-center rounded-full bg-tg-button text-xl font-bold text-tg-button-text ${
                frameClass ? frameClass : ''
              }`}
            >
              {initial}
            </div>
          )}
          <div className="flex flex-col text-left">
            <h1 className="text-base font-bold text-tg-text">{firstName}</h1>
            <div className="flex items-center gap-2 text-xs text-tg-hint">
              <span>Level {profile.level}</span>
              <TierBadge tier={currentTier} size="xs" />
              {profile.username && (
                <span>• @{profile.username.replace(/^@/, '')}</span>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 rounded-full bg-tg-secondary-bg border border-tg-separator px-2.5 py-1 text-xs font-bold text-tg-text">
            <Coins className="h-3.5 w-3.5 text-tg-button" />
            <span>{profile.coins.toLocaleString()}</span>
          </div>

          <div className="flex items-center gap-1.5 rounded-full bg-tg-secondary-bg border border-tg-separator px-2.5 py-1 text-xs font-bold text-tg-text">
            <Flame className="h-3.5 w-3.5 fill-current text-tg-button" />
            <span>{profile.currentStreak}</span>
          </div>
        </div>
      </div>

      <div
        role="button"
        tabIndex={0}
        onClick={onNavigateToProfile}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            onNavigateToProfile();
          }
        }}
        data-testid="play-rank-tier-banner"
        className={`flex cursor-pointer items-center justify-between rounded-2xl border px-4 py-2.5 transition-all hover:opacity-95 active:scale-[0.99] ${tierColors.bg} ${tierColors.border}`}
      >
        <div className="flex items-center gap-2.5">
          <div
            className={`flex h-8 w-8 items-center justify-center rounded-lg border ${tierColors.badge}`}
          >
            <TierIcon className="h-4 w-4 fill-current" />
          </div>
          <div className="flex items-center gap-2 text-left">
            <span className={`text-xs font-extrabold ${tierColors.text}`}>
              {currentTier} Tier
            </span>
            <span className="text-xs font-bold text-tg-text">
              {currentRating.toLocaleString()} <span className="text-[10px] font-medium text-tg-hint">Rating</span>
            </span>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          <span
            data-testid="play-season-identifier"
            className="text-[11px] font-semibold text-tg-hint"
          >
            {seasonName}
          </span>
          <span className="text-[10px] text-tg-hint">›</span>
        </div>
      </div>

      {streakStatus?.isAtRisk && (
        <StreakSaveBanner
          sessionToken={sessionToken}
          streakStatus={streakStatus}
          onSuccess={() => {
            onRefetchProfile?.();
            onRefetchStreakStatus?.();
          }}
        />
      )}

      <div className="rounded-2xl bg-tg-section border border-tg-separator p-5 shadow-sm">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-tg-button/10 text-tg-button">
              <Calendar className="h-4 w-4" />
            </div>
            <div className="text-left">
              <h2 className="text-sm font-bold text-tg-text">Daily Challenge</h2>
              <p className="text-[11px] text-tg-hint">10 daily flags for all players</p>
            </div>
          </div>

          {dailyStatus?.attempted ? (
            <span className="flex items-center gap-1 rounded-full bg-tg-secondary-bg border border-tg-separator px-2.5 py-0.5 text-[11px] font-semibold text-tg-hint">
              <CheckCircle2 className="h-3 w-3" />
              Completed
            </span>
          ) : (
            <span className="rounded-full bg-tg-button/15 px-2.5 py-0.5 text-[11px] font-bold text-tg-button">
              Available
            </span>
          )}
        </div>

        {dailyStatus?.attempted ? (
          <div className="mt-4 flex flex-col gap-2.5">
            {dailySummary && (
              <div className="flex items-center justify-between rounded-xl bg-tg-secondary-bg border border-tg-separator px-3.5 py-2.5 text-xs">
                <div>
                  <span className="font-extrabold text-tg-text">{dailySummary.scoreText}</span>
                  <span className="ml-2 text-tg-hint">{dailySummary.correctText}</span>
                </div>
                <span className="text-tg-hint">{dailySummary.timeText}</span>
              </div>
            )}

            <button
              type="button"
              onClick={onViewDailyLeaderboard}
              className="flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-tg-secondary-bg border border-tg-separator font-bold text-tg-text transition-opacity hover:opacity-90 active:opacity-75"
            >
              <Trophy className="h-4 w-4 text-tg-button" />
              <span>View Daily Leaderboard</span>
            </button>
          </div>
        ) : (
          <div className="mt-4">
            <button
              type="button"
              onClick={onStartDaily}
              disabled={isStartingDaily}
              className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-tg-button font-bold text-tg-button-text shadow-sm transition-opacity hover:opacity-90 active:opacity-75 disabled:pointer-events-none disabled:opacity-50"
            >
              <Play className={`h-4 w-4 fill-current ${isStartingDaily ? 'animate-spin' : ''}`} />
              <span>{isStartingDaily ? 'Starting Challenge...' : 'Play Daily Challenge'}</span>
            </button>
          </div>
        )}
      </div>

      <div className="flex flex-col gap-3">
        <h2 className="px-1 text-xs font-bold uppercase tracking-wider text-tg-hint">
          Game Modes
        </h2>

        <div className="rounded-2xl bg-tg-section border border-tg-separator p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-tg-button/10 text-tg-button">
                <Play className="h-5 w-5 fill-current" />
              </div>
              <div className="text-left">
                <h3 className="text-sm font-bold text-tg-text">Practice Solo</h3>
                <p className="text-xs text-tg-hint">60s speed blitz with combo multipliers</p>
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={onPlayPractice}
            disabled={isStarting}
            className="mt-3 flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-tg-button font-bold text-tg-button-text shadow-sm transition-opacity hover:opacity-90 active:opacity-75 disabled:pointer-events-none disabled:opacity-50"
          >
            <Play className={`h-3.5 w-3.5 fill-current ${isStarting ? 'animate-spin' : ''}`} />
            <span>{isStarting ? 'Starting...' : 'Play Solo'}</span>
          </button>
        </div>

        <div className="rounded-2xl bg-tg-section border border-tg-separator p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-tg-button/10 text-tg-button">
                <Globe className="h-5 w-5" />
              </div>
              <div className="text-left">
                <h3 className="text-sm font-bold text-tg-text">Custom Mode</h3>
                <p className="text-xs text-tg-hint">Choose continents, flag count & timer</p>
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setIsCustomModalOpen(true)}
            className="mt-3 flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-tg-secondary-bg border border-tg-separator font-bold text-tg-text shadow-sm transition-opacity hover:opacity-90 active:opacity-75"
          >
            <Sliders className="h-3.5 w-3.5 text-tg-button" />
            <span>Customize & Play</span>
          </button>
        </div>

        <div className="rounded-2xl bg-tg-section border border-tg-separator p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-tg-button/10 text-tg-button">
                <Zap className="h-5 w-5" />
              </div>
              <div className="text-left">
                <h3 className="text-sm font-bold text-tg-text">Live 1v1 Battle</h3>
                <p className="text-xs text-tg-hint">Real-time head-to-head multiplayer</p>
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={onBattleFriend}
            disabled={isStartingBattle}
            className="mt-3 flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-tg-button font-bold text-tg-button-text shadow-sm transition-opacity hover:opacity-90 active:opacity-75 disabled:pointer-events-none disabled:opacity-50"
          >
            <Zap className={`h-3.5 w-3.5 ${isStartingBattle ? 'animate-spin' : ''}`} />
            <span>{isStartingBattle ? 'Creating Battle...' : 'Battle Live'}</span>
          </button>
        </div>

        <div className="rounded-2xl bg-tg-section border border-tg-separator p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-tg-button/10 text-tg-button">
                <Swords className="h-5 w-5" />
              </div>
              <div className="text-left">
                <h3 className="text-sm font-bold text-tg-text">Duel a Friend</h3>
                <p className="text-xs text-tg-hint">Send a challenge score to any Telegram chat</p>
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={onChallengeFriend}
            disabled={isStartingChallenge}
            className="mt-3 flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-tg-button font-bold text-tg-button-text shadow-sm transition-opacity hover:opacity-90 active:opacity-75 disabled:pointer-events-none disabled:opacity-50"
          >
            <Swords className={`h-3.5 w-3.5 ${isStartingChallenge ? 'animate-spin' : ''}`} />
            <span>{isStartingChallenge ? 'Creating Challenge...' : 'Start Duel'}</span>
          </button>
        </div>
      </div>

      <CustomGameModal
        isOpen={isCustomModalOpen}
        onClose={() => setIsCustomModalOpen(false)}
        onStart={(config) => {
          setIsCustomModalOpen(false);
          onStartCustomGame?.(config);
        }}
        loading={isStarting}
      />
    </div>
  );
}
