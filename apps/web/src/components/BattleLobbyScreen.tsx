import { useState } from 'react';
import { Swords, Share2, Copy, Check, ArrowLeft, Loader2, User, Zap } from 'lucide-react';
import type { BattleInfoResponse, OpponentJoinedPayload } from '@flagora/shared';
import { shareBattle, copyBattleLink, getInitials } from './battleHelpers.js';

interface BattleLobbyScreenProps {
  battleId: string;
  battleInfo: BattleInfoResponse | null;
  currentUserId: number;
  bothPlayersPresent: boolean;
  opponentJoinedPayload: OpponentJoinedPayload | null;
  isReady: boolean;
  countdown: number | null;
  onReady: () => void;
  onBack: () => void;
  isConnecting?: boolean;
  error?: string | null;
}

export function BattleLobbyScreen({
  battleId,
  battleInfo,
  currentUserId,
  bothPlayersPresent,
  opponentJoinedPayload,
  isReady,
  countdown,
  onReady,
  onBack,
  isConnecting = false,
  error = null,
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

  return (
    <div className="relative flex w-full max-w-sm flex-col items-center gap-4 text-tg-text">
      {countdown !== null && (
        <div className="absolute inset-0 z-50 flex flex-col items-center justify-center rounded-2xl bg-tg-bg/90 backdrop-blur-md">
          <p className="text-xs font-bold uppercase tracking-widest text-violet-400">
            Battle Starting In
          </p>
          <div className="mt-4 flex h-28 w-28 items-center justify-center rounded-full bg-violet-600/20 text-6xl font-black text-white ring-4 ring-violet-500 animate-pulse">
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
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-violet-500/20 text-violet-400">
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

      <div className="flex w-full flex-col items-center rounded-2xl bg-tg-section border border-tg-separator p-5 text-center shadow-sm">
        <div className="grid w-full grid-cols-2 gap-3">
          <div className="flex flex-col items-center rounded-xl bg-tg-secondary-bg border border-tg-separator p-4">
            <div className="relative">
              {challengerPhoto ? (
                <img
                  src={challengerPhoto}
                  alt={challengerName}
                  className="h-14 w-14 rounded-full object-cover ring-2 ring-violet-500"
                />
              ) : (
                <div className="flex h-14 w-14 items-center justify-center rounded-full bg-violet-600 text-xl font-bold text-white">
                  {challengerInitial}
                </div>
              )}
            </div>
            <p className="mt-2 max-w-[120px] truncate text-xs font-bold text-tg-text">
              {challengerName}
            </p>
            <span className="mt-1 rounded-full bg-violet-500/20 px-2 py-0.5 text-[10px] font-semibold text-violet-300 ring-1 ring-violet-500/30">
              {isChallenger ? 'You (Host)' : 'Host'}
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
                      className="h-14 w-14 rounded-full object-cover ring-2 ring-indigo-500"
                    />
                  ) : (
                    <div className="flex h-14 w-14 items-center justify-center rounded-full bg-indigo-600 text-xl font-bold text-white">
                      {opponentInitial}
                    </div>
                  )}
                </div>
                <p className="mt-2 max-w-[120px] truncate text-xs font-bold text-tg-text">
                  {opponentDisplayName}
                </p>
                <span className="mt-1 rounded-full bg-indigo-500/20 px-2 py-0.5 text-[10px] font-semibold text-indigo-300 ring-1 ring-indigo-500/30">
                  {!isChallenger ? 'You' : 'Opponent'}
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
              <Loader2 className="h-3.5 w-3.5 animate-spin text-violet-400" />
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
                  className="flex h-11 items-center justify-center gap-1.5 rounded-xl bg-violet-600 px-3 text-xs font-bold text-white shadow-sm transition-opacity hover:bg-violet-500 active:opacity-75"
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
              <Loader2 className="h-3.5 w-3.5 animate-spin text-violet-400" />
              <span>Establishing synchronized connection...</span>
            </div>
          )}

          {bothPlayersPresent && (
            <div className="flex w-full flex-col items-center gap-2">
              <p className="text-xs font-semibold text-emerald-400">
                Both players connected!
              </p>
              <button
                type="button"
                onClick={onReady}
                disabled={isReady}
                className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 font-bold text-white shadow-sm transition-opacity hover:bg-emerald-500 active:opacity-75 disabled:pointer-events-none disabled:opacity-75"
              >
                {isReady ? (
                  <>
                    <Check className="h-4 w-4" />
                    <span>Ready! Waiting for start...</span>
                  </>
                ) : (
                  <>
                    <Zap className="h-4 w-4" />
                    <span>I Am Ready</span>
                  </>
                )}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
