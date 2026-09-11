import { Trophy, Swords, User, RotateCcw } from 'lucide-react';
import type { ChallengeInfoResponse } from '@flagora/shared';
import {
  getChallengeViewerPerspective,
  getPerspectiveHeading,
  getInitials,
} from './challengeViewHelpers.js';
import { getAvatarFrameClass } from './cosmeticHelpers.js';

interface HeadToHeadResultScreenProps {
  challengeInfo: ChallengeInfoResponse;
  currentUserId: number;
  onRematch: () => void;
  onBackToProfile: () => void;
  isStartingRematch?: boolean;
  userAvatarFrame?: string | null;
}

export function HeadToHeadResultScreen({
  challengeInfo,
  currentUserId,
  onRematch,
  onBackToProfile,
  isStartingRematch = false,
  userAvatarFrame,
}: HeadToHeadResultScreenProps) {
  const perspective = getChallengeViewerPerspective(challengeInfo, currentUserId);
  const heading = getPerspectiveHeading(perspective, challengeInfo.challengerDisplayName);

  const isChallengerViewer = challengeInfo.challengerUserId === currentUserId;
  const isOpponentViewer = challengeInfo.opponentUserId === currentUserId;

  const challengerWon = challengeInfo.winner === 'challenger';
  const opponentWon = challengeInfo.winner === 'opponent';

  const challengerInitial = getInitials(challengeInfo.challengerDisplayName);
  const opponentInitial = getInitials(challengeInfo.opponentDisplayName ?? 'Opponent');

  const viewerFrame = getAvatarFrameClass(userAvatarFrame);
  const challengerFrame = isChallengerViewer ? viewerFrame : '';
  const opponentFrame = isOpponentViewer ? viewerFrame : '';

  return (
    <div className="flex w-full max-w-sm flex-col items-center gap-4 text-tg-text">
      <div className="flex w-full flex-col items-center rounded-2xl bg-tg-section border border-tg-separator p-6 text-center shadow-sm">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-tg-button/10 text-tg-button ring-1 ring-tg-button/20">
          <Trophy className="h-8 w-8" />
        </div>

        <h2 className="mt-4 text-2xl font-extrabold tracking-tight text-tg-text">
          {heading.title}
        </h2>
        <p className="mt-1 text-xs text-tg-hint">{heading.subtitle}</p>

        <div className="mt-6 grid w-full grid-cols-2 gap-3">
          <div
            className={`flex flex-col items-center rounded-xl bg-tg-secondary-bg p-4 border transition-all ${
              challengerWon
                ? 'border-tg-button shadow-sm'
                : 'border-tg-separator'
            }`}
          >
            <div className="relative">
              {challengeInfo.challengerPhotoUrl ? (
                <img
                  src={challengeInfo.challengerPhotoUrl}
                  alt={challengeInfo.challengerDisplayName}
                  className={`h-14 w-14 rounded-full object-cover ${challengerFrame || 'ring-2 ring-tg-button'}`}
                />
              ) : (
                <div className={`flex h-14 w-14 items-center justify-center rounded-full bg-tg-button text-xl font-bold text-tg-button-text ${challengerFrame}`}>
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
              {challengeInfo.challengerDisplayName}
            </p>
            <p className="text-[11px] text-tg-hint">
              {isChallengerViewer ? 'You' : 'Challenger'}
            </p>

            <div className="mt-3 flex items-baseline gap-1">
              <span className="text-2xl font-extrabold text-tg-text">
                {challengeInfo.challengerScore?.toLocaleString() ?? 0}
              </span>
              <span className="text-[11px] font-semibold text-tg-hint">pts</span>
            </div>

            {challengerWon && (
              <span className="mt-2 rounded-full bg-tg-button/15 px-2 py-0.5 text-[10px] font-bold text-tg-button border border-tg-button/30">
                Winner
              </span>
            )}
          </div>

          <div
            className={`flex flex-col items-center rounded-xl bg-tg-secondary-bg p-4 border transition-all ${
              opponentWon
                ? 'border-tg-button shadow-sm'
                : 'border-tg-separator'
            }`}
          >
            <div className="relative">
              {challengeInfo.opponentPhotoUrl ? (
                <img
                  src={challengeInfo.opponentPhotoUrl}
                  alt={challengeInfo.opponentDisplayName ?? 'Opponent'}
                  className={`h-14 w-14 rounded-full object-cover ${opponentFrame || 'ring-2 ring-tg-button'}`}
                />
              ) : (
                <div className={`flex h-14 w-14 items-center justify-center rounded-full bg-tg-button text-xl font-bold text-tg-button-text ${opponentFrame}`}>
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
              {challengeInfo.opponentDisplayName ?? 'Opponent'}
            </p>
            <p className="text-[11px] text-tg-hint">
              {isOpponentViewer ? 'You' : 'Opponent'}
            </p>

            <div className="mt-3 flex items-baseline gap-1">
              <span className="text-2xl font-extrabold text-tg-text">
                {challengeInfo.opponentScore?.toLocaleString() ?? 0}
              </span>
              <span className="text-[11px] font-semibold text-tg-hint">pts</span>
            </div>

            {opponentWon && (
              <span className="mt-2 rounded-full bg-tg-button/15 px-2 py-0.5 text-[10px] font-bold text-tg-button border border-tg-button/30">
                Winner
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="flex w-full flex-col gap-2.5">
        <button
          type="button"
          onClick={onRematch}
          disabled={isStartingRematch}
          className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-tg-button font-bold text-tg-button-text shadow-sm transition-opacity hover:opacity-90 active:opacity-75 disabled:pointer-events-none disabled:opacity-50"
        >
          {isStartingRematch ? (
            <RotateCcw className="h-4 w-4 animate-spin" />
          ) : (
            <Swords className="h-4 w-4" />
          )}
          <span>{isStartingRematch ? 'Starting Rematch...' : 'Rematch'}</span>
        </button>

        <button
          type="button"
          onClick={onBackToProfile}
          className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-tg-section border border-tg-separator font-semibold text-tg-hint transition-colors hover:text-tg-text active:opacity-75"
        >
          <User className="h-4 w-4" />
          <span>Back to Profile</span>
        </button>
      </div>
    </div>
  );
}
