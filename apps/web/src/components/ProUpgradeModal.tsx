import { useState } from 'react';
import {
  Crown,
  X,
  Loader2,
  CheckCircle2,
  AlertCircle,
} from './icons.js';
import { VerifiedBadge } from './VerifiedBadge.js';
import { createProInvoiceLink } from '../api/client.js';
import { openTelegramInvoice } from '../telegram/telegramWebApp.js';

interface ProUpgradeModalProps {
  isOpen: boolean;
  onClose: () => void;
  sessionToken: string | null;
  onSuccess?: () => void;
}

export function ProUpgradeModal({
  isOpen,
  onClose,
  sessionToken,
  onSuccess,
}: ProUpgradeModalProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{
    type: 'success' | 'info' | 'error';
    text: string;
  } | null>(null);

  if (!isOpen) return null;

  const handleSubscribe = async () => {
    if (!sessionToken) {
      setStatusMessage({
        type: 'error',
        text: 'Session expired. Please reload the game.',
      });
      return;
    }

    try {
      setIsLoading(true);
      setStatusMessage(null);

      const response = await createProInvoiceLink(sessionToken);
      if (!response.invoiceLink) {
        throw new Error('No invoice link received');
      }

      openTelegramInvoice(response.invoiceLink, (status) => {
        setIsLoading(false);
        if (status === 'paid') {
          setStatusMessage({
            type: 'success',
            text: 'Welcome to Flagora Pro! Your verified checkmark badge is now active.',
          });
          onSuccess?.();
        } else if (status === 'cancelled') {
          setStatusMessage({
            type: 'info',
            text: 'Upgrade was cancelled. No charges were made.',
          });
        } else if (status === 'failed') {
          setStatusMessage({
            type: 'info',
            text: 'Payment could not be processed. No charges were made.',
          });
        }
      });
    } catch (err) {
      setIsLoading(false);
      const message = err instanceof Error ? err.message : 'Failed to initiate upgrade';
      setStatusMessage({
        type: 'error',
        text: message,
      });
    }
  };

  return (
    <div
      data-testid="pro-upgrade-modal-backdrop"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm animate-in fade-in duration-200"
    >
      <div
        data-testid="pro-upgrade-modal"
        className="relative flex w-full max-w-sm flex-col rounded-3xl bg-tg-section p-6 shadow-2xl border border-tg-separator/40 text-tg-text"
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 rounded-full p-1.5 text-tg-hint hover:text-tg-text hover:bg-tg-secondary-bg transition-colors"
          aria-label="Close modal"
        >
          <X className="h-5 w-5" />
        </button>

        <div className="flex flex-col items-center text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#2AABEE]/15 text-[#2AABEE]">
            <VerifiedBadge className="h-8 w-8 text-[#2AABEE]" />
          </div>

          <h2 className="mt-3 text-lg font-extrabold text-tg-text">Flagora Pro</h2>
          <p className="mt-0.5 text-xs text-tg-hint">Official Telegram Verification</p>

          <div className="mt-3 flex items-baseline gap-1 rounded-2xl bg-tg-secondary-bg px-4 py-2 border border-tg-separator/40">
            <span className="text-2xl font-black text-tg-text">1</span>
            <span className="text-xs font-bold text-tg-hint">Star / month</span>
          </div>
        </div>

        <div className="mt-5 flex flex-col gap-2.5">
          <div className="flex items-start gap-3 rounded-2xl bg-tg-secondary-bg/80 p-3.5 text-left border border-tg-separator/30">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#2AABEE]/15 mt-0.5">
              <VerifiedBadge className="h-5 w-5 text-[#2AABEE]" />
            </div>
            <div className="flex flex-col min-w-0">
              <p className="text-sm font-bold text-tg-text flex items-center gap-1.5">
                <span>Verified Checkmark</span>
                <VerifiedBadge className="h-3.5 w-3.5 text-[#2AABEE]" />
              </p>
              <p className="text-xs text-tg-hint mt-0.5 leading-relaxed">
                Stand out with an official blue checkmark badge next to your name across your Profile, Live 1v1 Battles, and Leaderboards.
              </p>
            </div>
          </div>
        </div>

        {statusMessage && (
          <div
            className={`mt-4 flex items-center gap-2 rounded-2xl p-3 text-xs ${
              statusMessage.type === 'success'
                ? 'bg-tg-button/15 text-tg-button'
                : statusMessage.type === 'error'
                ? 'bg-tg-destructive/15 text-tg-destructive'
                : 'bg-tg-secondary-bg text-tg-hint'
            }`}
          >
            {statusMessage.type === 'success' ? (
              <CheckCircle2 className="h-4 w-4 shrink-0 text-tg-button" />
            ) : statusMessage.type === 'error' ? (
              <AlertCircle className="h-4 w-4 shrink-0 text-tg-destructive" />
            ) : (
              <AlertCircle className="h-4 w-4 shrink-0 text-tg-hint" />
            )}
            <span>{statusMessage.text}</span>
          </div>
        )}

        <div className="mt-5 flex flex-col gap-2">
          {statusMessage?.type === 'success' ? (
            <button
              type="button"
              onClick={onClose}
              className="flex w-full items-center justify-center rounded-2xl bg-tg-button py-3 text-sm font-bold text-tg-button-text shadow-sm transition-opacity hover:opacity-90 active:opacity-75"
            >
              Done
            </button>
          ) : (
            <button
              type="button"
              disabled={isLoading}
              onClick={() => void handleSubscribe()}
              className="flex w-full items-center justify-center gap-2 rounded-2xl bg-tg-button py-3 text-sm font-bold text-tg-button-text shadow-sm transition-opacity hover:opacity-90 active:opacity-75 disabled:pointer-events-none disabled:opacity-50"
            >
              {isLoading ? (
                <Loader2 className="h-4 w-4 animate-spin text-tg-button-text" />
              ) : (
                <Crown className="h-4 w-4 fill-current text-tg-button-text" />
              )}
              <span>Subscribe for 1 Star</span>
            </button>
          )}

          <button
            type="button"
            onClick={onClose}
            className="w-full py-2 text-center text-xs font-semibold text-tg-hint hover:text-tg-text transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
