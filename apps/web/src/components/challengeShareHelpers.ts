import { getChallengeDeepLink } from '@flagora/shared';

interface TelegramWebApp {
  openTelegramLink?: (url: string) => void;
}

export function formatChallengeShareText(score: number): string {
  return `Beat my score: ${score.toLocaleString()} points in Flagora!`;
}

export function getTelegramShareUrl(deepLink: string, text: string): string {
  return `https://t.me/share/url?url=${encodeURIComponent(deepLink)}&text=${encodeURIComponent(text)}`;
}

export function shareChallenge(
  challengeId: string,
  score: number,
  botUsername?: string,
): void {
  const deepLink = getChallengeDeepLink(challengeId, botUsername);
  const text = formatChallengeShareText(score);
  const shareUrl = getTelegramShareUrl(deepLink, text);

  const telegramWebApp = (
    typeof window !== 'undefined'
      ? (window as unknown as { Telegram?: { WebApp?: TelegramWebApp } }).Telegram?.WebApp
      : undefined
  );

  if (typeof telegramWebApp?.openTelegramLink === 'function') {
    telegramWebApp.openTelegramLink(shareUrl);
  } else if (typeof window !== 'undefined' && typeof window.open === 'function') {
    window.open(shareUrl, '_blank');
  }
}
