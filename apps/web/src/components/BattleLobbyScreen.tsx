import { useState } from 'react';
import {
  Swords,
  Share2,
  Copy,
  Check,
  ArrowLeft,
  Loader2,
  User,
  Zap,
  Users,
  Crown,
  Rocket,
} from './icons.js';
import type { BattleInfoResponse, OpponentJoinedPayload, BattleParticipant } from '@flagora/shared';
import { shareBattle, copyBattleLink, getInitials } from './battleHelpers.js';

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
  isGroupBattle?: boolean;
  groupParticipants?: BattleParticipant[];
  onStartGroupBattle?: () => void;
  onLeaveGroupLobby?: () => void;
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
  isGroupBattle = false,
  groupParticipants = [],
  onStartGroupBattle,
  onLeaveGroupLobby,
}: BattleLobbyScreenProps) {
  const [copied, setCopied] = useState(false);
  const [starting, setStarting] = useState(false);

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

  const isGroup = Boolean(isGroupBattle || battleInfo?.isGroupBattle);
  const participants = groupParticipants.length > 0 ? groupParticipants : battleInfo?.participants ?? [];
  const maxPlayers = battleInfo?.maxPlayers ?? 5;
  const isHost = battleInfo?.hostUserId ? battleInfo.hostUserId === currentUserId : battleInfo?.challengerUserId === currentUserId;

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
  const totalFlags = battleInfo?.totalFlags ?? 10;
  const durationSeconds = battleInfo?.durationSeconds ?? 60;

  const challengerIsReady = isChallenger
    ? isReady
    : Boolean(opponentReady || battleInfo?.challengerReady);

  const opponentIsReady = isChallenger
    ? Boolean(opponentReady || battleInfo?.opponentReady)
    : isReady;

  const handleLaunch = async () => {
    if (starting || !onStartGroupBattle) return;
    setStarting(true);
    try {
      await onStartGroupBattle();
    } finally {
      setStarting(false);
    }
  };

  return (
    <div className="relative flex w-full max-w-md mx-auto flex-col items-center gap-4 text-tg-text">
      {/* Synchronized 3-second Countdown Overlay */}
      {countdown !== null && (
        <div className="absolute inset-0 z-50 flex flex-col items-center justify-center rounded-2xl bg-tg-bg/90 backdrop-blur-md overflow-hidden">
          <p className="relative z-10 text-xs font-bold uppercase tracking-widest text-tg-button">
            Battle Starting In
          </p>
          <div className="relative z-10 mt-4 flex h-28 w-28 items-center justify-center rounded-full bg-tg-button/20 text-6xl font-black text-tg-button animate-pulse">
            {countdown > 0 ? countdown : 'GO!'}
          </div>
          <p className="relative z-10 mt-4 text-xs font-semibold text-tg-hint">Get Ready!</p>
        </div>
      )}

      {/* Top Navigation & Title Bar */}
      <div className="flex w-full items-center justify-between">
        <button
          type="button"
          onClick={onBack}
          className="flex h-9 w-9 items-center justify-center rounded-xl bg-tg-section text-tg-hint transition-colors hover:text-tg-text active:opacity-75"
          aria-label="Back"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-tg-button/10 text-tg-button">
            {isGroup ? <Users className="h-4 w-4" /> : <Swords className="h-4 w-4" />}
          </div>
          <span className="text-sm font-bold uppercase tracking-wider text-tg-text">
            {isGroup ? 'Group Battle Lobby' : 'Live Battle Lobby'}
          </span>
        </div>
        <div className="h-9 w-9" />
      </div>

      {error && (
        <div className="w-full rounded-xl bg-tg-destructive/15 p-3 text-center text-xs font-semibold text-tg-destructive">
          {error}
        </div>
      )}

      {/* Match Parameters Info Bar */}
      <div className="flex w-full items-center justify-center gap-2 rounded-xl bg-tg-secondary-bg px-4 py-2.5 text-xs text-tg-hint">
        <span className="font-semibold text-tg-text">{totalFlags} Flags</span>
        <span>•</span>
        <span className="font-semibold text-tg-text">{durationSeconds}s Time Limit</span>
        <span>•</span>
        <span className="font-semibold text-tg-button">
          {isGroup ? `${participants.length}/${maxPlayers} Players` : '1v1 Duel'}
        </span>
      </div>

      {/* Roster & Participant Cards */}
      {isGroup ? (
        /* ================= GROUP MULTIPLAYER LOBBY ================= */
        <div className="flex w-full flex-col items-center rounded-2xl bg-tg-section p-4 text-center shadow-sm">
          <div className="mb-3 flex w-full items-center justify-between px-1">
            <span className="text-xs font-bold uppercase tracking-wider text-tg-hint">
              Joined Players ({participants.length}/{maxPlayers})
            </span>
            <span className="rounded-full bg-tg-button/15 px-2.5 py-0.5 text-[10px] font-bold text-tg-button">
              {participants.length >= maxPlayers ? 'Full' : `${maxPlayers - participants.length} slots open`}
            </span>
          </div>

          <div className="grid w-full grid-cols-2 gap-2.5">
            {participants.map((p, idx) => {
              const isPlayerHost = p.userId === (battleInfo?.hostUserId ?? battleInfo?.challengerUserId);
              const isMe = p.userId === currentUserId;
              return (
                <div
                  key={p.userId || idx}
                  className="flex flex-col items-center rounded-xl bg-tg-secondary-bg p-3 relative"
                >
                  <div className="relative flex h-12 w-12 items-center justify-center">
                    {p.photoUrl ? (
                      <img
                        src={p.photoUrl}
                        alt={p.displayName}
                        className="h-11 w-11 rounded-full object-cover bg-tg-section"
                      />
                    ) : (
                      <div className="flex h-11 w-11 items-center justify-center rounded-full bg-tg-button text-lg font-bold text-tg-button-text">
                        {getInitials(p.displayName)}
                      </div>
                    )}
                    {isPlayerHost && (
                      <span className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-amber-400 text-amber-950">
                        <Crown className="h-3 w-3" />
                      </span>
                    )}
                  </div>
                  <p className="mt-1.5 max-w-[130px] truncate text-xs font-bold text-tg-text">
                    {p.displayName} {isMe ? '(You)' : ''}
                  </p>
                  <span className="mt-1 rounded-full bg-tg-button/15 px-2 py-0.5 text-[10px] font-semibold text-tg-button">
                    {isPlayerHost ? '👑 Host' : 'Ready 🟢'}
                  </span>
                </div>
              );
            })}

            {/* Empty Slots Placeholder */}
            {Array.from({ length: Math.max(0, maxPlayers - participants.length) }).map((_, i) => (
              <div
                key={`empty-${i}`}
                className="flex flex-col items-center justify-center rounded-xl border border-dashed border-tg-separator p-4 text-center"
              >
                <div className="flex h-11 w-11 items-center justify-center rounded-full bg-tg-secondary-bg text-tg-hint">
                  <User className="h-5 w-5" />
                </div>
                <p className="mt-1.5 text-[11px] font-semibold text-tg-hint">Waiting...</p>
                <span className="text-[10px] text-tg-hint/80">Slot {participants.length + i + 1}</span>
              </div>
            ))}
          </div>

          {/* Group Action Buttons */}
          <div className="mt-5 flex w-full flex-col gap-2.5">
            {isHost ? (
              <>
                <button
                  type="button"
                  onClick={handleLaunch}
                  disabled={participants.length < 2 || starting}
                  className={`flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-tg-button font-bold text-tg-button-text shadow-sm transition-opacity active:opacity-75 ${
                    participants.length < 2 ? 'opacity-50 cursor-not-allowed' : 'hover:opacity-90'
                  }`}
                >
                  {starting ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Rocket className="h-4 w-4" />
                  )}
                  <span>
                    {participants.length < 2
                      ? 'Need at least 2 players to start'
                      : `Launch Battle (${participants.length} Players) ⚔️`}
                  </span>
                </button>
              </>
            ) : (
              <div className="flex flex-col items-center gap-2">
                <div className="flex items-center gap-2 text-xs font-semibold text-tg-button animate-pulse">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  <span>Waiting for host to launch the battle...</span>
                </div>
                {onLeaveGroupLobby && (
                  <button
                    type="button"
                    onClick={onLeaveGroupLobby}
                    className="flex h-10 w-full items-center justify-center rounded-xl bg-tg-secondary-bg text-xs font-bold text-tg-hint hover:text-tg-destructive transition-colors"
                  >
                    Leave Lobby
                  </button>
                )}
              </div>
            )}

            {/* Invite Links */}
            <div className="mt-1 grid w-full grid-cols-2 gap-2">
              <button
                type="button"
                onClick={handleShare}
                className="flex h-10 items-center justify-center gap-1.5 rounded-xl bg-tg-secondary-bg px-3 text-xs font-bold text-tg-text transition-opacity hover:opacity-90 active:opacity-75"
              >
                <Share2 className="h-3.5 w-3.5" />
                <span>Share Invite</span>
              </button>
              <button
                type="button"
                onClick={handleCopy}
                className="flex h-10 items-center justify-center gap-1.5 rounded-xl bg-tg-secondary-bg px-3 text-xs font-bold text-tg-text transition-opacity hover:opacity-90 active:opacity-75"
              >
                {copied ? (
                  <>
                    <Check className="h-3.5 w-3.5 text-tg-button" />
                    <span className="text-tg-button">Copied!</span>
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
        </div>
      ) : (
        /* ================= 1v1 HEAD-TO-HEAD LOBBY ================= */
        <div className="flex w-full flex-col items-center rounded-2xl bg-tg-section p-5 text-center shadow-sm">
          <div className="grid w-full grid-cols-2 gap-3">
            <div className="flex flex-col items-center rounded-xl bg-tg-secondary-bg p-4">
              <div className="relative flex h-14 w-14 items-center justify-center">
                {challengerPhoto ? (
                  <img
                    src={challengerPhoto}
                    alt={challengerName}
                    className="h-12 w-12 rounded-full object-cover bg-tg-section"
                  />
                ) : (
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-tg-button text-xl font-bold text-tg-button-text">
                    {challengerInitial}
                  </div>
                )}
              </div>
              <p className="mt-2 max-w-[120px] truncate text-xs font-bold text-tg-text">
                {challengerName}
              </p>
              <span className="mt-1 rounded-full bg-tg-button/15 px-2 py-0.5 text-[10px] font-semibold text-tg-button">
                {isChallenger ? 'You (Host)' : 'Host'}
              </span>
              <span
                className={`mt-1.5 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                  challengerIsReady
                    ? 'bg-tg-button/15 text-tg-button'
                    : 'bg-tg-hint/15 text-tg-hint'
                }`}
              >
                {challengerIsReady ? 'Ready' : 'Waiting...'}
              </span>
            </div>

            <div className="flex flex-col items-center rounded-xl bg-tg-secondary-bg p-4">
              {hasOpponent ? (
                <>
                  <div className="relative flex h-14 w-14 items-center justify-center">
                    {opponentPhotoUrl ? (
                      <img
                        src={opponentPhotoUrl}
                        alt={opponentDisplayName || 'Opponent'}
                        className="h-12 w-12 rounded-full object-cover bg-tg-section"
                      />
                    ) : (
                      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-tg-button text-xl font-bold text-tg-button-text">
                        {opponentInitial}
                      </div>
                    )}
                  </div>
                  <p className="mt-2 max-w-[120px] truncate text-xs font-bold text-tg-text">
                    {opponentDisplayName}
                  </p>
                  <span className="mt-1 rounded-full bg-tg-button/15 px-2 py-0.5 text-[10px] font-semibold text-tg-button">
                    {!isChallenger ? 'You' : 'Opponent'}
                  </span>
                  <span
                    className={`mt-1.5 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                      opponentIsReady
                        ? 'bg-tg-button/15 text-tg-button'
                        : 'bg-tg-hint/15 text-tg-hint'
                    }`}
                  >
                    {opponentIsReady ? 'Ready' : 'Waiting...'}
                  </span>
                </>
              ) : (
                <div className="flex flex-col items-center justify-center py-2 text-center">
                  <div className="flex h-14 w-14 items-center justify-center rounded-full border border-dashed border-tg-separator text-tg-hint">
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
                    className="flex h-11 items-center justify-center gap-1.5 rounded-xl bg-tg-secondary-bg px-3 text-xs font-bold text-tg-text transition-opacity hover:opacity-90 active:opacity-75"
                  >
                    {copied ? (
                      <>
                        <Check className="h-3.5 w-3.5 text-tg-button" />
                        <span className="text-tg-button">Copied!</span>
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
                <p className="text-xs font-semibold text-tg-button">
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
                      <p className="text-xs font-medium text-tg-button animate-pulse">
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
      )}
    </div>
  );
}
