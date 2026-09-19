import { useState } from 'react';
import {
  Crown,
  Sparkles,
  Zap,
  History,
  Pin,
  Rocket,
  Coins as Pins,
  X,
  Loader2,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react';
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
            text: 'Welcome to Flagora Pro! Your perks and 1,000 Pins stipend are active.',
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

  const perks = [
    {
      icon: Pins,
      title: '1,000 Monthly Pins Stipend',
      desc: 'Instant balance bonus every month',
    },
    {
      icon: Sparkles,
      title: 'Exclusive Pro Cosmetics',
      desc: 'Unique animated frames, themes, and badges',
    },
    {
      icon: Zap,
      title: '2× XP Weekends',
      desc: 'Double XP automatically applied Fri–Sun UTC',
    },
    {
      icon: History,
      title: 'Extended Run History',
      desc: 'Full paginated breakdown of all your past games',
    },
    {
      icon: Pin,
      title: 'Practice Flag Pinning',
      desc: 'Prioritize specific flags in practice runs',
    },
    {
      icon: Rocket,
      title: 'Early Access',
      desc: 'First look at new game modes and features',
    },
  ];

  return (
    <div
      data-testid="pro-upgrade-modal-backdrop"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm animate-in fade-in duration-200"
    >
      <div
        data-testid="pro-upgrade-modal"
        className="relative flex w-full max-w-sm flex-col rounded-3xl bg-tg-section p-6 shadow-2xl border border-amber-500/30 text-tg-text"
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
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-500/15 text-amber-400 shadow-[0_0_20px_rgba(245,158,11,0.25)]">
            <Crown className="h-7 w-7 fill-current" />
          </div>

          <h2 className="mt-3 text-lg font-extrabold text-tg-text">Flagora Pro</h2>
          <p className="mt-0.5 text-xs text-tg-hint">Premium Perks & Exclusive Catalog</p>

          <div className="mt-3 flex items-baseline gap-1 rounded-2xl bg-amber-500/10 px-4 py-2 border border-amber-500/20">
            <span className="text-2xl font-black text-amber-400">100</span>
            <span className="text-xs font-bold text-amber-400">Stars / month</span>
          </div>
        </div>

        <div className="mt-5 flex flex-col gap-2.5 max-h-64 overflow-y-auto pr-1">
          {perks.map((perk, idx) => {
            const Icon = perk.icon;
            return (
              <div
                key={idx}
                className="flex items-start gap-3 rounded-2xl bg-tg-secondary-bg/80 p-2.5 text-left"
              >
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-amber-500/15 text-amber-400 mt-0.5">
                  <Icon className="h-4 w-4" />
                </div>
                <div className="flex flex-col min-w-0">
                  <p className="text-xs font-bold text-tg-text">{perk.title}</p>
                  <p className="text-[11px] text-tg-hint">{perk.desc}</p>
                </div>
              </div>
            );
          })}
        </div>

        {statusMessage && (
          <div
            className={`mt-4 flex items-center gap-2 rounded-2xl p-3 text-xs ${
              statusMessage.type === 'success'
                ? 'bg-emerald-500/20 text-emerald-400'
                : statusMessage.type === 'error'
                ? 'bg-rose-500/20 text-rose-400'
                : 'bg-tg-secondary-bg text-tg-hint'
            }`}
          >
            {statusMessage.type === 'success' ? (
              <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
            ) : statusMessage.type === 'error' ? (
              <AlertCircle className="h-4 w-4 shrink-0 text-rose-400" />
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
              className="flex w-full items-center justify-center rounded-2xl bg-emerald-500 py-3 text-sm font-bold text-white shadow-lg transition-opacity hover:opacity-95 active:opacity-85"
            >
              Done
            </button>
          ) : (
            <button
              type="button"
              disabled={isLoading}
              onClick={() => void handleSubscribe()}
              className="flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-amber-500 to-amber-600 py-3 text-sm font-bold text-slate-950 shadow-[0_0_20px_rgba(245,158,11,0.3)] transition-all hover:brightness-105 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50"
            >
              {isLoading ? (
                <Loader2 className="h-4 w-4 animate-spin text-slate-950" />
              ) : (
                <Crown className="h-4 w-4 fill-current text-slate-950" />
              )}
              <span>Subscribe with Telegram Stars</span>
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
