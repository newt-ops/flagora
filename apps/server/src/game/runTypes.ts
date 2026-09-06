import type { FlagTier, FinishRunResponse } from '@flagora/shared';

export interface RunFlagItem {
  flagIndex: number;
  isoCode: string;
  name: string;
  tier: FlagTier;
  choices: string[];
  answered: boolean;
  selectedIsoCode?: string;
  correct?: boolean;
  points?: number;
  comboCount?: number;
  answeredAt?: Date;
}

export interface GameRun {
  runId: string;
  telegramUserId: number;
  flags: RunFlagItem[];
  comboCount: number;
  maxCombo: number;
  runningTotal: number;
  startedAt: Date;
  finishedAt?: Date;
  status: 'active' | 'finished' | 'expired';
  mode?: 'practice' | 'daily';
  dailyDate?: string;
  profileCredited: boolean;
  runDurationMs: number;
  finalScore?: FinishRunResponse;
  createdAt: Date;
  updatedAt: Date;
}

export class RunError extends Error {
  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

export class RunNotFoundError extends RunError {
  constructor(message = 'Run not found') {
    super(message);
  }
}

export class UnauthorizedRunAccessError extends RunError {
  constructor(message = 'You are not authorized to access this run') {
    super(message);
  }
}

export class RunAlreadyFinishedError extends RunError {
  constructor(message = 'Run is already finished') {
    super(message);
  }
}

export class FlagAlreadyAnsweredError extends RunError {
  constructor(message = 'This flag has already been answered') {
    super(message);
  }
}

export class TimeExpiredError extends RunError {
  constructor(message = 'Time has expired for this run') {
    super(message);
  }
}

export class InvalidFlagIndexError extends RunError {
  constructor(message = 'Invalid flag index') {
    super(message);
  }
}
