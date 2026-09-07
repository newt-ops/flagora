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
  Gamepad2,
  Users,
  Gift,
  Share2,
  Copy,
  Check,
  Loader2,
} from 'lucide-react';
import {
  type PlayerProfile,
  type DailyChallengeStatusResponse,
  type StreakStatusResponse,
  getDisplayName,
} from '@flagora/shared';
import { getProfileStreakDisplay } from './streakDisplayHelpers.js';
import { getDailyResultSummary } from './dailyChallengeHelpers.js';
import { StreakSaveBanner } from './StreakSaveBanner.js';
import { useBonusCoinsAd } from '../hooks/useBonusCoinsAd.js';
import { getBonusAdsButtonText } from './rewardUiHelpers.js';

export { getDisplayName };

interface ProfileCardProps {
  profile: PlayerProfile;
  dailyStatus?: DailyChallengeStatusResponse | null;
  streakStatus?: StreakStatusResponse | null;
  sessionToken?: string | null;
  onPlay?: () => void;
  onStartDaily?: () => void;
  onChallengeFriend?: () => void;
  onBattleFriend?: () => void;
  onViewLeaderboard?: () => void;
  onViewDailyLeaderboard?: () => void;
  onRefetchProfile?: () => void;
  onRefetchStreakStatus?: () => void;
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
  sessionToken,
  onPlay,
  onStartDaily,
  onChallengeFriend,
  onBattleFriend,
  onViewLeaderboard,
  onViewDailyLeaderboard,
  onRefetchProfile,
  onRefetchStreakStatus,
  isStarting = false,
  isStartingDaily = false,
  isStartingChallenge = false,
  isStartingBattle = false,
  showGameActions = true,
}: ProfileCardProps) {
  const [referralCopied, setReferralCopied] = useState(false);
  const displayName = getDisplayName(profile);
  const initial = profile.firstName ? profile.firstName.charAt(0).toUpperCase() : 'P';
  const streakInfo = getProfileStreakDisplay(profile.currentStreak, profile.longestStreak);
  const dailySummary = getDailyResultSummary(dailyStatus?.result ?? null);

  const {
    isWatchingAd,
    feedback: bonusFeedback,
    remainingAds,
    isCapReached,
    handleWatchAd,
  } = useBonusCoinsAd({
    sessionToken,
    onRewardSuccess: onRefetchProfile,
  });

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
      setReferralCopied(true);
      setTimeout(() => setReferralCopied(false), 2000);
    } catch {
      void 0;
    }
  };

  const handleShareReferral = () => {
    const text = 'Join me on Flagora! Test your flag knowledge, battle real players in real-time, and get +50 coins!';
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

  return (
    <div className="w-full max-w-sm rounded-2xl bg-tg-section border border-tg-separator p-6 text-tg-text shadow-sm">
      <div className="flex flex-col items-center text-center">
        {profile.photoUrl ? (
          <img
            src={profile.photoUrl}
            alt={displayName}
            className="h-20 w-20 rounded-full object-cover ring-2 ring-tg-button"
          />
        ) : (
          <div className="flex h-20 w-20 items-center justify-center rounded-full bg-tg-button text-3xl font-semibold text-tg-button-text">
            {initial}
          </div>
        )}

        <h2 className="mt-4 text-xl font-bold text-tg-text">
          {profile.firstName || displayName}
        </h2>
        {profile.username && (
          <p className="text-xs font-medium text-tg-hint">
            @{profile.username.replace(/^@/, '')}
          </p>
        )}
        <p className="mt-1 text-xs font-semibold text-tg-hint">Level {profile.level} Player</p>
      </div>

      <div className="mt-5 flex items-center justify-between rounded-xl bg-tg-secondary-bg border border-tg-separator px-4 py-3">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-tg-button/10 text-tg-button ring-1 ring-tg-button/20">
            <Flame className="h-5 w-5 fill-current text-tg-button" />
          </div>
          <div className="text-left">
            <p className="text-sm font-bold text-tg-text">{streakInfo.title}</p>
            <p className="text-xs text-tg-hint">{streakInfo.subtitle}</p>
          </div>
        </div>
        {streakInfo.isActive && (
          <span className="rounded-full bg-tg-button/15 px-2.5 py-0.5 text-xs font-semibold text-tg-button ring-1 ring-tg-button/30">
            Active
          </span>
        )}
      </div>

      {streakStatus?.isAtRisk && (
        <div className="mt-3">
          <StreakSaveBanner
            sessionToken={sessionToken}
            streakStatus={streakStatus}
            onSuccess={() => {
              onRefetchProfile?.();
              onRefetchStreakStatus?.();
            }}
          />
        </div>
      )}

      <div className="mt-3 grid grid-cols-2 gap-3">
        <div className="flex flex-col items-center rounded-xl bg-tg-secondary-bg border border-tg-separator p-3 text-center">
          <div className="flex items-center gap-1.5 text-tg-hint">
            <Coins className="h-4 w-4 text-tg-button" />
            <span className="text-xs font-medium">Coins</span>
          </div>
          <p className="mt-1.5 text-lg font-bold text-tg-text">{profile.coins.toLocaleString()}</p>
        </div>

        <div className="flex flex-col items-center rounded-xl bg-tg-secondary-bg border border-tg-separator p-3 text-center">
          <div className="flex items-center gap-1.5 text-tg-hint">
            <Zap className="h-4 w-4 text-tg-button" />
            <span className="text-xs font-medium">XP</span>
          </div>
          <p className="mt-1.5 text-lg font-bold text-tg-text">{profile.xp.toLocaleString()}</p>
        </div>

        <div className="flex flex-col items-center rounded-xl bg-tg-secondary-bg border border-tg-separator p-3 text-center">
          <div className="flex items-center gap-1.5 text-tg-hint">
            <Trophy className="h-4 w-4 text-tg-button" />
            <span className="text-xs font-medium">Best Score</span>
          </div>
          <p className="mt-1.5 text-lg font-bold text-tg-text">{profile.bestScore.toLocaleString()}</p>
        </div>

        <div className="flex flex-col items-center rounded-xl bg-tg-secondary-bg border border-tg-separator p-3 text-center">
          <div className="flex items-center gap-1.5 text-tg-hint">
            <Gamepad2 className="h-4 w-4 text-tg-button" />
            <span className="text-xs font-medium">Games Played</span>
          </div>
          <p className="mt-1.5 text-lg font-bold text-tg-text">{profile.gamesPlayed.toLocaleString()}</p>
        </div>
      </div>

      <div className="mt-4 flex w-full flex-col rounded-xl bg-tg-secondary-bg border border-tg-separator p-4 text-left">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-tg-button/10 text-tg-button ring-1 ring-tg-button/20">
              <Gift className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm font-bold text-tg-text">Invite & Earn</p>
              <p className="text-[11px] text-tg-hint">+100 coins for you, +50 for friends</p>
            </div>
          </div>
          <div className="flex items-center gap-1 rounded-full bg-tg-button/15 px-2.5 py-0.5 text-xs font-bold text-tg-button">
            <Users className="h-3.5 w-3.5" />
            <span>{profile.referralCount ?? 0}</span>
          </div>
        </div>

        <div className="mt-3.5 grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={handleCopyReferral}
            className="flex h-10 items-center justify-center gap-1.5 rounded-lg bg-tg-section border border-tg-separator px-3 text-xs font-bold text-tg-text transition-opacity hover:opacity-90 active:opacity-75"
          >
            {referralCopied ? (
              <>
                <Check className="h-3.5 w-3.5 text-emerald-400" />
                <span className="text-emerald-400">Copied!</span>
              </>
            ) : (
              <>
                <Copy className="h-3.5 w-3.5 text-tg-hint" />
                <span>Copy Link</span>
              </>
            )}
          </button>
          <button
            type="button"
            onClick={handleShareReferral}
            className="flex h-10 items-center justify-center gap-1.5 rounded-lg bg-tg-button px-3 text-xs font-bold text-tg-button-text shadow-sm transition-opacity hover:opacity-90 active:opacity-75"
          >
            <Share2 className="h-3.5 w-3.5" />
            <span>Share Link</span>
          </button>
        </div>
      </div>

      <div className="mt-4 flex w-full flex-col rounded-xl bg-tg-secondary-bg border border-tg-separator p-4 text-left">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-tg-button/10 text-tg-button ring-1 ring-tg-button/20">
              <Coins className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm font-bold text-tg-text">Bonus Coins</p>
              <p className="text-[11px] text-tg-hint">+50 coins per ad</p>
            </div>
          </div>
          <span
            data-testid="bonus-coins-remaining-badge"
            className="rounded-full bg-tg-button/15 px-2.5 py-0.5 text-xs font-bold text-tg-button"
          >
            {remainingAds > 0 ? `${remainingAds}/5 remaining today` : 'Daily cap reached (5/5)'}
          </span>
        </div>

        <button
          type="button"
          onClick={handleWatchAd}
          disabled={isCapReached || isWatchingAd || !sessionToken}
          data-testid="watch-bonus-ad-button"
          className="mt-3.5 flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-tg-button px-3 text-xs font-bold text-tg-button-text shadow-sm transition-opacity hover:opacity-90 active:opacity-75 disabled:pointer-events-none disabled:opacity-50"
        >
          {isWatchingAd ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Coins className="h-3.5 w-3.5" />
          )}
          <span>{getBonusAdsButtonText(remainingAds, isWatchingAd)}</span>
        </button>

        {bonusFeedback && (
          <div
            data-testid="bonus-coins-feedback"
            className={`mt-2.5 rounded-lg px-2.5 py-1.5 text-xs font-medium ${
              bonusFeedback.isSuccess
                ? 'bg-emerald-500/15 text-emerald-400'
                : 'bg-amber-500/15 text-amber-300'
            }`}
          >
            {bonusFeedback.text}
          </div>
        )}
      </div>

      {showGameActions && (
        <>
          <div className="mt-4 rounded-xl bg-tg-secondary-bg p-4 border border-tg-separator">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-tg-button/10 text-tg-button ring-1 ring-tg-button/20">
                  <Calendar className="h-4 w-4" />
                </div>
                <div className="text-left">
                  <p className="text-sm font-bold text-tg-text">Daily Challenge</p>
                  <p className="text-[11px] text-tg-hint">Same 10 flags for all players</p>
                </div>
              </div>
              {dailyStatus?.attempted ? (
                <span className="flex items-center gap-1 rounded-full bg-tg-button/15 px-2.5 py-0.5 text-[11px] font-bold text-tg-button">
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
              <div className="mt-3 flex flex-col gap-2.5">
                {dailySummary ? (
                  <div className="flex items-center justify-between rounded-lg bg-tg-section border border-tg-separator px-3 py-2 text-xs">
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
                    className="flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-tg-button/15 font-bold text-tg-button border border-tg-button/30 transition-opacity hover:opacity-90 active:opacity-75"
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
                    className="flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-tg-button font-bold text-tg-button-text shadow-sm transition-opacity hover:opacity-90 active:opacity-75 disabled:pointer-events-none disabled:opacity-50"
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
              className="mt-4 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-tg-button font-bold text-tg-button-text shadow-sm transition-opacity hover:opacity-90 active:opacity-75 disabled:pointer-events-none disabled:opacity-50"
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
              className="mt-2.5 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-tg-button font-bold text-tg-button-text shadow-sm transition-opacity hover:opacity-90 active:opacity-75 disabled:pointer-events-none disabled:opacity-50"
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
              className="mt-2.5 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-tg-button font-bold text-tg-button-text shadow-sm transition-opacity hover:opacity-90 active:opacity-75 disabled:pointer-events-none disabled:opacity-50"
            >
              <Zap className={`h-4 w-4 ${isStartingBattle ? 'animate-spin' : ''}`} />
              <span>{isStartingBattle ? 'Creating Battle...' : 'Battle a Friend'}</span>
            </button>
          )}

          {onViewLeaderboard && (
            <button
              type="button"
              onClick={onViewLeaderboard}
              className="mt-2.5 flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-tg-secondary-bg border border-tg-separator font-semibold text-tg-hint transition-colors hover:text-tg-text active:opacity-75"
            >
              <Trophy className="h-4 w-4 text-tg-button" />
              <span>Global Leaderboard</span>
            </button>
          )}
        </>
      )}
    </div>
  );
}
