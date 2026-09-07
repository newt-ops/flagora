export class ChallengeNotFoundError extends Error {
  constructor(message = 'Challenge not found') {
    super(message);
    this.name = 'ChallengeNotFoundError';
  }
}

export class ChallengeExpiredError extends Error {
  constructor(message = 'Challenge has expired') {
    super(message);
    this.name = 'ChallengeExpiredError';
  }
}

export class UnauthorizedChallengeAccessError extends Error {
  constructor(message = 'Unauthorized challenge access') {
    super(message);
    this.name = 'UnauthorizedChallengeAccessError';
  }
}

export class ChallengeAlreadyCompletedError extends Error {
  constructor(message = 'Challenge is already completed') {
    super(message);
    this.name = 'ChallengeAlreadyCompletedError';
  }
}

export class SelfChallengeNotAllowedError extends Error {
  constructor(message = 'Cannot accept your own challenge') {
    super(message);
    this.name = 'SelfChallengeNotAllowedError';
  }
}

export class ChallengeAlreadyAcceptedError extends Error {
  constructor(message = 'Challenge has already been accepted by another player') {
    super(message);
    this.name = 'ChallengeAlreadyAcceptedError';
  }
}
