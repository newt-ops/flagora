export type ReferralStatus = 'pending-first-run' | 'completed';

export interface Referral {
  inviterTelegramUserId: number;
  newPlayerTelegramUserId: number;
  status: ReferralStatus;
  createdAt: Date | string;
  completedAt?: Date | string | null;
}
