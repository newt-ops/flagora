import { Swords, Play, Clock, Share2, ArrowLeft, AlertCircle } from 'lucide-react';
import type { ChallengeInfoResponse } from '@flagora/shared';
import { isChallengeAcceptable, getInitials } from './challengeViewHelpers.js';

interface ChallengeLandingScreenProps {
  challengeInfo: ChallengeInfoResponse;
  onAccept: () => void;
  onDismiss: () => void;
  onShareChallenge?: () => void;
  isAccepting?: boolean;
}

export function ChallengeLandingScreen({
  challengeInfo,
  onAccept,
  onDismiss,
  onShareChallenge,
  isAccepting = false,
}: ChallengeLandingScreenProps) {
  const isAcceptable = isChallengeAcceptable(challengeInfo);
  const isSelf = challengeInfo.isChallenger;
  const isExpired = challengeInfo.status === 'expired';
  const isAlreadyTaken = !challengeInfo.isOpen && !challengeInfo.isChallenger && !challengeInfo.isOpponent;
  const initial = getInitials(challengeInfo.challengerDisplayName);

  return (
    <div className="flex w-full max-w-sm flex-col items-center gap-4 text-tg-text">
      <div className="flex w-full items-center justify-between">
        <button
          type="button"
          onClick={onDismiss}
          className="flex h-10 w-10 items-center justify-center rounded-xl bg-tg-section border border-tg-separator text-tg-hint transition-colors hover:text-tg-text active:opacity-75"
          aria-label="Back to Profile"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>

        <div className="flex items-center gap-2">
          <Swords className="h-5 w-5 text-indigo-400" />
          <h1 className="text-lg font-bold text-tg-text">Friend Challenge</h1>
        </div>

        <div className="h-10 w-10" />
      </div>

      <div className="flex w-full flex-col items-center rounded-2xl bg-tg-section border border-tg-separator p-6 text-center shadow-sm">
        {challengeInfo.challengerPhotoUrl ? (
          <img
            src={challengeInfo.challengerPhotoUrl}
            alt={challengeInfo.challengerDisplayName}
            className="h-20 w-20 rounded-full object-cover ring-2 ring-indigo-500"
          />
        ) : (
          <div className="flex h-20 w-20 items-center justify-center rounded-full bg-indigo-600 text-3xl font-semibold text-white shadow-sm">
            {initial}
          </div>
        )}

        <h2 className="mt-4 text-xl font-bold text-tg-text">
          {challengeInfo.challengerDisplayName}
        </h2>

        {isAcceptable && (
          <>
            <p className="mt-1 text-xs text-tg-hint">has challenged you to a flag quiz duel!</p>

            <div className="mt-5 w-full rounded-xl bg-tg-secondary-bg border border-indigo-500/30 p-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-tg-hint">
                Score to Beat
              </p>
              <div className="mt-1 flex items-baseline justify-center gap-1">
                <span className="text-3xl font-extrabold tracking-tight text-indigo-400">
                  {challengeInfo.challengerScore?.toLocaleString() ?? 0}
                </span>
                <span className="text-xs font-semibold text-tg-hint">pts</span>
              </div>
              <p className="mt-2 text-[11px] text-tg-hint">
                Play the same 10 flags. Highest score takes the match!
              </p>
            </div>
          </>
        )}

        {isSelf && (
          <div className="mt-5 w-full rounded-xl bg-amber-500/10 p-4 text-left border border-amber-500/30">
            <div className="flex items-center gap-2 text-amber-400">
              <Clock className="h-4 w-4" />
              <p className="text-xs font-bold uppercase tracking-wider">Waiting for Opponent</p>
            </div>
            <p className="mt-2 text-xs text-tg-hint">
              You created this challenge with a score of{' '}
              <span className="font-bold text-tg-text">
                {challengeInfo.challengerScore?.toLocaleString() ?? 0} pts
              </span>
              . Share the link with a friend to duel!
            </p>
          </div>
        )}

        {isExpired && (
          <div className="mt-5 w-full rounded-xl bg-rose-500/10 p-4 text-left border border-rose-500/30">
            <div className="flex items-center gap-2 text-rose-400">
              <AlertCircle className="h-4 w-4" />
              <p className="text-xs font-bold uppercase tracking-wider">Challenge Expired</p>
            </div>
            <p className="mt-2 text-xs text-tg-hint">
              This challenge link was created more than 24 hours ago and has expired.
            </p>
          </div>
        )}

        {isAlreadyTaken && (
          <div className="mt-5 w-full rounded-xl bg-tg-secondary-bg border border-tg-separator p-4 text-left">
            <div className="flex items-center gap-2 text-tg-hint">
              <AlertCircle className="h-4 w-4" />
              <p className="text-xs font-bold uppercase tracking-wider">Match In Progress</p>
            </div>
            <p className="mt-2 text-xs text-tg-hint">
              This challenge has already been accepted by another player.
            </p>
          </div>
        )}
      </div>

      <div className="flex w-full flex-col gap-2.5">
        {isAcceptable && (
          <button
            type="button"
            onClick={onAccept}
            disabled={isAccepting}
            className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 font-bold text-white shadow-sm transition-opacity hover:bg-indigo-500 active:opacity-75 disabled:pointer-events-none disabled:opacity-50"
          >
            <Play className={`h-4 w-4 fill-current ${isAccepting ? 'animate-spin' : ''}`} />
            <span>{isAccepting ? 'Starting Match...' : 'Accept Challenge'}</span>
          </button>
        )}

        {isSelf && onShareChallenge && (
          <button
            type="button"
            onClick={onShareChallenge}
            className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 font-bold text-white shadow-sm transition-opacity hover:bg-indigo-500 active:opacity-75"
          >
            <Share2 className="h-4 w-4" />
            <span>Share Challenge</span>
          </button>
        )}

        <button
          type="button"
          onClick={onDismiss}
          className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-tg-section border border-tg-separator font-semibold text-tg-hint transition-colors hover:text-tg-text active:opacity-75"
        >
          <span>Back to Profile</span>
        </button>
      </div>
    </div>
  );
}
