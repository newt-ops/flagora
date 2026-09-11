import { useState } from 'react';
import { Swords, Share2, Copy, Check, ArrowLeft, Loader2, User, Zap } from 'lucide-react';
import type { BattleInfoResponse, OpponentJoinedPayload } from '@flagora/shared';
import { shareBattle, copyBattleLink, getInitials } from './battleHelpers.js';
import { getAvatarFrameClass } from './cosmeticHelpers.js';

interface BattleLobbyScreenProps {
  battleId: string;
  battleInfo: BattleInfoResponse | null;
  currentUserId: number;
  bothPlayersPresent: boolean;
  opponentJoinedPayload: OpponentJoinedPayload | null;
  isReady: boolean;
  opponentReady?: boolean;
  countdown: number | null;
  onReady: () => void;
  onBack: () => void;
  isConnecting?: boolean;
  error?: string | null;
  userAvatarFrame?: string | null;
}

export function BattleLobbyScreen({
  battleId,
  battleInfo,
  currentUserId,
  bothPlayersPresent,
  opponentJoinedPayload,
  isReady,
  opponentReady = false,
  countdown,
  onReady,
  onBack,
  isConnecting = false,
  error = null,
  userAvatarFrame,
}: BattleLobbyScreenProps) {
  const [copied, setCopied] = useState(false);

  const handleShare = () => {
    shareBattle(battleId);
  };

  const handleCopy = async () => {
    const success = await copyBattleLink(battleId);
    if (success) {
      setCopied(true);
      setTimeout(() => {
        setCopied(false);
      }, 2000);
    }
  };

  const isChallenger = battleInfo?.challengerUserId === currentUserId;

  const opponentDisplayName =
    opponentJoinedPayload?.opponentDisplayName ||
    battleInfo?.opponentDisplayName ||
    (battleInfo?.opponentUserId ? 'Opponent' : null);

  const opponentPhotoUrl =
    opponentJoinedPayload?.opponentPhotoUrl || battleInfo?.opponentPhotoUrl || null;

  const hasOpponent = Boolean(opponentJoinedPayload || battleInfo?.opponentUserId);

  const challengerName = battleInfo?.challengerDisplayName || 'Challenger';
  const challengerPhoto = battleInfo?.challengerPhotoUrl || null;
  const challengerInitial = getInitials(challengerName);
  const opponentInitial = getInitials(opponentDisplayName);
  const challengerFrame = isChallenger ? getAvatarFrameClass(userAvatarFrame) : '';
  const opponentFrame = !isChallenger ? getAvatarFrameClass(userAvatarFrame) : '';

  const totalFlags = battleInfo?.totalFlags ?? 10;
  const durationSeconds = battleInfo?.durationSeconds ?? 60;

  const challengerIsReady = isChallenger
    ? isReady
    : Boolean(opponentReady || battleInfo?.challengerReady);

  const opponentIsReady = isChallenger
    ? Boolean(opponentReady || battleInfo?.opponentReady)
    : isReady;

  return (
    <div className="relative flex w-full max-w-sm flex-col items-center gap-4 text-tg-text">
      {countdown !== null && (
        <div className="absolute inset-0 z-50 flex flex-col items-center justify-center rounded-2xl bg-tg-bg/90 backdrop-blur-md">
          <p className="text-xs font-bold uppercase tracking-widest text-tg-button">
            Battle Starting In
          </p>
          <div className="mt-4 flex h-28 w-28 items-center justify-center rounded-full bg-tg-button/20 text-6xl font-black text-tg-button ring-4 ring-tg-button animate-pulse">
            {countdown > 0 ? countdown : 'GO!'}
          </div>
          <p className="mt-4 text-xs font-semibold text-tg-hint">Get Ready!</p>
        </div>
      )}

      <div className="flex w-full items-center justify-between">
        <button
          type="button"
          onClick={onBack}
          className="flex h-9 w-9 items-center justify-center rounded-xl bg-tg-section border border-tg-separator text-tg-hint transition-colors hover:text-tg-text active:opacity-75"
          aria-label="Back"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-tg-button/10 text-tg-button">
            <Swords className="h-4 w-4" />
          </div>
          <span className="text-sm font-bold uppercase tracking-wider text-tg-text">
            Live Battle Lobby
          </span>
        </div>
        <div className="h-9 w-9" />
      </div>

      {error && (
        <div className="w-full rounded-xl bg-rose-500/20 p-3 text-center text-xs font-semibold text-rose-400 border border-rose-500/30">
          {error}
        </div>
      )}

      <div className="flex w-full items-center justify-center gap-2 rounded-xl bg-tg-secondary-bg border border-tg-separator px-4 py-2.5 text-xs text-tg-hint">
        <span className="font-semibold text-tg-text">{totalFlags} Flags</span>
        <span>•</span>
        <span className="font-semibold text-tg-text">{durationSeconds}s Time Limit</span>
        <span>•</span>
        <span className="font-semibold text-tg-button">1v1 Real-Time</span>
      </div>

      <div className="flex w-full flex-col items-center rounded-2xl bg-tg-section border border-tg-separator p-5 text-center shadow-sm">
        <div className="grid w-full grid-cols-2 gap-3">
          <div className="flex flex-col items-center rounded-xl bg-tg-secondary-bg border border-tg-separator p-4">
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
            </div>
            <p className="mt-2 max-w-[120px] truncate text-xs font-bold text-tg-text">
              {challengerName}
            </p>
            <span className="mt-1 rounded-full bg-tg-button/15 px-2 py-0.5 text-[10px] font-semibold text-tg-button ring-1 ring-tg-button/30">
              {isChallenger ? 'You (Host)' : 'Host'}
            </span>
            <span
              className={`mt-1.5 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                challengerIsReady
                  ? 'bg-emerald-500/15 text-emerald-400 ring-1 ring-emerald-500/30'
                  : 'bg-tg-hint/15 text-tg-hint ring-1 ring-tg-separator'
              }`}
            >
              {challengerIsReady ? 'Ready ✓' : 'Waiting...'}
            </span>
          </div>

          <div className="flex flex-col items-center rounded-xl bg-tg-secondary-bg border border-tg-separator p-4">
            {hasOpponent ? (
              <>
                <div className="relative">
                  {opponentPhotoUrl ? (
                    <img
                      src={opponentPhotoUrl}
                      alt={opponentDisplayName || 'Opponent'}
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
                </div>
                <p className="mt-2 max-w-[120px] truncate text-xs font-bold text-tg-text">
                  {opponentDisplayName}
                </p>
                <span className="mt-1 rounded-full bg-tg-button/15 px-2 py-0.5 text-[10px] font-semibold text-tg-button ring-1 ring-tg-button/30">
                  {!isChallenger ? 'You' : 'Opponent'}
                </span>
                <span
                  className={`mt-1.5 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                    opponentIsReady
                      ? 'bg-emerald-500/15 text-emerald-400 ring-1 ring-emerald-500/30'
                      : 'bg-tg-hint/15 text-tg-hint ring-1 ring-tg-separator'
                  }`}
                >
                  {opponentIsReady ? 'Ready ✓' : 'Waiting...'}
                </span>
              </>
            ) : (
              <div className="flex flex-col items-center justify-center py-2 text-center">
                <div className="flex h-14 w-14 items-center justify-center rounded-full border-2 border-dashed border-tg-separator text-tg-hint">
                  <User className="h-6 w-6" />
                </div>
                <p className="mt-2 text-xs font-semibold text-tg-hint">Waiting...</p>
                <span className="mt-1 text-[10px] text-tg-hint">Share invite link</span>
              </div>
            )}
          </div>
        </div>

        <div className="mt-5 flex w-full flex-col items-center">
          {isConnecting && (
            <div className="flex items-center gap-2 text-xs font-medium text-tg-hint">
              <Loader2 className="h-3.5 w-3.5 animate-spin text-tg-button" />
              <span>Connecting to battle server...</span>
            </div>
          )}

          {!hasOpponent && !isConnecting && (
            <div className="flex w-full flex-col gap-2.5">
              <p className="text-xs text-tg-hint">
                Invite a friend to join this real-time match!
              </p>
              <div className="grid w-full grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={handleShare}
                  className="flex h-11 items-center justify-center gap-1.5 rounded-xl bg-tg-button px-3 text-xs font-bold text-tg-button-text shadow-sm transition-opacity hover:opacity-90 active:opacity-75"
                >
                  <Share2 className="h-3.5 w-3.5" />
                  <span>Share Invite</span>
                </button>
                <button
                  type="button"
                  onClick={handleCopy}
                  className="flex h-11 items-center justify-center gap-1.5 rounded-xl bg-tg-secondary-bg border border-tg-separator px-3 text-xs font-bold text-tg-text transition-opacity hover:opacity-90 active:opacity-75"
                >
                  {copied ? (
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
              </div>
            </div>
          )}

          {hasOpponent && !bothPlayersPresent && (
            <div className="flex items-center gap-2 text-xs font-medium text-tg-hint">
              <Loader2 className="h-3.5 w-3.5 animate-spin text-tg-button" />
              <span>Establishing synchronized connection...</span>
            </div>
          )}

          {bothPlayersPresent && (
            <div className="flex w-full flex-col items-center gap-2">
              <p className="text-xs font-semibold text-emerald-400">
                Both players connected!
              </p>
              {isReady ? (
                <button
                  type="button"
                  disabled
                  className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-tg-button/80 font-bold text-tg-button-text opacity-90 cursor-not-allowed"
                >
                  <Check className="h-4 w-4" />
                  <span>
                    {(isChallenger ? opponentIsReady : challengerIsReady)
                      ? 'Both Ready! Starting...'
                      : 'You Are Ready (Waiting for Opponent)'}
                  </span>
                </button>
              ) : (
                <>
                  {(isChallenger ? opponentIsReady : challengerIsReady) && (
                    <p className="text-xs font-medium text-emerald-400 animate-pulse">
                      Opponent is ready! Press below to start.
                    </p>
                  )}
                  <button
                    type="button"
                    onClick={onReady}
                    className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-tg-button font-bold text-tg-button-text shadow-sm transition-opacity hover:opacity-90 active:opacity-75"
                  >
                    <Zap className="h-4 w-4" />
                    <span>I Am Ready</span>
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
