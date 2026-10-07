import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { getStreakSaveBannerCopy } from './rewardUiHelpers.js';
import { STREAK_SAVE_PIN_COST } from '@flagora/shared';

describe('rewardUiHelpers', () => {
  it('formats streak-save copy for non-pro user with pin cost', () => {
    const copy1 = getStreakSaveBannerCopy(1, false);
    assert.equal(copy1.title, 'Keep your streak alive!');
    assert.equal(copy1.subtitle, `Save your 1-day streak for ${STREAK_SAVE_PIN_COST} Pins`);
    assert.equal(copy1.buttonText, `Save Streak • ${STREAK_SAVE_PIN_COST} Pins`);

    const copy5 = getStreakSaveBannerCopy(5, false);
    assert.equal(copy5.title, 'Keep your streak alive!');
    assert.equal(copy5.subtitle, `Save your 5-day streak for ${STREAK_SAVE_PIN_COST} Pins`);
    assert.equal(copy5.buttonText, `Save Streak • ${STREAK_SAVE_PIN_COST} Pins`);
  });

  it('formats streak-save copy for pro user as free', () => {
    const copy1 = getStreakSaveBannerCopy(1, true);
    assert.equal(copy1.title, 'Keep your streak alive!');
    assert.equal(copy1.subtitle, 'Save your 1-day streak for free with Pro');
    assert.equal(copy1.buttonText, 'Save Streak • Free');

    const copy10 = getStreakSaveBannerCopy(10, true);
    assert.equal(copy10.title, 'Keep your streak alive!');
    assert.equal(copy10.subtitle, 'Save your 10-day streak for free with Pro');
    assert.equal(copy10.buttonText, 'Save Streak • Free');
  });
});
