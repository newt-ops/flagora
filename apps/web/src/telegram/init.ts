import { isTMA, retrieveRawInitData, bindThemeParamsCssVars } from '@telegram-apps/sdk';

export interface TelegramInitResult {
  initData: string;
  isDev: boolean;
}

export class NotInTelegramError extends Error {
  readonly code = 'NOT_IN_TELEGRAM';
  constructor(message = 'This application must be launched from Telegram.') {
    super(message);
    this.name = 'NotInTelegramError';
  }
}

export async function initTelegramApp(): Promise<TelegramInitResult> {
  const inTelegram = isTMA();

  if (inTelegram) {
    try {
      bindThemeParamsCssVars();
    } catch {
      void 0;
    }

    const raw = retrieveRawInitData();
    if (raw) {
      return {
        initData: raw,
        isDev: false,
      };
    }
  }

  if (import.meta.env.DEV) {
    const { generateDevInitData } = await import('./devMock');
    const mockInitData = await generateDevInitData();
    return {
      initData: mockInitData,
      isDev: true,
    };
  }

  throw new NotInTelegramError();
}

