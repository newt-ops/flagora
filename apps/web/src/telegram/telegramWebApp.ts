interface TelegramBackButton {
  show: () => void;
  hide: () => void;
  onClick: (callback: () => void) => void;
  offClick: (callback: () => void) => void;
}

export interface TelegramWebAppInstance {
  ready?: () => void;
  expand?: () => void;
  BackButton?: TelegramBackButton;
}

export function getTelegramWebApp(): TelegramWebAppInstance | undefined {
  const root =
    typeof window !== 'undefined'
      ? window
      : typeof globalThis !== 'undefined'
      ? globalThis
      : undefined;
  if (!root) {
    return undefined;
  }
  return (root as unknown as { Telegram?: { WebApp?: TelegramWebAppInstance } })
    .Telegram?.WebApp;
}

export function initTelegramWebApp(): void {
  const tg = getTelegramWebApp();
  if (tg) {
    tg.ready?.();
    tg.expand?.();
  }
}

export function syncTelegramBackButton(
  isVisible: boolean,
  onBack: () => void,
): (() => void) | undefined {
  const tg = getTelegramWebApp();
  const backButton = tg?.BackButton;
  if (!backButton) {
    return undefined;
  }

  if (isVisible) {
    backButton.show();
    backButton.onClick(onBack);
    return () => {
      backButton.offClick(onBack);
    };
  } else {
    backButton.hide();
    return undefined;
  }
}
