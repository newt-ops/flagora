import { Trophy, Swords, ArrowLeft, Sparkles } from 'lucide-react';
import type { BattleFinishedPayload, BattleInfoResponse } from '@flagora/shared';
import {
  getBattleViewerPerspective,
  getBattlePerspectiveHeading,
  getInitials,
} from './battleHelpers.js';
import { getAvatarFrameClass } from './cosmeticHelpers.js';
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
  userAvatarFrame?: string | null;
}

export function BattleResultScreen({
  finishedPayload,
  battleInfo,
  currentUserId,
  onBattleAgain,
  onBackToProfile,
  isStartingBattleAgain = false,
  userAvatarFrame,
}: BattleResultScreenProps) {
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
  const challengerFrame = isChallengerViewer ? getAvatarFrameClass(userAvatarFrame) : '';
  const opponentFrame = isOpponentViewer ? getAvatarFrameClass(userAvatarFrame) : '';

  return (
    <div className="flex w-full max-w-sm flex-col items-center gap-4 text-tg-text">
      {promotionMoment.isPromoted && promotionMoment.newTier && (
        <div
          data-testid="battle-promotion-banner"
          className="flex w-full items-center justify-center gap-2 rounded-2xl bg-tg-button/15 p-3.5 text-sm font-bold text-tg-button ring-1 ring-tg-button/30"
        >
          <Sparkles className="h-4 w-4 text-tg-button" />
          <span>Promoted to {promotionMoment.newTier}!</span>
        </div>
      )}

      <div className="flex w-full flex-col items-center rounded-2xl bg-tg-section border border-tg-separator p-6 text-center shadow-sm">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-tg-button/10 text-tg-button ring-1 ring-tg-button/20">
          <Trophy className="h-8 w-8" />
        </div>

        <h2 className="mt-4 text-2xl font-extrabold tracking-tight text-tg-text">
          {heading.title}
        </h2>
        <p className="mt-1 text-xs text-tg-hint">{heading.subtitle}</p>

        {viewerResult && viewerDelta && (
          <div
            data-testid="battle-rating-change"
            className="mt-3.5 flex items-center justify-center gap-2 rounded-xl bg-tg-secondary-bg border border-tg-separator px-3.5 py-1.5 text-xs font-semibold"
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
            className={`flex flex-col items-center rounded-xl bg-tg-secondary-bg border p-4 transition-all ${
              challengerWon
                ? 'border-tg-button shadow-sm'
                : 'border-tg-separator'
            }`}
          >
            <div className="relative">
              {challengerPhoto ? (
                <img
                  src={challengerPhoto}
                  alt={challengerName}
                  className={`h-14 w-14 rounded-full object-cover bg-tg-section ${
                    challengerFrame ? challengerFrame : 'ring-2 ring-tg-button'
                  }`}
                />
              ) : (
                <div
                  className={`flex h-14 w-14 items-center justify-center rounded-full bg-tg-button text-xl font-bold text-tg-button-text ${
                    challengerFrame ? challengerFrame : ''
                  }`}
                >
                  {challengerInitial}
                </div>
              )}
              {challengerWon && (
                <span className="absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-tg-button text-tg-button-text ring-2 ring-tg-section">
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
              <span className="mt-2 rounded-full bg-tg-button/15 px-2 py-0.5 text-[10px] font-bold text-tg-button border border-tg-button/30">
                Winner
              </span>
            )}
          </div>

          <div
            className={`flex flex-col items-center rounded-xl bg-tg-secondary-bg border p-4 transition-all ${
              opponentWon
                ? 'border-tg-button shadow-sm'
                : 'border-tg-separator'
            }`}
          >
            <div className="relative">
              {opponentPhoto ? (
                <img
                  src={opponentPhoto}
                  alt={opponentName}
                  className={`h-14 w-14 rounded-full object-cover bg-tg-section ${
                    opponentFrame ? opponentFrame : 'ring-2 ring-tg-button'
                  }`}
                />
              ) : (
                <div
                  className={`flex h-14 w-14 items-center justify-center rounded-full bg-tg-button text-xl font-bold text-tg-button-text ${
                    opponentFrame ? opponentFrame : ''
                  }`}
                >
                  {opponentInitial}
                </div>
              )}
              {opponentWon && (
                <span className="absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-tg-button text-tg-button-text ring-2 ring-tg-section">
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
              <span className="mt-2 rounded-full bg-tg-button/15 px-2 py-0.5 text-[10px] font-bold text-tg-button border border-tg-button/30">
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
            className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-tg-secondary-bg border border-tg-separator text-sm font-semibold text-tg-hint transition-colors hover:text-tg-text active:opacity-75"
          >
            <ArrowLeft className="h-4 w-4" />
            <span>Back to Profile</span>
          </button>
        </div>
      </div>
    </div>
  );
}
