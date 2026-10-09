import { useState } from 'react';
import {
  Play,
  Flame,
  Trophy,
  Calendar,
  CheckCircle2,
  Swords,
  Zap,
  Users,
  Gift,
  Share2,
  Copy,
  Check,
  Crown,
  Pins,
  Gamepad2,
} from './icons.js';
import {
  type PlayerProfile,
  type DailyChallengeStatusResponse,
  type StreakStatusResponse,
  type RankStatusResponse,
  type ProStatusResponse,
  getDisplayName,
} from '@flagora/shared';
import { getProfileStreakDisplay } from './streakDisplayHelpers.js';
import { getDailyResultSummary } from './dailyChallengeHelpers.js';
import { StreakSaveBanner } from './StreakSaveBanner.js';
import { formatSeasonName, getTierIcon } from './rankHelpers.js';
import { ProUpgradeModal } from './ProUpgradeModal.js';
import { VerifiedBadge } from './VerifiedBadge.js';
import { triggerHaptic } from '../telegram/haptics.js';

export { getDisplayName };

interface ProfileCardProps {
  profile: PlayerProfile;
  dailyStatus?: DailyChallengeStatusResponse | null;
  streakStatus?: StreakStatusResponse | null;
  rankStatus?: RankStatusResponse | null;
  proStatus?: ProStatusResponse | null;
  sessionToken?: string | null;
  onPlay?: () => void;
  onStartDaily?: () => void;
  onChallengeFriend?: () => void;
  onBattleFriend?: () => void;
  onViewLeaderboard?: () => void;
  onViewDailyLeaderboard?: () => void;
  onRefetchProfile?: () => void;
  onRefetchStreakStatus?: () => void;
  onRefetchProStatus?: () => void;
  isStarting?: boolean;
  isStartingDaily?: boolean;
  isStartingChallenge?: boolean;
  isStartingBattle?: boolean;
  showGameActions?: boolean;
}

