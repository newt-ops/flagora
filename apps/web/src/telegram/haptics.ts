import { isTMA, hapticFeedbackNotificationOccurred } from '@telegram-apps/sdk';

export function triggerHaptic(type: 'success' | 'error' | 'warning'): void {
  try {
    if (isTMA()) {
      hapticFeedbackNotificationOccurred(type);
    }
  } catch {
    void 0;
  }
}
