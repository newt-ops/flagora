import { useState } from 'react';
import { Trophy, Swords, ArrowLeft, Sparkles, Share2, Crown } from './icons.js';
import type { BattleFinishedPayload, BattleInfoResponse, GroupPodiumItem } from '@flagora/shared';
import {
  getBattleViewerPerspective,
  getBattlePerspectiveHeading,
  getInitials,
  formatGroupVictoryShareText,
} from './battleHelpers.js';
import { getRatingDeltaDisplay, checkTierPromotion } from './rankHelpers.js';
import { TierBadge } from './TierBadge.js';

interface BattleResultScreenProps {
  battleId: string;
  finishedPayload?: BattleFinishedPayload | null;
  battleInfo?: BattleInfoResponse | null;
  currentUserId: number;
  onBattleAgain: () => void;
  onBackToProfile: () => void;
  isStartingBattleAgain?: boolean;
  groupPodium?: GroupPodiumItem[] | null;
}

export function BattleResultScreen({
  battleId,
  finishedPayload,
  battleInfo,
  currentUserId,
  onBattleAgain,
  onBackToProfile,
  isStartingBattleAgain = false,
  groupPodium,
}: BattleResultScreenProps) {
  const [copiedShare, setCopiedShare] = useState(false);

  const isGroup = Boolean(
    groupPodium ||
    battleInfo?.isGroupBattle ||
    (battleInfo?.podium && battleInfo.podium.length > 0)
  );

  const podium = groupPodium || battleInfo?.podium || [];

  const handleShareGroupResults = () => {
    const text = formatGroupVictoryShareText(podium);
    const deepLink = `https://t.me/FlagoraBot?startapp=battle_${battleId}`;
    const tgUrl = `https://t.me/share/url?url=${encodeURIComponent(deepLink)}&text=${encodeURIComponent(text)}`;
    if (typeof window !== 'undefined' && (window as any).Telegram?.WebApp?.openTelegramLink) {
      (window as any).Telegram.WebApp.openTelegramLink(tgUrl);
    } else {
      window.open(tgUrl, '_blank');
    }
    setCopiedShare(true);
    setTimeout(() => setCopiedShare(false), 2000);
  };

  if (isGroup && podium.length > 0) {
    const firstPlace = podium.find((p) => p.rank === 1) || podium[0];
    const secondPlace = podium.find((p) => p.rank === 2) || podium[1];
    const thirdPlace = podium.find((p) => p.rank === 3) || podium[2];
    const runnersUp = podium.filter((p) => p.rank > 3);
    const myResult = podium.find((p) => p.userId === currentUserId);

    return (
      <div className="flex w-full max-w-md mx-auto flex-col items-center gap-4 text-tg-text">
        <div className="flex w-full flex-col items-center rounded-2xl bg-tg-section p-6 text-center shadow-sm">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-amber-400/10 text-amber-400">
            <Trophy className="h-8 w-8" />
          </div>

          <h2 className="mt-4 text-2xl font-extrabold tracking-tight text-tg-text">
            Group Battle Finished!
          </h2>
          <p className="mt-1 text-xs text-tg-hint">
            {podium.length} players competed in the arena
          </p>

          {/* User's placement banner */}
          {myResult && (
            <div className="mt-3.5 flex items-center justify-center gap-2 rounded-xl bg-tg-secondary-bg px-4 py-2 text-xs font-semibold">
              <span className="text-tg-hint">Your Result:</span>
              <span className="font-bold text-tg-button">
                {myResult.rank === 1 ? '🥇 1st Place' : myResult.rank === 2 ? '🥈 2nd Place' : myResult.rank === 3 ? '🥉 3rd Place' : `#${myResult.rank} Place`}
              </span>
              <span className="text-tg-hint">•</span>
              <span className="font-bold text-tg-text">{myResult.score} pts</span>
              <span className="text-tg-hint">•</span>
              <span className="font-bold text-amber-400">+{myResult.pinsEarned} 🪙</span>
            </div>
          )}

          {/* Olympic 3-Tier Podium */}
          <div className="mt-6 flex w-full items-end justify-center gap-2 pt-8">
            {/* 2nd Place Pillar */}
            {secondPlace && (
              <div className="flex flex-1 flex-col items-center">
                <div className="relative mb-2 flex flex-col items-center">
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-300/20 text-slate-200">
                    {secondPlace.photoUrl ? (
                      <img
                        src={secondPlace.photoUrl}
                        alt={secondPlace.displayName}
                        className="h-10 w-10 rounded-full object-cover"
                      />
                    ) : (
                      <span className="text-sm font-bold">{getInitials(secondPlace.displayName)}</span>
                    )}
                  </div>
                  <span className="absolute -bottom-1 -right-1 text-sm">🥈</span>
                </div>
                <p className="max-w-[70px] truncate text-[11px] font-bold text-tg-text">
                  {secondPlace.displayName}
                </p>
                <span className="text-[10px] text-tg-hint">{secondPlace.score} pts</span>
                <span className="mt-0.5 text-[9px] font-bold text-amber-400">+{secondPlace.pinsEarned} 🪙</span>
                <div className="mt-2 flex h-24 w-full flex-col items-center justify-center rounded-t-xl bg-slate-300/15 border-t border-slate-300/30">
                  <span className="text-xl font-black text-slate-300">2</span>
                </div>
              </div>
            )}

            {/* 1st Place Pillar (Gold - Tallest) */}
            {firstPlace && (
              <div className="flex flex-1 flex-col items-center">
                <div className="relative mb-2 flex flex-col items-center">
                  <span className="mb-0.5 text-amber-400">
                    <Crown className="h-4 w-4" />
                  </span>
                  <div className="flex h-14 w-14 items-center justify-center rounded-full bg-amber-400/20 text-amber-300">
                    {firstPlace.photoUrl ? (
                      <img
                        src={firstPlace.photoUrl}
                        alt={firstPlace.displayName}
                        className="h-12 w-12 rounded-full object-cover"
                      />
                    ) : (
                      <span className="text-base font-bold">{getInitials(firstPlace.displayName)}</span>
                    )}
                  </div>
                  <span className="absolute -bottom-1 -right-1 text-base">🥇</span>
                </div>
                <p className="max-w-[80px] truncate text-xs font-bold text-tg-text">
                  {firstPlace.displayName}
                </p>
                <span className="text-[11px] font-bold text-tg-button">{firstPlace.score} pts</span>
                <span className="mt-0.5 text-[10px] font-bold text-amber-400">+{firstPlace.pinsEarned} 🪙</span>
                <div className="mt-2 flex h-32 w-full flex-col items-center justify-center rounded-t-xl bg-amber-400/20 border-t border-amber-400/40">
                  <span className="text-2xl font-black text-amber-400">1</span>
                </div>
              </div>
            )}

            {/* 3rd Place Pillar */}
            {thirdPlace && (
              <div className="flex flex-1 flex-col items-center">
                <div className="relative mb-2 flex flex-col items-center">
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-amber-700/20 text-amber-500">
                    {thirdPlace.photoUrl ? (
                      <img
                        src={thirdPlace.photoUrl}
                        alt={thirdPlace.displayName}
                        className="h-10 w-10 rounded-full object-cover"
                      />
                    ) : (
                      <span className="text-sm font-bold">{getInitials(thirdPlace.displayName)}</span>
                    )}
                  </div>
                  <span className="absolute -bottom-1 -right-1 text-sm">🥉</span>
                </div>
                <p className="max-w-[70px] truncate text-[11px] font-bold text-tg-text">
                  {thirdPlace.displayName}
                </p>
                <span className="text-[10px] text-tg-hint">{thirdPlace.score} pts</span>
                <span className="mt-0.5 text-[9px] font-bold text-amber-400">+{thirdPlace.pinsEarned} 🪙</span>
                <div className="mt-2 flex h-16 w-full flex-col items-center justify-center rounded-t-xl bg-amber-700/15 border-t border-amber-700/30">
                  <span className="text-lg font-black text-amber-600">3</span>
                </div>
              </div>
            )}
          </div>

          {/* 4th+ Place Standings Table */}
          {runnersUp.length > 0 && (
            <div className="mt-4 flex w-full flex-col gap-1.5 rounded-xl bg-tg-secondary-bg p-3">
              <span className="text-left text-[10px] font-bold uppercase tracking-wider text-tg-hint">
                Other Standings
              </span>
              {runnersUp.map((r) => {
                const isMe = r.userId === currentUserId;
                return (
                  <div
                    key={r.userId}
                    className={`flex items-center justify-between rounded-lg px-2.5 py-1.5 text-xs ${
                      isMe ? 'bg-tg-button/15 font-bold text-tg-button' : 'text-tg-text'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span className="w-5 text-left text-tg-hint">#{r.rank}</span>
                      <span className="max-w-[140px] truncate">{r.displayName}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span>{r.score} pts</span>
                      <span className="text-amber-400 font-bold">+{r.pinsEarned} 🪙</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Action buttons */}
          <div className="mt-6 flex w-full flex-col gap-2.5">
            <button
              type="button"
              onClick={handleShareGroupResults}
              className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-tg-button font-bold text-tg-button-text shadow-sm transition-opacity hover:opacity-90 active:opacity-75"
            >
              <Share2 className="h-4 w-4" />
              <span>{copiedShare ? 'Opening Share...' : 'Share Results to Group'}</span>
            </button>

            <button
              type="button"
              onClick={onBackToProfile}
              className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-tg-secondary-bg text-sm font-semibold text-tg-hint transition-colors hover:text-tg-text active:opacity-75"
            >
              <ArrowLeft className="h-4 w-4" />
              <span>Back to Profile</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Fallback to 1v1 Battle Result Screen
  const winner = finishedPayload?.winner || battleInfo?.winner || null;
  const challengerUserId =
    finishedPayload?.challengerResult.userId || battleInfo?.challengerUserId || 0;
  const opponentUserId =
    finishedPayload?.opponentResult.userId || battleInfo?.opponentUserId || 0;

  const perspective = getBattleViewerPerspective(
    {
      winner,
      challengerUserId,
      opponentUserId,
    },
    currentUserId,
  );

  const challengerName =
    finishedPayload?.challengerResult.displayName ||
    battleInfo?.challengerDisplayName ||
    'Challenger';
  const opponentName =
    finishedPayload?.opponentResult.displayName ||
    battleInfo?.opponentDisplayName ||
    'Opponent';

  const heading = getBattlePerspectiveHeading(
    perspective,
    winner === 'challenger' ? challengerName : opponentName,
  );

  const isChallengerViewer = challengerUserId === currentUserId;
  const isOpponentViewer = opponentUserId === currentUserId;

  const challengerWon = winner === 'challenger';
  const opponentWon = winner === 'opponent';

  const challengerPhoto =
    finishedPayload?.challengerResult.photoUrl || battleInfo?.challengerPhotoUrl || null;
  const opponentPhoto =
    finishedPayload?.opponentResult.photoUrl || battleInfo?.opponentPhotoUrl || null;

  const challengerScore =
    finishedPayload?.challengerScore ?? battleInfo?.challengerScore ?? 0;
  const opponentScore =
    finishedPayload?.opponentScore ?? battleInfo?.opponentScore ?? 0;

  const challengerCorrect =
    finishedPayload?.challengerResult.correctCount ??
    battleInfo?.challengerResult?.correctCount ??
    0;
  const challengerTotal =
    finishedPayload?.challengerResult.totalFlags ??
    battleInfo?.challengerResult?.totalFlags ??
    10;

  const opponentCorrect =
    finishedPayload?.opponentResult.correctCount ??
    battleInfo?.opponentResult?.correctCount ??
    0;
  const opponentTotal =
    finishedPayload?.opponentResult.totalFlags ??
    battleInfo?.opponentResult?.totalFlags ??
    10;

  const challengerResult =
    finishedPayload?.challengerResult || battleInfo?.challengerResult || null;
  const opponentResult =
    finishedPayload?.opponentResult || battleInfo?.opponentResult || null;

  const viewerResult = isChallengerViewer
    ? challengerResult
    : isOpponentViewer
    ? opponentResult
    : null;

  const viewerDelta = viewerResult?.ratingDelta !== undefined
    ? getRatingDeltaDisplay(viewerResult.ratingDelta)
    : null;

  const challengerDelta = challengerResult?.ratingDelta !== undefined
    ? getRatingDeltaDisplay(challengerResult.ratingDelta)
    : null;

  const opponentDelta = opponentResult?.ratingDelta !== undefined
    ? getRatingDeltaDisplay(opponentResult.ratingDelta)
    : null;

  const promotionMoment = checkTierPromotion(
    viewerResult?.newRating,
    viewerResult?.ratingDelta,
  );

  const challengerInitial = getInitials(challengerName);
  const opponentInitial = getInitials(opponentName);

  return (
    <div className="flex w-full max-w-md mx-auto flex-col items-center gap-4 text-tg-text">
      {promotionMoment.isPromoted && promotionMoment.newTier && (
        <div
          data-testid="battle-promotion-banner"
          className="flex w-full items-center justify-center gap-2 rounded-2xl bg-tg-button/15 p-3.5 text-sm font-bold text-tg-button"
        >
          <Sparkles className="h-4 w-4 text-tg-button" />
          <span>Promoted to {promotionMoment.newTier}!</span>
        </div>
      )}

      <div className="flex w-full flex-col items-center rounded-2xl bg-tg-section p-6 text-center shadow-sm">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-tg-button/10 text-tg-button">
          <Trophy className="h-8 w-8" />
        </div>

        <h2 className="mt-4 text-2xl font-extrabold tracking-tight text-tg-text">
          {heading.title}
        </h2>
        <p className="mt-1 text-xs text-tg-hint">{heading.subtitle}</p>

        {viewerResult && viewerDelta && (
          <div
            data-testid="battle-rating-change"
            className="mt-3.5 flex items-center justify-center gap-2 rounded-xl bg-tg-secondary-bg px-3.5 py-1.5 text-xs font-semibold"
          >
            <span className="text-tg-hint">Rating:</span>
            <span className="font-bold text-tg-text">
              {viewerResult.newRating !== undefined ? viewerResult.newRating.toLocaleString() : '—'}
            </span>
            <span className={`font-bold ${viewerDelta.colorClass}`}>
              ({viewerDelta.text})
            </span>
            {viewerResult.tier && (
              <TierBadge tier={viewerResult.tier} size="xs" />
            )}
          </div>
        )}

        <div className="mt-6 grid w-full grid-cols-2 gap-3">
          <div
            className={`flex flex-col items-center rounded-xl bg-tg-secondary-bg p-4 transition-all ${
              challengerWon ? 'bg-tg-button/10 shadow-sm' : ''
            }`}
          >
            <div className="relative flex h-16 w-16 items-center justify-center">
              {challengerPhoto ? (
                <img
                  src={challengerPhoto}
                  alt={challengerName}
                  className="h-14 w-14 rounded-full object-cover bg-tg-section"
                />
              ) : (
                <div
                  className="flex h-14 w-14 items-center justify-center rounded-full bg-tg-button text-xl font-bold text-tg-button-text"
                >
                  {challengerInitial}
                </div>
              )}
              {challengerWon && (
                <span className="absolute -bottom-1 -right-1 z-10 flex h-5 w-5 items-center justify-center rounded-full bg-tg-button text-tg-button-text">
                  <Trophy className="h-3 w-3" />
                </span>
              )}
            </div>

            <p className="mt-2.5 max-w-[120px] truncate text-xs font-bold text-tg-text">
              {challengerName}
            </p>
            <p className="text-[11px] text-tg-hint">
              {isChallengerViewer ? 'You' : 'Host'}
            </p>

            <div className="mt-3 flex items-baseline gap-1">
              <span className="text-2xl font-extrabold text-tg-text">
                {challengerScore.toLocaleString()}
              </span>
              <span className="text-[11px] font-semibold text-tg-hint">pts</span>
            </div>

            <span className="mt-1 text-[11px] text-tg-hint">
              {challengerCorrect}/{challengerTotal} correct
            </span>

            {challengerDelta && (
              <div className="mt-1.5 flex items-center gap-1 text-xs">
                <span className={`font-bold ${challengerDelta.colorClass}`}>
                  {challengerDelta.text}
                </span>
                <span className="text-[10px] text-tg-hint">RR</span>
                {challengerResult?.tier && (
                  <TierBadge tier={challengerResult.tier} size="xs" showLabel={false} />
                )}
              </div>
            )}

            {challengerWon && (
              <span className="mt-2 rounded-full bg-tg-button/15 px-2 py-0.5 text-[10px] font-bold text-tg-button">
                Winner
              </span>
            )}
          </div>

          <div
            className={`flex flex-col items-center rounded-xl bg-tg-secondary-bg p-4 transition-all ${
              opponentWon ? 'bg-tg-button/10 shadow-sm' : ''
            }`}
          >
            <div className="relative flex h-16 w-16 items-center justify-center">
              {opponentPhoto ? (
                <img
                  src={opponentPhoto}
                  alt={opponentName}
                  className="h-14 w-14 rounded-full object-cover bg-tg-section"
                />
              ) : (
                <div
                  className="flex h-14 w-14 items-center justify-center rounded-full bg-tg-button text-xl font-bold text-tg-button-text"
                >
                  {opponentInitial}
                </div>
              )}
              {opponentWon && (
                <span className="absolute -bottom-1 -right-1 z-10 flex h-5 w-5 items-center justify-center rounded-full bg-tg-button text-tg-button-text">
                  <Trophy className="h-3 w-3" />
                </span>
              )}
            </div>

            <p className="mt-2.5 max-w-[120px] truncate text-xs font-bold text-tg-text">
              {opponentName}
            </p>
            <p className="text-[11px] text-tg-hint">
              {isOpponentViewer ? 'You' : 'Opponent'}
            </p>

            <div className="mt-3 flex items-baseline gap-1">
              <span className="text-2xl font-extrabold text-tg-text">
                {opponentScore.toLocaleString()}
              </span>
              <span className="text-[11px] font-semibold text-tg-hint">pts</span>
            </div>

            <span className="mt-1 text-[11px] text-tg-hint">
              {opponentCorrect}/{opponentTotal} correct
            </span>

            {opponentDelta && (
              <div className="mt-1.5 flex items-center gap-1 text-xs">
                <span className={`font-bold ${opponentDelta.colorClass}`}>
                  {opponentDelta.text}
                </span>
                <span className="text-[10px] text-tg-hint">RR</span>
                {opponentResult?.tier && (
                  <TierBadge tier={opponentResult.tier} size="xs" showLabel={false} />
                )}
              </div>
            )}

            {opponentWon && (
              <span className="mt-2 rounded-full bg-tg-button/15 px-2 py-0.5 text-[10px] font-bold text-tg-button">
                Winner
              </span>
            )}
          </div>
        </div>

        <div className="mt-6 flex w-full flex-col gap-2.5">
          <button
            type="button"
            onClick={onBattleAgain}
            disabled={isStartingBattleAgain}
            className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-tg-button font-bold text-tg-button-text shadow-sm transition-opacity hover:opacity-90 active:opacity-75 disabled:pointer-events-none disabled:opacity-50"
          >
            <Swords className={`h-4 w-4 ${isStartingBattleAgain ? 'animate-spin' : ''}`} />
            <span>{isStartingBattleAgain ? 'Creating Battle...' : 'Battle Again'}</span>
          </button>

          <button
            type="button"
            onClick={onBackToProfile}
            className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-tg-secondary-bg text-sm font-semibold text-tg-hint transition-colors hover:text-tg-text active:opacity-75"
          >
            <ArrowLeft className="h-4 w-4" />
            <span>Back to Profile</span>
          </button>
        </div>
      </div>
    </div>
  );
}
