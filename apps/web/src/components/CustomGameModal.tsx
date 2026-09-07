import { useState } from 'react';
import { X, Play, Globe, Timer, Flag } from 'lucide-react';
import type { Continent } from '@flagora/shared';
import { CONTINENT_LABELS } from '@flagora/shared';
import { ContinentMap } from './ContinentMap.js';

export interface CustomGameConfig {
  continent: Continent;
  flagCount: number;
  durationSeconds: number;
}

interface CustomGameModalProps {
  isOpen: boolean;
  onClose: () => void;
  onStart: (config: CustomGameConfig) => void;
  loading?: boolean;
}

export function CustomGameModal({
  isOpen,
  onClose,
  onStart,
  loading = false,
}: CustomGameModalProps) {
  const [continent, setContinent] = useState<Continent>('world');
  const [flagCount, setFlagCount] = useState<number>(10);
  const [durationSeconds, setDurationSeconds] = useState<number>(60);

  if (!isOpen) return null;

  const continents: Continent[] = ['world', 'africa', 'asia', 'europe', 'americas', 'oceania'];
  const flagOptions = [10, 20, 30, 50];
  const timerOptions = [30, 60, 90, 120];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
      <div className="relative w-full max-w-md rounded-3xl bg-tg-section border border-tg-separator shadow-2xl p-5 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-tg-separator mb-4">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-xl bg-tg-button/10 text-tg-button">
              <Flag className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-tg-text">Custom Game Mode</h2>
              <p className="text-xs text-tg-hint">Customize regions, flags count & timer</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-full text-tg-hint hover:text-tg-text hover:bg-tg-secondary-bg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Interactive Continent Map */}
        <div className="mb-4">
          <label className="text-xs font-semibold text-tg-hint uppercase tracking-wider mb-2 flex items-center gap-1.5">
            <Globe className="w-3.5 h-3.5 text-tg-button" />
            Choose Region
          </label>
          <ContinentMap selectedContinent={continent} onSelectContinent={setContinent} />

          {/* Continent Chips */}
          <div className="grid grid-cols-3 gap-1.5 mt-3">
            {continents.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setContinent(c)}
                className={`py-1.5 px-2 rounded-xl text-xs font-semibold border transition-all text-center truncate ${
                  continent === c
                    ? 'bg-tg-button text-tg-button-text border-tg-button shadow-sm'
                    : 'bg-tg-secondary-bg text-tg-text border-tg-separator hover:border-tg-button/50'
                }`}
              >
                {CONTINENT_LABELS[c]}
              </button>
            ))}
          </div>
        </div>

        {/* Flag Count Selector */}
        <div className="mb-4">
          <label className="text-xs font-semibold text-tg-hint uppercase tracking-wider mb-2 flex items-center gap-1.5">
            <Flag className="w-3.5 h-3.5 text-tg-button" />
            Number of Flags
          </label>
          <div className="grid grid-cols-4 gap-2">
            {flagOptions.map((count) => (
              <button
                key={count}
                type="button"
                onClick={() => setFlagCount(count)}
                className={`py-2 rounded-xl text-xs font-bold border transition-all ${
                  flagCount === count
                    ? 'bg-tg-button text-tg-button-text border-tg-button shadow-sm'
                    : 'bg-tg-secondary-bg text-tg-text border-tg-separator hover:border-tg-button/50'
                }`}
              >
                {count} Flags
              </button>
            ))}
          </div>
        </div>

        {/* Timer Selector */}
        <div className="mb-6">
          <label className="text-xs font-semibold text-tg-hint uppercase tracking-wider mb-2 flex items-center gap-1.5">
            <Timer className="w-3.5 h-3.5 text-tg-button" />
            Time Limit
          </label>
          <div className="grid grid-cols-4 gap-2">
            {timerOptions.map((sec) => (
              <button
                key={sec}
                type="button"
                onClick={() => setDurationSeconds(sec)}
                className={`py-2 rounded-xl text-xs font-bold border transition-all ${
                  durationSeconds === sec
                    ? 'bg-tg-button text-tg-button-text border-tg-button shadow-sm'
                    : 'bg-tg-secondary-bg text-tg-text border-tg-separator hover:border-tg-button/50'
                }`}
              >
                {sec}s
              </button>
            ))}
          </div>
        </div>

        {/* Start Game Action */}
        <button
          type="button"
          onClick={() => onStart({ continent, flagCount, durationSeconds })}
          disabled={loading}
          className="w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl bg-tg-button text-tg-button-text font-bold text-sm shadow-md hover:opacity-90 active:scale-[0.99] transition-all disabled:opacity-50"
        >
          <Play className="w-4 h-4 fill-current" />
          {loading ? 'Starting Game...' : `Start ${flagCount} Flags (${durationSeconds}s)`}
        </button>
      </div>
    </div>
  );
}
