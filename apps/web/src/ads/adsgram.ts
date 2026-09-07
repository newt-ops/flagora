import {
  requestBonusCoinsIntent,
  redeemBonusCoins,
  requestStreakSaveIntent,
  redeemStreakSave,
  RewardCapReachedApiError,
  StreakNotAtRiskApiError,
} from '../api/client.js';
import type {
  RewardType,
  AdsgramController,
  AdsgramInitOptions,
  ShowPromiseResult,
  AdOutcome,
  ShowRewardedAdOptions,
} from './adsgramTypes.js';

declare global {
  interface Window {
    Adsgram?: {
      init(options: AdsgramInitOptions): AdsgramController;
    };
  }
}

let cachedController: AdsgramController | null = null;
let cachedBlockId: string | null = null;

export function getAdsgramBlockId(): string {
  const envBlockId =
    typeof import.meta !== 'undefined' && import.meta.env?.VITE_ADSGRAM_BLOCK_ID;
  if (envBlockId && typeof envBlockId === 'string' && envBlockId.trim() !== '') {
    return envBlockId.trim();
  }
  return '46708';
}

export function getAdsgramController(
  options?: Partial<AdsgramInitOptions>,
): AdsgramController | null {
  if (typeof window === 'undefined' || !window.Adsgram?.init) {
    return null;
  }

  const blockId = options?.blockId ?? getAdsgramBlockId();
  if (cachedController && cachedBlockId === blockId && !options?.debug) {
    return cachedController;
  }

  const controller = window.Adsgram.init({
    blockId,
    debug: options?.debug,
    debugBannerType: options?.debugBannerType,
    debugConsole: options?.debugConsole,
  });

  if (!options?.debug) {
    cachedController = controller;
    cachedBlockId = blockId;
  }

  return controller;
}

export function resetAdsgramController(): void {
  if (cachedController?.destroy) {
    try {
      cachedController.destroy();
    } catch {
      void 0;
    }
  }
  cachedController = null;
  cachedBlockId = null;
}

export async function showRewardedAd(
  rewardType: RewardType,
  sessionToken: string,
  options?: ShowRewardedAdOptions,
): Promise<AdOutcome> {
  let intentToken: string;

  try {
    if (rewardType === 'bonus-coins') {
      const intent = await requestBonusCoinsIntent(sessionToken);
      intentToken = intent.token;
    } else {
      const intent = await requestStreakSaveIntent(sessionToken);
      intentToken = intent.token;
    }
  } catch (error) {
    if (error instanceof RewardCapReachedApiError) {
      return {
        status: 'cap_reached',
        rewardType,
        dailyCap: error.dailyCap,
        usedCount: error.usedCount,
        resetAtUtc: error.resetAtUtc,
        message: error.message || 'Daily cap reached for this reward',
      };
    }

    if (error instanceof StreakNotAtRiskApiError) {
      return {
        status: 'not_at_risk',
        rewardType: 'streak-save',
        message: error.message || 'Streak is not at risk',
      };
    }

    const message = error instanceof Error ? error.message : 'Failed to obtain reward token';
    return {
      status: 'error',
      rewardType,
      message,
      error,
    };
  }

  const controller =
    options?.controller ??
    getAdsgramController({
      blockId: options?.blockId ?? getAdsgramBlockId(),
      debug: options?.debug,
    });

  if (!controller) {
    return {
      status: 'unavailable',
      rewardType,
      message: 'No ad available right now, try again later',
      reason: 'AdsGram SDK is not loaded or unavailable',
    };
  }

  let showResult: ShowPromiseResult;

  try {
    showResult = await controller.show();
  } catch (error: unknown) {
    const errorObj = error as Partial<ShowPromiseResult> | Error | undefined;
    const description =
      (errorObj && 'description' in errorObj && typeof errorObj.description === 'string'
        ? errorObj.description
        : error instanceof Error
          ? error.message
          : '') || '';
    const state =
      errorObj && 'state' in errorObj && typeof errorObj.state === 'string'
        ? errorObj.state
        : '';

    const lowerDesc = description.toLowerCase();

    if (lowerDesc.includes('skipped') || lowerDesc.includes('skip') || state === 'skip') {
      return {
        status: 'skipped',
        rewardType,
        message: 'Ad was skipped',
      };
    }

    if (
      state === 'load' ||
      lowerDesc.includes('no banner') ||
      lowerDesc.includes('no ads available') ||
      lowerDesc.includes('not found') ||
      lowerDesc.includes('load')
    ) {
      return {
        status: 'unavailable',
        rewardType,
        message: 'No ad available right now, try again later',
        reason: description || 'Ad load failed',
      };
    }

    return {
      status: 'error',
      rewardType,
      message: description || 'Failed to display ad',
      error,
    };
  }

  if (!showResult || !showResult.done) {
    const desc = showResult?.description || '';
    const lowerDesc = desc.toLowerCase();

    if (lowerDesc.includes('skipped') || lowerDesc.includes('skip')) {
      return {
        status: 'skipped',
        rewardType,
        message: 'Ad was skipped',
      };
    }

    if (
      showResult?.state === 'load' ||
      lowerDesc.includes('no banner') ||
      lowerDesc.includes('no ads available')
    ) {
      return {
        status: 'unavailable',
        rewardType,
        message: 'No ad available right now, try again later',
        reason: desc || 'Ad not completed',
      };
    }

    return {
      status: 'skipped',
      rewardType,
      message: desc || 'Ad was not completed',
    };
  }

  try {
    if (rewardType === 'bonus-coins') {
      const data = await redeemBonusCoins(sessionToken, intentToken);
      return {
        status: 'rewarded',
        rewardType: 'bonus-coins',
        data,
      };
    }

    const data = await redeemStreakSave(sessionToken, intentToken);
    return {
      status: 'rewarded',
      rewardType: 'streak-save',
      data,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to redeem reward';
    return {
      status: 'error',
      rewardType,
      message,
      error,
    };
  }
}
