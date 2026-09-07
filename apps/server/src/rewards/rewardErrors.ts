export class RewardTokenError extends Error {
  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

export class RewardCapReachedError extends RewardTokenError {
  readonly telegramUserId: number;
  readonly rewardType: string;
  readonly dailyCap: number;
  readonly usedCount: number;
  readonly resetAtUtc: string;

  constructor(
    telegramUserId: number,
    rewardType: string,
    dailyCap: number,
    usedCount: number,
    resetAtUtc: string,
    message?: string,
  ) {
    super(message ?? `Daily cap of ${dailyCap} reached for reward type '${rewardType}'`);
    this.telegramUserId = telegramUserId;
    this.rewardType = rewardType;
    this.dailyCap = dailyCap;
    this.usedCount = usedCount;
    this.resetAtUtc = resetAtUtc;
  }
}

export class InvalidRewardTypeError extends RewardTokenError {
  readonly rewardType: string;

  constructor(rewardType: string, message?: string) {
    super(message ?? `Invalid or unsupported reward type: '${rewardType}'`);
    this.rewardType = rewardType;
  }
}

export class InvalidRewardTokenError extends RewardTokenError {
  constructor(message = 'Reward token is invalid') {
    super(message);
  }
}

export class ExpiredRewardTokenError extends RewardTokenError {
  constructor(message = 'Reward token has expired') {
    super(message);
  }
}

export class RewardTypeMismatchError extends RewardTokenError {
  readonly expectedRewardType: string;
  readonly actualRewardType: string;

  constructor(expectedRewardType: string, actualRewardType: string, message?: string) {
    super(
      message ??
        `Reward token type mismatch: expected '${expectedRewardType}', received '${actualRewardType}'`,
    );
    this.expectedRewardType = expectedRewardType;
    this.actualRewardType = actualRewardType;
  }
}

export class RewardTokenAlreadyRedeemedError extends RewardTokenError {
  constructor(message = 'Reward token has already been redeemed or expired') {
    super(message);
  }
}

export class UnauthorizedTokenRedemptionError extends RewardTokenError {
  constructor(message = 'Token was not issued for this user') {
    super(message);
  }
}

export class StreakNotAtRiskError extends RewardTokenError {
  constructor(message = 'Streak is not currently at risk') {
    super(message);
  }
}
