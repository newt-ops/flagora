import { Trophy, Swords, User, RotateCcw } from 'lucide-react';
import type { ChallengeInfoResponse } from '@flagora/shared';
import {
  getChallengeViewerPerspective,
  getPerspectiveHeading,
  getInitials,
} from './challengeViewHelpers.js';

interface HeadToHeadResultScreenProps {
  challengeInfo: ChallengeInfoResponse;
  currentUserId: number;
  onRematch: () => void;
  onBackToProfile: () => void;
  isStartingRematch?: boolean;
}

export function HeadToHeadResultScreen({
  challengeInfo,
  currentUserId,
  onRematch,
  onBackToProfile,
  isStartingRematch = false,
}: HeadToHeadResultScreenProps) {
  const perspective = getChallengeViewerPerspective(challengeInfo, currentUserId);
  const heading = getPerspectiveHeading(perspective, challengeInfo.challengerDisplayName);

  const isChallengerViewer = challengeInfo.challengerUserId === currentUserId;
  const isOpponentViewer = challengeInfo.opponentUserId === currentUserId;

  const challengerWon = challengeInfo.winner === 'challenger';
  const opponentWon = challengeInfo.winner === 'opponent';

  const challengerInitial = getInitials(challengeInfo.challengerDisplayName);
  const opponentInitial = getInitials(challengeInfo.opponentDisplayName ?? 'Opponent');

  return (
    <div className="flex w-full max-w-sm flex-col items-center gap-4 text-tg-text">
      <div className="flex w-full flex-col items-center rounded-2xl bg-tg-secondary-bg p-6 text-center shadow-md ring-1 ring-slate-800">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-indigo-500/10 text-indigo-400 ring-1 ring-indigo-500/20">
          <Trophy className="h-8 w-8" />
        </div>

        <h2 className="mt-4 text-2xl font-extrabold tracking-tight text-tg-text">
          {heading.title}
        </h2>
        <p className="mt-1 text-xs text-tg-hint">{heading.subtitle}</p>

        <div className="mt-6 grid w-full grid-cols-2 gap-3">
          <div
            className={`flex flex-col items-center rounded-xl bg-tg-bg p-4 ring-1 transition-all ${
              challengerWon
                ? 'ring-amber-500/50 shadow-md shadow-amber-500/10'
                : 'ring-slate-800'
            }`}
          >
            <div className="relative">
              {challengeInfo.challengerPhotoUrl ? (
                <img
                  src={challengeInfo.challengerPhotoUrl}
                  alt={challengeInfo.challengerDisplayName}
                  className="h-14 w-14 rounded-full object-cover ring-2 ring-indigo-500"
                />
              ) : (
                <div className="flex h-14 w-14 items-center justify-center rounded-full bg-indigo-600 text-xl font-bold text-white">
                  {challengerInitial}
                </div>
              )}
              {challengerWon && (
                <span className="absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-amber-500 text-slate-950 ring-2 ring-tg-bg">
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
              <span className="mt-2 rounded-full bg-amber-500/20 px-2 py-0.5 text-[10px] font-bold text-amber-300 ring-1 ring-amber-500/30">
                Winner
              </span>
            )}
          </div>

          <div
            className={`flex flex-col items-center rounded-xl bg-tg-bg p-4 ring-1 transition-all ${
              opponentWon
                ? 'ring-amber-500/50 shadow-md shadow-amber-500/10'
                : 'ring-slate-800'
            }`}
          >
            <div className="relative">
              {challengeInfo.opponentPhotoUrl ? (
                <img
                  src={challengeInfo.opponentPhotoUrl}
                  alt={challengeInfo.opponentDisplayName ?? 'Opponent'}
                  className="h-14 w-14 rounded-full object-cover ring-2 ring-indigo-500"
                />
              ) : (
                <div className="flex h-14 w-14 items-center justify-center rounded-full bg-indigo-600 text-xl font-bold text-white">
                  {opponentInitial}
                </div>
              )}
              {opponentWon && (
                <span className="absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-amber-500 text-slate-950 ring-2 ring-tg-bg">
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
              <span className="mt-2 rounded-full bg-amber-500/20 px-2 py-0.5 text-[10px] font-bold text-amber-300 ring-1 ring-amber-500/30">
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
          className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 font-bold text-white shadow transition-transform hover:bg-indigo-500 active:scale-95 disabled:pointer-events-none disabled:opacity-50"
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
          className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-tg-secondary-bg font-semibold text-tg-hint transition-colors hover:text-tg-text active:scale-95"
        >
          <User className="h-4 w-4" />
          <span>Back to Profile</span>
        </button>
      </div>
    </div>
  );
}
