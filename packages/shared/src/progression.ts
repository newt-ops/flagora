export interface ProgressionConfig {
  xpPerScorePoint: number;
  coinsPerCorrect: number;
  xpPerLevel: number;
}

export const PROGRESSION_CONFIG: ProgressionConfig = {
  xpPerScorePoint: 0.1,
  coinsPerCorrect: 5,
  xpPerLevel: 500,
};

export function calculateXpEarned(totalScore: number): number {
  if (totalScore <= 0) {
    return 0;
  }
  return Math.floor(totalScore * PROGRESSION_CONFIG.xpPerScorePoint);
}

export function calculateCoinsEarned(correctCount: number): number {
  if (correctCount <= 0) {
    return 0;
  }
  return correctCount * PROGRESSION_CONFIG.coinsPerCorrect;
}

export function calculateLevel(totalXp: number): number {
  if (totalXp <= 0) {
    return 1;
  }
  return Math.floor(totalXp / PROGRESSION_CONFIG.xpPerLevel) + 1;
}
