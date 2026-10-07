import { STREAK_SAVE_PIN_COST } from '@flagora/shared';

export function getStreakSaveBannerCopy(streak: number, isPro: boolean): {
  title: string;
  subtitle: string;
  buttonText: string;
} {
  return {
    title: 'Keep your streak alive!',
    subtitle: isPro
      ? `Save your ${streak}-day streak for free with Pro`
      : `Save your ${streak}-day streak for ${STREAK_SAVE_PIN_COST} Pins`,
    buttonText: isPro ? 'Save Streak • Free' : `Save Streak • ${STREAK_SAVE_PIN_COST} Pins`,
  };
}
