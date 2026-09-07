import {
  calculateFlagPoints,
  calculateLeftoverBonus,
  calculateXpEarned,
  calculateCoinsEarned,
} from '@flagora/shared';
import {
  type GameRun,
  InvalidFlagIndexError,
  TimeExpiredError,
  FlagAlreadyAnsweredError,
} from './runTypes.js';

export interface ScoredAnswerResult {
  isCorrect: boolean;
  newCombo: number;
  pointsThisFlag: number;
  newRunningTotal: number;
  newMaxCombo: number;
  flagIndex: number;
  selectedIsoCode: string;
  answeredAt: Date;
}

export interface FinalizedRunResult {
  elapsedMs: number;
  timeUsedMs: number;
  leftoverMs: number;
  leftoverBonus: number;
  correctCount: number;
  totalScore: number;
  xpEarned: number;
  coinsEarned: number;
  finishedAt: Date;
}

export function scoreAnswer(
  run: GameRun,
  flagIndex: number,
  selectedIsoCode: string,
  serverNowMs: number = Date.now(),
): ScoredAnswerResult {
  if (flagIndex < 0 || flagIndex >= run.flags.length) {
    throw new InvalidFlagIndexError();
  }

  const elapsedMs = serverNowMs - new Date(run.startedAt).getTime();
  if (elapsedMs > run.runDurationMs) {
    throw new TimeExpiredError();
  }

  const flag = run.flags[flagIndex];
  if (flag.answered) {
    throw new FlagAlreadyAnsweredError();
  }

  const isCorrect =
    Boolean(selectedIsoCode) &&
    (selectedIsoCode.trim().toLowerCase() === flag.isoCode.toLowerCase() ||
      selectedIsoCode.trim().toLowerCase() === flag.name.toLowerCase());

  const newCombo = isCorrect ? run.comboCount + 1 : 0;
  const pointsThisFlag = isCorrect ? calculateFlagPoints(flag.tier, newCombo) : 0;
  const newRunningTotal = run.runningTotal + pointsThisFlag;
  const newMaxCombo = Math.max(run.maxCombo, newCombo);

  return {
    isCorrect,
    newCombo,
    pointsThisFlag,
    newRunningTotal,
    newMaxCombo,
    flagIndex,
    selectedIsoCode,
    answeredAt: new Date(serverNowMs),
  };
}

export function finalizeRun(
  run: GameRun,
  serverNowMs: number = Date.now(),
): FinalizedRunResult {
  const elapsedMs = Math.max(0, serverNowMs - new Date(run.startedAt).getTime());
  const timeUsedMs = Math.min(elapsedMs, run.runDurationMs);
  const leftoverMs = Math.max(0, run.runDurationMs - elapsedMs);
  const leftoverBonus = calculateLeftoverBonus(leftoverMs);
  const correctCount = run.flags.filter((f) => f.correct).length;
  const totalScore = run.runningTotal + leftoverBonus;
  const xpEarned = calculateXpEarned(totalScore);
  const coinsEarned = calculateCoinsEarned(correctCount);

  return {
    elapsedMs,
    timeUsedMs,
    leftoverMs,
    leftoverBonus,
    correctCount,
    totalScore,
    xpEarned,
    coinsEarned,
    finishedAt: new Date(serverNowMs),
  };
}
