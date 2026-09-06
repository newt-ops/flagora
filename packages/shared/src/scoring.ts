import type { FlagTier } from './flags.js';

export interface ScoringConfig {
  tierBasePoints: Record<FlagTier, number>;
  maxComboForMultiplier: number;
  comboStep: number;
  runDurationMs: number;
  leftoverBonusPerSecond: number;
}

export const SCORING_CONFIG: ScoringConfig = {
  tierBasePoints: {
    1: 50,
    2: 75,
    3: 100,
    4: 150,
  },
  maxComboForMultiplier: 5,
  comboStep: 0.1,
  runDurationMs: 60_000,
  leftoverBonusPerSecond: 10,
};

export function calculateComboMultiplier(comboCount: number): number {
  const effectiveCombo = Math.min(Math.max(0, comboCount), SCORING_CONFIG.maxComboForMultiplier);
  const multiplier = 1 + effectiveCombo * SCORING_CONFIG.comboStep;
  return Number(multiplier.toFixed(2));
}

export function calculateFlagPoints(tier: FlagTier, comboCount: number): number {
  const base = SCORING_CONFIG.tierBasePoints[tier] || 0;
  const multiplier = calculateComboMultiplier(comboCount);
  return Math.round(base * multiplier);
}

export function calculateLeftoverBonus(leftoverMs: number): number {
  if (leftoverMs <= 0) {
    return 0;
  }
  const leftoverSeconds = Math.floor(leftoverMs / 1000);
  return leftoverSeconds * SCORING_CONFIG.leftoverBonusPerSecond;
}

export interface PublicRunFlag {
  flagIndex: number;
  isoCode: string;
  choices: string[];
}

export interface StartRunResponse {
  runId: string;
  flags: PublicRunFlag[];
  runDurationMs: number;
}

export interface AnswerRunResponse {
  correct: boolean;
  comboCount: number;
  pointsThisFlag: number;
  runningTotal: number;
}

export interface FinishRunResponse {
  correctCount: number;
  timeUsedMs: number;
  maxCombo: number;
  leftoverBonus: number;
  totalScore: number;
  xpEarned: number;
  coinsEarned: number;
  newXp: number;
  newCoins: number;
  newLevel: number;
  leveledUp: boolean;
  bestScore: number;
  isNewBest: boolean;
}
