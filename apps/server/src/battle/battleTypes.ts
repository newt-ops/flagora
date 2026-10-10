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

export class BattleNotInProgressError extends Error {
  constructor(message = 'Battle is not in progress') {
    super(message);
    this.name = 'BattleNotInProgressError';
  }
}

export class LobbyFullError extends Error {
  constructor(message = 'Battle lobby is full') {
    super(message);
    this.name = 'LobbyFullError';
  }
}

export class BattleHostRequiredError extends Error {
  constructor(message = 'Only the battle host can perform this action') {
    super(message);
    this.name = 'BattleHostRequiredError';
  }
}

export class InsufficientPlayersError extends Error {
  constructor(message = 'At least 2 players are required to start a battle') {
    super(message);
    this.name = 'InsufficientPlayersError';
  }
}

export class GroupLobbyConflictError extends Error {
  constructor(message = 'An active battle lobby already exists in this group') {
    super(message);
    this.name = 'GroupLobbyConflictError';
  }
}

export class BattleAlreadyStartedError extends Error {
  constructor(message = 'Battle has already started') {
    super(message);
    this.name = 'BattleAlreadyStartedError';
  }
}
