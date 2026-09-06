export interface DailyChallengeAttempt {
  telegramUserId: number;
  date: string;
  runId: string;
  createdAt: Date;
}

export class DailyChallengeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

export class DailyChallengeAlreadyAttemptedError extends DailyChallengeError {
  constructor(message = 'Daily challenge already attempted today') {
    super(message);
  }
}
