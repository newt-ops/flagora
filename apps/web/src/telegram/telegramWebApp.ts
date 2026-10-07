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
  openInvoice?: (
    url: string,
    callback?: (status: 'paid' | 'cancelled' | 'failed' | 'pending' | string) => void,
  ) => void;
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

  const safeInset = app?.safeAreaInset;
  const contentInset = app?.contentSafeAreaInset;
  const isFullscreen = Boolean(app?.isFullscreen);

  const safeTop = typeof safeInset?.top === 'number' ? safeInset.top : undefined;
  const safeBottom = typeof safeInset?.bottom === 'number' ? safeInset.bottom : undefined;
  const safeLeft = typeof safeInset?.left === 'number' ? safeInset.left : undefined;
  const safeRight = typeof safeInset?.right === 'number' ? safeInset.right : undefined;

  const contentTop = typeof contentInset?.top === 'number' ? contentInset.top : undefined;
  const contentBottom = typeof contentInset?.bottom === 'number' ? contentInset.bottom : undefined;
  const contentLeft = typeof contentInset?.left === 'number' ? contentInset.left : undefined;
  const contentRight = typeof contentInset?.right === 'number' ? contentInset.right : undefined;

  const resolvedSafeTop = safeTop ?? 0;
  const resolvedSafeBottom = safeBottom ?? 0;
  const resolvedSafeLeft = safeLeft ?? 0;
  const resolvedSafeRight = safeRight ?? 0;

  const resolvedContentTop = contentTop ?? 0;
  const resolvedContentBottom = contentBottom ?? 0;
  const resolvedContentLeft = contentLeft ?? 0;
  const resolvedContentRight = contentRight ?? 0;

  const hasReportedTop = typeof safeTop === 'number' || typeof contentTop === 'number';
  const fallbackTop = isFullscreen && !hasReportedTop ? 44 : 0;

  const topInset = Math.max(resolvedContentTop, resolvedSafeTop, fallbackTop);
  const bottomInset = Math.max(resolvedContentBottom, resolvedSafeBottom);
  const leftInset = Math.max(resolvedContentLeft, resolvedSafeLeft);
  const rightInset = Math.max(resolvedContentRight, resolvedSafeRight);

  const style = document.documentElement.style;
  style.setProperty('--tg-safe-area-inset-top', `${resolvedSafeTop}px`);
  style.setProperty('--tg-safe-area-inset-bottom', `${resolvedSafeBottom}px`);
  style.setProperty('--tg-safe-area-inset-left', `${resolvedSafeLeft}px`);
  style.setProperty('--tg-safe-area-inset-right', `${resolvedSafeRight}px`);

  style.setProperty('--tg-content-safe-area-inset-top', `${resolvedContentTop}px`);
  style.setProperty('--tg-content-safe-area-inset-bottom', `${resolvedContentBottom}px`);
  style.setProperty('--tg-content-safe-area-inset-left', `${resolvedContentLeft}px`);
  style.setProperty('--tg-content-safe-area-inset-right', `${resolvedContentRight}px`);

  style.setProperty('--tg-safe-top', `${topInset}px`);
  style.setProperty('--tg-safe-bottom', `${bottomInset}px`);
  style.setProperty('--tg-safe-left', `${leftInset}px`);
  style.setProperty('--tg-safe-right', `${rightInset}px`);

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
      void 0;
    }

    updateSafeAreaInsets(tg);

    try {
      tg.onEvent?.('safeAreaChanged', () => updateSafeAreaInsets(tg));
      tg.onEvent?.('contentSafeAreaChanged', () => updateSafeAreaInsets(tg));
      tg.onEvent?.('fullscreenChanged', () => updateSafeAreaInsets(tg));
      tg.onEvent?.('fullscreenFailed', () => updateSafeAreaInsets(tg));
    } catch {
      void 0;
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

export function openTelegramInvoice(
  invoiceLink: string,
  callback?: (status: 'paid' | 'cancelled' | 'failed' | 'pending' | string) => void,
): void {
  const tg = getTelegramWebApp();
  if (tg?.openInvoice) {
    tg.openInvoice(invoiceLink, callback);
  } else if (typeof window !== 'undefined') {
    window.open(invoiceLink, '_blank');
  }
}
