export class CosmeticItemNotFoundError extends Error {
  constructor(message = 'Cosmetic item not found') {
    super(message);
    this.name = 'CosmeticItemNotFoundError';
  }
}

export class ItemAlreadyOwnedError extends Error {
  constructor(message = 'Item is already owned') {
    super(message);
    this.name = 'ItemAlreadyOwnedError';
  }
}

export class InsufficientCoinsError extends Error {
  public readonly required: number;
  public readonly available: number;

  constructor(required: number, available: number, message = 'Insufficient coins') {
    super(message);
    this.name = 'InsufficientCoinsError';
    this.required = required;
    this.available = available;
  }
}

export class ItemNotOwnedError extends Error {
  constructor(message = 'Item is not owned by the player') {
    super(message);
    this.name = 'ItemNotOwnedError';
  }
}

export class ProfileNotFoundError extends Error {
  constructor(message = 'Player profile not found') {
    super(message);
    this.name = 'ProfileNotFoundError';
  }
}
