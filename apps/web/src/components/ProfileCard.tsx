import { useState } from 'react';
import {
  Play,
  Flame,
  Trophy,
  Calendar,
  CheckCircle2,
  Swords,
  Zap,
  Coins as Pins,
  Gamepad2,
  Users,
  Gift,
  Share2,
  Copy,
  Check,
  Award,
  Crown,
} from './icons.js';
import {
  type PlayerProfile,
  type DailyChallengeStatusResponse,
  type StreakStatusResponse,
  type RankStatusResponse,
  type PlayerBadgeResponseItem,
  type ProStatusResponse,
  getDisplayName,
} from '@flagora/shared';
import { getProfileStreakDisplay } from './streakDisplayHelpers.js';
import { getDailyResultSummary } from './dailyChallengeHelpers.js';
import { StreakSaveBanner } from './StreakSaveBanner.js';
import { formatSeasonName, getTierIcon } from './rankHelpers.js';
import { BadgeShowcase } from './BadgeShowcase.js';
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
  badges?: PlayerBadgeResponseItem[];
  isLoadingBadges?: boolean;
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

function getTierContainerStyles(tier: string) {
  switch (tier) {
    case 'Legend':
      return 'border-purple-500/40 bg-gradient-to-br from-purple-500/15 via-tg-secondary-bg to-tg-secondary-bg text-purple-400';
    case 'Diamond':
      return 'border-blue-400/40 bg-gradient-to-br from-blue-500/15 via-tg-secondary-bg to-tg-secondary-bg text-blue-400';
    case 'Platinum':
      return 'border-cyan-400/40 bg-gradient-to-br from-cyan-500/15 via-tg-secondary-bg to-tg-secondary-bg text-cyan-400';
    case 'Gold':
      return 'border-amber-400/40 bg-gradient-to-br from-amber-500/15 via-tg-secondary-bg to-tg-secondary-bg text-amber-400';
    case 'Silver':
      return 'border-slate-300/40 bg-gradient-to-br from-slate-400/15 via-tg-secondary-bg to-tg-secondary-bg text-slate-300';
    case 'Bronze':
    default:
      return 'border-amber-700/30 bg-gradient-to-br from-amber-800/10 via-tg-secondary-bg to-tg-secondary-bg text-amber-600';
  }
}