export function ProfileCard({
  profile,
  dailyStatus,
  streakStatus,
  rankStatus,
  proStatus = null,
  sessionToken,
  onPlay,
  onStartDaily,
  onChallengeFriend,
  onBattleFriend,
  onViewLeaderboard,
  onViewDailyLeaderboard,
  onRefetchProfile,
  onRefetchStreakStatus,
  onRefetchProStatus,
  isStarting = false,
  isStartingDaily = false,
  isStartingChallenge = false,
  isStartingBattle = false,
  showGameActions = true,
}: ProfileCardProps) {
  const [referralCopied, setReferralCopied] = useState(false);
  const [isUpgradeModalOpen, setIsUpgradeModalOpen] = useState(false);
  const displayName = getDisplayName(profile);
  const initial = profile.firstName ? profile.firstName.charAt(0).toUpperCase() : 'P';
  const streakInfo = getProfileStreakDisplay(profile.currentStreak, profile.longestStreak);
  const dailySummary = getDailyResultSummary(dailyStatus?.result ?? null);
  const currentTier = rankStatus?.tier ?? 'Bronze';
  const currentRating = rankStatus?.battleRating ?? 0;
  const currentRank = rankStatus?.rank ?? null;
  const seasonName = formatSeasonName(rankStatus?.season);
  const TierIcon = getTierIcon(currentTier);

  // Level & XP Progress calculation (500 XP per level config)
  const currentLevel = profile.level;
  const xpInCurrentLevel = profile.xp % 500;
  const xpProgressPercent = Math.min(100, Math.max(0, Math.round((xpInCurrentLevel / 500) * 100)));

  const botUsername =
    (typeof import.meta !== 'undefined' && import.meta.env?.VITE_BOT_USERNAME) || 'FlagoraBot';
  const cleanBotUsername = botUsername.replace(/^@/, '');
  const referralLink = `https://t.me/${cleanBotUsername}?start=ref_${profile.telegramUserId}`;

  const handleCopyReferral = async () => {
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(referralLink);
      } else {
        const textarea = document.createElement('textarea');
        textarea.value = referralLink;
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
      }
      triggerHaptic('success');
      setReferralCopied(true);
      setTimeout(() => setReferralCopied(false), 2000);
    } catch {
      void 0;
    }
  };

  const handleShareReferral = () => {
    triggerHaptic('success');
    const text = 'Join me on Flagora! Test your flag knowledge, battle real players in real-time, and get +50 pins!';
    const shareUrl = `https://t.me/share/url?url=${encodeURIComponent(referralLink)}&text=${encodeURIComponent(text)}`;
    if (typeof window !== 'undefined') {
      const tg = (window as unknown as { Telegram?: { WebApp?: { openTelegramLink?: (url: string) => void } } })
        .Telegram?.WebApp;
      if (tg?.openTelegramLink) {
        tg.openTelegramLink(shareUrl);
      } else {
        window.open(shareUrl, '_blank');
      }
    }
  };

  const isVerifiedUser = Boolean(proStatus?.isActive || profile.isVerified);

  return (
    <div className="flex w-full max-w-md mx-auto flex-col gap-2.5 text-tg-text">
      {/* 1. Hero Profile Card - Clean Apple Inset */}
      <div className="flex w-full flex-col items-center rounded-2xl bg-tg-section p-5 text-center shadow-none">
        {/* Avatar */}
        <div className="relative flex h-16 w-16 items-center justify-center">
          {profile.photoUrl ? (
            <img
              src={profile.photoUrl}
              alt={displayName}
              className="h-16 w-16 rounded-full object-cover bg-tg-secondary-bg"
            />
          ) : (
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-tg-button text-2xl font-bold text-tg-button-text">
              {initial}
            </div>
          )}
          {isVerifiedUser && (
            <div className="absolute -bottom-1 -right-1 rounded-full bg-tg-section p-0.5">
              <VerifiedBadge className="h-4 w-4 text-[#2AABEE]" />
            </div>
          )}
        </div>

        {/* Name & Checkmark */}
        <div className="mt-3 flex items-center justify-center gap-1.5 flex-wrap">
          <h2 className="text-lg font-bold text-tg-text">
            {profile.firstName || displayName}
          </h2>
          {isVerifiedUser && (
            <VerifiedBadge className="h-4 w-4 text-[#2AABEE]" />
          )}
        </div>

        {profile.username && (
          <p className="text-xs text-tg-hint mt-0.5">
            @{profile.username.replace(/^@/, '')}
          </p>
        )}

        {/* Level & XP Progression */}
        <div className="w-full mt-4">
          <div className="flex items-center justify-between text-xs text-tg-hint mb-1.5">
            <span>Level {currentLevel}</span>
            <span>{xpInCurrentLevel} / 500 XP</span>
          </div>
          <div className="h-1.5 w-full rounded-full bg-tg-secondary-bg overflow-hidden">
            <div
              className="h-full rounded-full bg-tg-button transition-all duration-300"
              style={{ width: `${xpProgressPercent}%` }}
            />
          </div>
        </div>

        {/* Pro Status or 1-Star Upgrade CTA */}
        {proStatus?.isActive ? (
          <div className="mt-3.5 flex items-center justify-center gap-1.5 text-xs text-tg-hint">
            <Crown className="h-3.5 w-3.5 text-tg-button" />
            <span>
              Pro Verified
              {proStatus.currentPeriodEnd
                ? ` · Renews ${new Date(proStatus.currentPeriodEnd).toLocaleDateString()}`
                : ''}
            </span>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => {
              triggerHaptic('success');
              setIsUpgradeModalOpen(true);
            }}
            className="mt-3.5 flex items-center justify-between w-full rounded-xl bg-tg-secondary-bg p-3 text-left transition-opacity hover:opacity-90 active:scale-[0.99]"
          >
            <div className="flex items-center gap-2 min-w-0">
              <VerifiedBadge className="h-4 w-4 text-[#2AABEE] shrink-0" />
              <span className="text-xs font-semibold text-tg-text truncate">Get Verified Badge</span>
            </div>
            <div className="flex items-center gap-1 shrink-0 ml-2">
              <span className="rounded-full bg-tg-button px-2 py-0.5 text-xs font-bold text-tg-button-text">1 Star</span>
              <span className="text-tg-hint text-xs font-bold">›</span>
            </div>
          </button>
        )}
      </div>

      {/* 2. Ranked Season Card */}
      <div
        data-testid="profile-rank-card"
        className="flex w-full items-center justify-between rounded-2xl bg-tg-section p-4 shadow-none"
      >
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-tg-secondary-bg text-tg-button">
            <TierIcon className="h-5 w-5" />
          </div>
          <div className="text-left min-w-0">
            <p className="text-sm font-semibold text-tg-text truncate">
              {currentTier} Tier
            </p>
            <p
              data-testid="profile-season-identifier"
              className="text-xs text-tg-hint truncate"
            >
              Season: {seasonName}
            </p>
          </div>
        </div>

        <div className="flex flex-col items-end text-right shrink-0">
          <span className="text-xs font-bold text-tg-text">
            {currentRating.toLocaleString()} Rating
          </span>
          <span className="mt-0.5 rounded-full bg-tg-secondary-bg px-2 py-0.5 text-[11px] font-semibold text-tg-hint">
            {currentRank ? `#${currentRank}` : 'Unranked'}
          </span>
        </div>
      </div>

      {/* 3. Performance Matrix (4 Metric Cells) */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <div className="flex flex-col items-center rounded-2xl bg-tg-section p-3 text-center shadow-none">
          <div className="flex items-center gap-1.5 text-tg-hint">
            <Pins className="h-3.5 w-3.5 text-tg-button" />
            <span className="text-[11px] font-medium uppercase tracking-wider">Pins</span>
          </div>
          <p className="mt-1 text-lg font-bold text-tg-text">{profile.pins.toLocaleString()}</p>
        </div>

        <div className="flex flex-col items-center rounded-2xl bg-tg-section p-3 text-center shadow-none">
          <div className="flex items-center gap-1.5 text-tg-hint">
            <Zap className="h-3.5 w-3.5 text-tg-button" />
            <span className="text-[11px] font-medium uppercase tracking-wider">Total XP</span>
          </div>
          <p className="mt-1 text-lg font-bold text-tg-text">{profile.xp.toLocaleString()}</p>
        </div>

        <div className="flex flex-col items-center rounded-2xl bg-tg-section p-3 text-center shadow-none">
          <div className="flex items-center gap-1.5 text-tg-hint">
            <Trophy className="h-3.5 w-3.5 text-tg-button" />
            <span className="text-[11px] font-medium uppercase tracking-wider">Best Score</span>
          </div>
          <p className="mt-1 text-lg font-bold text-tg-text">{profile.bestScore.toLocaleString()}</p>
        </div>

        <div className="flex flex-col items-center rounded-2xl bg-tg-section p-3 text-center shadow-none">
          <div className="flex items-center gap-1.5 text-tg-hint">
            <Gamepad2 className="h-3.5 w-3.5 text-tg-button" />
            <span className="text-[11px] font-medium uppercase tracking-wider">Games</span>
          </div>
          <p className="mt-1 text-lg font-bold text-tg-text">{profile.gamesPlayed.toLocaleString()}</p>
        </div>
      </div>

      {/* 4. Daily Streak Tracker */}
      <div className="flex w-full items-center justify-between rounded-2xl bg-tg-section p-4 shadow-none">
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-tg-secondary-bg text-tg-button">
            <Flame className="h-5 w-5" />
          </div>
          <div className="text-left min-w-0">
            <p className="text-sm font-semibold text-tg-text truncate">{streakInfo.title}</p>
            <p className="text-xs text-tg-hint truncate">{streakInfo.subtitle}</p>
          </div>
        </div>
        {streakInfo.isActive && (
          <span className="shrink-0 rounded-full bg-tg-secondary-bg px-2.5 py-0.5 text-xs font-semibold text-tg-button">
            Active
          </span>
        )}
      </div>

      {streakStatus?.isAtRisk && (
        <div className="w-full">
          <StreakSaveBanner
            sessionToken={sessionToken}
            streakStatus={streakStatus}
            userPins={profile.pins}
            isPro={proStatus?.isActive ?? false}
            onSuccess={() => {
              onRefetchProfile?.();
              onRefetchStreakStatus?.();
            }}
            onUpgradePro={() => setIsUpgradeModalOpen(true)}
          />
        </div>
      )}

      {/* 5. Invite Friends */}
      <div className="flex w-full flex-col rounded-2xl bg-tg-section p-4 text-left shadow-none">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-tg-secondary-bg text-tg-button">
              <Gift className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-tg-text truncate">Invite Friends</p>
              <p className="text-xs text-tg-hint truncate">+100 pins for you, +50 for friends</p>
            </div>
          </div>
          <div className="flex items-center gap-1 rounded-full bg-tg-secondary-bg px-2.5 py-0.5 text-xs font-semibold text-tg-text shrink-0">
            <Users className="h-3.5 w-3.5 text-tg-hint" />
            <span>{profile.referralCount ?? 0} Friends</span>
          </div>
        </div>

        <div className="mt-3.5 grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => void handleCopyReferral()}
            className="flex h-10 items-center justify-center gap-1.5 rounded-xl bg-tg-secondary-bg px-3 text-xs font-semibold text-tg-text transition-opacity hover:opacity-90 active:scale-[0.98] min-w-0"
          >
            {referralCopied ? (
              <>
                <Check className="h-4 w-4 text-tg-button" />
                <span className="text-tg-button font-bold">Copied</span>
              </>
            ) : (
              <>
                <Copy className="h-4 w-4 text-tg-hint" />
                <span className="truncate">Copy Link</span>
              </>
            )}
          </button>
          <button
            type="button"
            onClick={handleShareReferral}
            className="flex h-10 items-center justify-center gap-1.5 rounded-xl bg-tg-button px-3 text-xs font-semibold text-tg-button-text shadow-sm transition-opacity hover:opacity-90 active:scale-[0.98] min-w-0"
          >
            <Share2 className="h-4 w-4 shrink-0" />
            <span className="truncate">Share Link</span>
          </button>
        </div>
      </div>

      {/* Conditionally rendered Game Actions for standalone embedding */}
      {showGameActions && (
        <div className="mt-2 flex flex-col gap-2.5">
          <div className="rounded-2xl bg-tg-section p-4">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-tg-secondary-bg text-tg-button">
                  <Calendar className="h-4 w-4" />
                </div>
                <div className="text-left min-w-0">
                  <p className="text-sm font-semibold text-tg-text truncate">Daily Challenge</p>
                  <p className="text-xs text-tg-hint truncate">Same 10 flags for all players</p>
                </div>
              </div>
              {dailyStatus?.attempted ? (
                <span className="flex items-center gap-1 rounded-full bg-tg-secondary-bg px-2.5 py-0.5 text-xs font-semibold text-tg-button shrink-0">
                  <CheckCircle2 className="h-3 w-3" />
                  Completed
                </span>
              ) : (
                <span className="rounded-full bg-tg-secondary-bg px-2.5 py-0.5 text-xs font-semibold text-tg-button shrink-0">
                  Available
                </span>
              )}
            </div>

            {dailyStatus?.attempted ? (
              <div className="mt-3 flex flex-col gap-2">
                {dailySummary ? (
                  <div className="flex items-center justify-between rounded-xl bg-tg-secondary-bg px-3 py-2 text-xs">
                    <div>
                      <span className="font-bold text-tg-text">{dailySummary.scoreText}</span>
                      <span className="ml-2 text-tg-hint">{dailySummary.correctText}</span>
                    </div>
                    <span className="text-tg-hint">{dailySummary.timeText}</span>
                  </div>
                ) : (
                  <p className="text-xs text-tg-hint">Completed today</p>
                )}

                {onViewDailyLeaderboard && (
                  <button
                    type="button"
                    onClick={onViewDailyLeaderboard}
                    className="flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-tg-secondary-bg font-semibold text-tg-button transition-opacity hover:opacity-90 active:scale-[0.99]"
                  >
                    <Trophy className="h-4 w-4 text-tg-button" />
                    <span>View Daily Leaderboard</span>
                  </button>
                )}
              </div>
            ) : (
              <div className="mt-3">
                {onStartDaily && (
                  <button
                    type="button"
                    onClick={onStartDaily}
                    disabled={isStartingDaily}
                    className="flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-tg-button font-semibold text-tg-button-text shadow-sm transition-opacity hover:opacity-90 active:scale-[0.99] disabled:pointer-events-none disabled:opacity-50"
                  >
                    <Play className={`h-3.5 w-3.5 fill-current ${isStartingDaily ? 'animate-spin' : ''}`} />
                    <span>{isStartingDaily ? 'Starting Challenge...' : 'Play Daily Challenge'}</span>
                  </button>
                )}
              </div>
            )}
          </div>

          {onPlay && (
            <button
              type="button"
              onClick={onPlay}
              disabled={isStarting}
              className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-tg-button font-semibold text-tg-button-text shadow-sm transition-opacity hover:opacity-90 active:scale-[0.99] disabled:pointer-events-none disabled:opacity-50"
            >
              <Play className={`h-4 w-4 fill-current ${isStarting ? 'animate-spin' : ''}`} />
              <span>{isStarting ? 'Starting Run...' : 'Play Practice'}</span>
            </button>
          )}

          {onChallengeFriend && (
            <button
              type="button"
              onClick={onChallengeFriend}
              disabled={isStartingChallenge}
              className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-tg-button font-semibold text-tg-button-text shadow-sm transition-opacity hover:opacity-90 active:scale-[0.99] disabled:pointer-events-none disabled:opacity-50"
            >
              <Swords className={`h-4 w-4 ${isStartingChallenge ? 'animate-spin' : ''}`} />
              <span>{isStartingChallenge ? 'Creating Challenge...' : 'Challenge a Friend'}</span>
            </button>
          )}

          {onBattleFriend && (
            <button
              type="button"
              onClick={onBattleFriend}
              disabled={isStartingBattle}
              className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-tg-button font-semibold text-tg-button-text shadow-sm transition-opacity hover:opacity-90 active:scale-[0.99] disabled:pointer-events-none disabled:opacity-50"
            >
              <Zap className={`h-4 w-4 ${isStartingBattle ? 'animate-spin' : ''}`} />
              <span>{isStartingBattle ? 'Creating Battle...' : 'Battle a Friend'}</span>
            </button>
          )}

          {onViewLeaderboard && (
            <button
              type="button"
              onClick={onViewLeaderboard}
              className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-tg-secondary-bg font-semibold text-tg-hint transition-colors hover:text-tg-text active:opacity-75"
            >
              <Trophy className="h-4 w-4 text-tg-button" />
              <span>Global Leaderboard</span>
            </button>
          )}
        </div>
      )}

      {/* Flagora Pro Upgrade Modal */}
      <ProUpgradeModal
        isOpen={isUpgradeModalOpen}
        onClose={() => setIsUpgradeModalOpen(false)}
        sessionToken={sessionToken ?? null}
        onSuccess={() => {
          onRefetchProfile?.();
          onRefetchProStatus?.();
        }}
      />
    </div>
  );
}
