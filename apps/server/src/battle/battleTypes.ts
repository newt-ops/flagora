export class BattleNotFoundError extends Error {
  constructor(message = 'Battle not found') {
    super(message);
    this.name = 'BattleNotFoundError';
  }
}

export class BattleExpiredError extends Error {
  constructor(message = 'Battle has expired') {
    super(message);
    this.name = 'BattleExpiredError';
  }
}

export class SelfBattleNotAllowedError extends Error {
  constructor(message = 'You cannot join your own battle') {
    super(message);
    this.name = 'SelfBattleNotAllowedError';
  }
}

export class BattleAlreadyJoinedError extends Error {
  constructor(message = 'Battle already has an opponent or is no longer waiting') {
    super(message);
    this.name = 'BattleAlreadyJoinedError';
  }
}

export class UnauthorizedBattleAccessError extends Error {
  constructor(message = 'You are not a participant in this battle') {
    super(message);
    this.name = 'UnauthorizedBattleAccessError';
  }
}