export function ProfileCard({
  profile,
  dailyStatus,
  streakStatus,
  rankStatus,
  proStatus = null,
  badges = [],
  isLoadingBadges = false,
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
  const xpToNextLevel = 500 - xpInCurrentLevel;

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
    <div className="flex w-full max-w-md mx-auto flex-col gap-3.5 text-tg-text">
      {/* Seasonal / Run Badge Unlock Banner */}
      {rankStatus?.newBadges && rankStatus.newBadges.length > 0 && (
        <div className="flex w-full flex-col gap-2">
          {rankStatus.newBadges.map((badge) => (
            <div
              key={badge.badgeId}
              data-testid="profile-badge-unlock-banner"
              className="flex w-full items-center justify-center gap-2 rounded-2xl bg-tg-button/15 border border-tg-button/30 p-3.5 text-sm font-bold text-tg-button shadow-sm"
            >
              <Award className="h-4 w-4 text-tg-button" />
              <span>Badge Unlocked: {badge.name}!</span>
            </div>
          ))}
        </div>
      )}

      {/* Hero Identity Card */}
      <div className="relative w-full rounded-3xl bg-tg-section/95 text-tg-text shadow-sm p-5 sm:p-6 border border-tg-separator/30 backdrop-blur-sm overflow-hidden">
        {/* Subtle decorative glow accents */}
        <div className="absolute -top-12 -right-12 h-36 w-36 rounded-full bg-tg-button/10 blur-2xl pointer-events-none" />
        <div className="absolute -bottom-12 -left-12 h-36 w-36 rounded-full bg-[#2AABEE]/10 blur-2xl pointer-events-none" />

        <div className="relative z-10 flex flex-col items-center text-center">
          {/* Avatar with Ambient Gradient Ring */}
          <div className="relative flex items-center justify-center">
            <div className="relative h-20 w-20 rounded-full p-1 bg-gradient-to-tr from-tg-button via-[#2AABEE] to-tg-button shadow-md">
              {profile.photoUrl ? (
                <img
                  src={profile.photoUrl}
                  alt={displayName}
                  className="h-full w-full rounded-full object-cover bg-tg-section"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center rounded-full bg-tg-button text-2xl font-black text-tg-button-text">
                  {initial}
                </div>
              )}
            </div>
            {isVerifiedUser && (
              <div className="absolute -bottom-1 -right-1 rounded-full bg-tg-section p-0.5 shadow-sm">
                <VerifiedBadge className="h-5 w-5 text-[#2AABEE]" />
              </div>
            )}
          </div>

          {/* Name & Checkmark */}
          <div className="mt-3 flex items-center justify-center gap-1.5 flex-wrap">
            <h2 className="text-xl font-black text-tg-text tracking-tight">
              {profile.firstName || displayName}
            </h2>
            {isVerifiedUser && (
              <VerifiedBadge className="h-5 w-5 text-[#2AABEE]" />
            )}
          </div>

          {profile.username && (
            <p className="text-xs font-semibold text-tg-hint mt-0.5">
              @{profile.username.replace(/^@/, '')}
            </p>
          )}

          {/* Level and XP Progression Meter */}
          <div className="w-full mt-4 p-3 rounded-2xl bg-tg-secondary-bg/80 border border-tg-separator/20">
            <div className="flex items-center justify-between text-xs font-bold mb-1.5">
              <span className="text-tg-text">Level {currentLevel}</span>
              <span className="text-tg-hint text-[11px] font-medium">
                {xpInCurrentLevel} / 500 XP <span className="text-tg-button font-bold">({xpToNextLevel} to Lvl {currentLevel + 1})</span>
              </span>
            </div>
            <div className="h-2 w-full rounded-full bg-tg-section overflow-hidden p-0.5 border border-tg-separator/30">
              <div
                className="h-full rounded-full bg-gradient-to-r from-tg-button to-[#2AABEE] transition-all duration-500 ease-out"
                style={{ width: `${xpProgressPercent}%` }}
              />
            </div>
          </div>

          {/* Flagora Pro Status or 1-Star Upgrade CTA */}
          {proStatus?.isActive ? (
            <div className="mt-3.5 inline-flex items-center gap-1.5 rounded-full bg-[#2AABEE]/15 border border-[#2AABEE]/30 px-3.5 py-1 text-xs font-bold text-[#2AABEE]">
              <Crown className="h-3.5 w-3.5 fill-current" />
              <span>
                Pro Verified •{' '}
                {proStatus.currentPeriodEnd
                  ? `Active until ${new Date(proStatus.currentPeriodEnd).toLocaleDateString()}`
                  : 'Active'}
              </span>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => {
                triggerHaptic('success');
                setIsUpgradeModalOpen(true);
              }}
              className="mt-3.5 flex items-center justify-between w-full rounded-2xl bg-gradient-to-r from-[#2AABEE]/15 via-tg-button/15 to-[#2AABEE]/5 border border-[#2AABEE]/30 p-3 text-left transition-all hover:border-[#2AABEE]/60 active:scale-[0.99] shadow-sm"
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#2AABEE]/20 text-[#2AABEE]">
                  <VerifiedBadge className="h-5 w-5 text-[#2AABEE]" />
                </div>
                <div className="min-w-0 text-left">
                  <p className="text-xs font-black text-tg-text flex items-center gap-1.5">
                    <span>Get Verified Badge</span>
                    <span className="rounded-full bg-tg-button px-1.5 py-0.5 text-[9px] font-black text-tg-button-text">1 Star</span>
                  </p>
                  <p className="text-[11px] text-tg-hint truncate">Blue checkmark across profile, 1v1 battles & rankings</p>
                </div>
              </div>
              <span className="text-xs font-bold text-tg-button shrink-0 ml-2">Upgrade →</span>
            </button>
          )}
        </div>
      </div>

      {/* Ranked Tier Card */}
      <div
        data-testid="profile-rank-card"
        className={`flex flex-col rounded-2xl border p-4 shadow-sm transition-all backdrop-blur-sm ${getTierContainerStyles(currentTier)}`}
      >
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-tg-section/90 shadow-sm border border-tg-separator/30">
              <TierIcon className="h-6 w-6 fill-current" />
            </div>
            <div className="text-left min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm font-black text-tg-text tracking-tight">
                  {currentTier} Tier
                </span>
                {currentRank ? (
                  <span className="rounded-full bg-tg-section px-2.5 py-0.5 text-[10px] font-black text-tg-text shadow-sm border border-tg-separator/30">
                    #{currentRank}
                  </span>
                ) : (
                  <span className="rounded-full bg-tg-section px-2.5 py-0.5 text-[10px] font-bold text-tg-hint border border-tg-separator/30">
                    Unranked
                  </span>
                )}
              </div>
              <p className="text-xs font-bold text-tg-text mt-0.5">
                {currentRating.toLocaleString()} <span className="text-[11px] font-medium text-tg-hint">Battle Rating</span>
              </p>
            </div>
          </div>

          <div className="flex flex-col items-end text-right shrink-0">
            <span className="text-[10px] font-bold uppercase tracking-wider text-tg-hint">
              Season
            </span>
            <span
              data-testid="profile-season-identifier"
              className="text-xs font-black text-tg-text mt-0.5"
            >
              {seasonName}
            </span>
          </div>
        </div>
      </div>

      {/* Stats Matrix (4 Metric Cards) */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
        <div className="flex flex-col items-center rounded-2xl bg-tg-section/90 border border-tg-separator/20 p-3.5 text-center shadow-sm">
          <div className="flex items-center gap-1.5 text-amber-500">
            <Pins className="h-4 w-4" />
            <span className="text-[11px] font-bold uppercase tracking-wider text-tg-hint">Pins</span>
          </div>
          <p className="mt-1 text-lg font-black text-tg-text tracking-tight">{profile.pins.toLocaleString()}</p>
        </div>

        <div className="flex flex-col items-center rounded-2xl bg-tg-section/90 border border-tg-separator/20 p-3.5 text-center shadow-sm">
          <div className="flex items-center gap-1.5 text-blue-500">
            <Zap className="h-4 w-4" />
            <span className="text-[11px] font-bold uppercase tracking-wider text-tg-hint">Total XP</span>
          </div>
          <p className="mt-1 text-lg font-black text-tg-text tracking-tight">{profile.xp.toLocaleString()}</p>
        </div>

        <div className="flex flex-col items-center rounded-2xl bg-tg-section/90 border border-tg-separator/20 p-3.5 text-center shadow-sm">
          <div className="flex items-center gap-1.5 text-emerald-500">
            <Trophy className="h-4 w-4" />
            <span className="text-[11px] font-bold uppercase tracking-wider text-tg-hint">Best Score</span>
          </div>
          <p className="mt-1 text-lg font-black text-tg-text tracking-tight">{profile.bestScore.toLocaleString()}</p>
        </div>

        <div className="flex flex-col items-center rounded-2xl bg-tg-section/90 border border-tg-separator/20 p-3.5 text-center shadow-sm">
          <div className="flex items-center gap-1.5 text-purple-500">
            <Gamepad2 className="h-4 w-4" />
            <span className="text-[11px] font-bold uppercase tracking-wider text-tg-hint">Games</span>
          </div>
          <p className="mt-1 text-lg font-black text-tg-text tracking-tight">{profile.gamesPlayed.toLocaleString()}</p>
        </div>
      </div>

      {/* Streak Tracker & Protection */}
      <div className="flex items-center justify-between flex-wrap gap-2 rounded-2xl bg-tg-section/90 border border-tg-separator/20 p-4 shadow-sm">
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-orange-500/15 text-orange-500 shadow-inner">
            <Flame className="h-5 w-5 fill-current" />
          </div>
          <div className="text-left min-w-0">
            <p className="text-sm font-extrabold text-tg-text truncate tracking-tight">{streakInfo.title}</p>
            <p className="text-xs text-tg-hint truncate">{streakInfo.subtitle}</p>
          </div>
        </div>
        {streakInfo.isActive && (
          <span className="shrink-0 rounded-full bg-orange-500/15 border border-orange-500/30 px-2.5 py-0.5 text-xs font-bold text-orange-500">
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

      {/* Mastery Badges Showcase */}
      <BadgeShowcase badges={badges} isLoading={isLoadingBadges} />

      {/* Social Referral Hub */}
      <div className="flex w-full flex-col rounded-2xl bg-tg-section/90 border border-tg-separator/20 p-4 sm:p-5 text-left shadow-sm">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-tg-button/15 text-tg-button shadow-inner">
              <Gift className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <h3 className="text-sm font-extrabold text-tg-text truncate tracking-tight">Invite & Earn</h3>
              <p className="text-[11px] text-tg-hint truncate">+100 pins for you, +50 pins for friends</p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 rounded-full bg-tg-button/15 border border-tg-button/30 px-3 py-1 text-xs font-black text-tg-button shrink-0">
            <Users className="h-3.5 w-3.5" />
            <span>{profile.referralCount ?? 0} Friends</span>
          </div>
        </div>

        <div className="mt-3.5 grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => void handleCopyReferral()}
            className="flex h-11 items-center justify-center gap-1.5 rounded-xl bg-tg-secondary-bg px-3 text-xs font-bold text-tg-text border border-tg-separator/30 transition-all hover:bg-tg-secondary-bg/80 active:scale-[0.98] min-w-0 shadow-sm"
          >
            {referralCopied ? (
              <>
                <Check className="h-4 w-4 text-tg-button" />
                <span className="text-tg-button font-bold">Copied!</span>
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
            className="flex h-11 items-center justify-center gap-1.5 rounded-xl bg-tg-button px-3 text-xs font-black text-tg-button-text shadow-sm transition-all hover:opacity-90 active:scale-[0.98] min-w-0"
          >
            <Share2 className="h-4 w-4 shrink-0" />
            <span className="truncate">Share Link</span>
          </button>
        </div>
      </div>

      {/* Conditionally rendered Game Actions for standalone screen embedding */}
      {showGameActions && (
        <div className="mt-2 flex flex-col gap-3">
          <div className="rounded-2xl bg-tg-section/90 border border-tg-separator/20 p-4 shadow-sm">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-tg-button/10 text-tg-button">
                  <Calendar className="h-4 w-4" />
                </div>
                <div className="text-left min-w-0">
                  <p className="text-sm font-bold text-tg-text truncate">Daily Challenge</p>
                  <p className="text-[11px] text-tg-hint truncate">Same 10 flags for all players</p>
                </div>
              </div>
              {dailyStatus?.attempted ? (
                <span className="flex items-center gap-1 rounded-full bg-tg-button/15 px-2.5 py-0.5 text-[11px] font-bold text-tg-button shrink-0">
                  <CheckCircle2 className="h-3 w-3" />
                  Completed
                </span>
              ) : (
                <span className="rounded-full bg-tg-button/15 px-2.5 py-0.5 text-[11px] font-bold text-tg-button shrink-0">
                  Available
                </span>
              )}
            </div>

            {dailyStatus?.attempted ? (
              <div className="mt-3 flex flex-col gap-2.5">
                {dailySummary ? (
                  <div className="flex items-center justify-between rounded-xl bg-tg-secondary-bg px-3 py-2 text-xs">
                    <div>
                      <span className="font-extrabold text-tg-text">{dailySummary.scoreText}</span>
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
                    className="flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-tg-button/15 font-bold text-tg-button transition-opacity hover:opacity-90 active:opacity-75"
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
                    className="flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-tg-button font-bold text-tg-button-text shadow-sm transition-opacity hover:opacity-90 active:opacity-75 disabled:pointer-events-none disabled:opacity-50"
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
              className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-tg-button font-bold text-tg-button-text shadow-sm transition-opacity hover:opacity-90 active:opacity-75 disabled:pointer-events-none disabled:opacity-50"
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
              className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-tg-button font-bold text-tg-button-text shadow-sm transition-opacity hover:opacity-90 active:opacity-75 disabled:pointer-events-none disabled:opacity-50"
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
              className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-tg-button font-bold text-tg-button-text shadow-sm transition-opacity hover:opacity-90 active:opacity-75 disabled:pointer-events-none disabled:opacity-50"
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
