interface TelegramBackButton {
  show: () => void;
  hide: () => void;
  onClick: (callback: () => void) => void;
  offClick: (callback: () => void) => void;
}

export interface TelegramSafeAreaInset {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

export interface TelegramWebAppInstance {
  ready?: () => void;
  expand?: () => void;
  requestFullscreen?: () => void;
  exitFullscreen?: () => void;
  isFullscreen?: boolean;
  safeAreaInset?: TelegramSafeAreaInset;
  contentSafeAreaInset?: TelegramSafeAreaInset;
  onEvent?: (eventType: string, callback: () => void) => void;
  offEvent?: (eventType: string, callback: () => void) => void;
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

export function updateSafeAreaInsets(tg?: TelegramWebAppInstance): void {
  const app = tg ?? getTelegramWebApp();
  if (typeof document === 'undefined') return;

  const contentTop = app?.contentSafeAreaInset?.top;
  const safeTop = app?.safeAreaInset?.top;
  const isFullscreen = Boolean(app?.isFullscreen);

  const topInset = Math.max(
    typeof contentTop === 'number' ? contentTop : 0,
    typeof safeTop === 'number' ? safeTop : 0,
    isFullscreen ? 44 : 0,
  );

  document.documentElement.style.setProperty('--tg-safe-top', `${topInset}px`);
  if (isFullscreen) {
    document.documentElement.classList.add('tg-fullscreen');
  } else {
    document.documentElement.classList.remove('tg-fullscreen');
  }
}

export function initTelegramWebApp(): void {
  const tg = getTelegramWebApp();
  if (tg) {
    tg.ready?.();
    tg.expand?.();
    try {
      tg.requestFullscreen?.();
    } catch {
      // requestFullscreen not supported on older Telegram clients
    }

    updateSafeAreaInsets(tg);

    try {
      tg.onEvent?.('safeAreaChanged', () => updateSafeAreaInsets(tg));
      tg.onEvent?.('contentSafeAreaChanged', () => updateSafeAreaInsets(tg));
      tg.onEvent?.('fullscreenChanged', () => updateSafeAreaInsets(tg));
    } catch {
      // safe area events not supported on older clients
    }
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
