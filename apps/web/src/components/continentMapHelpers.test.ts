import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  getContinentFromGeoId,
  isAntarctica,
  getContinentStyle,
} from './continentMapHelpers.js';

describe('continentMapHelpers', () => {
  describe('getContinentFromGeoId', () => {
    it('resolves americas countries correctly', () => {
      assert.equal(getContinentFromGeoId('840'), 'americas');
      assert.equal(getContinentFromGeoId(840), 'americas');
      assert.equal(getContinentFromGeoId('124'), 'americas');
      assert.equal(getContinentFromGeoId('032'), 'americas');
      assert.equal(getContinentFromGeoId('076'), 'americas');
    });

    it('resolves europe countries correctly', () => {
      assert.equal(getContinentFromGeoId('250'), 'europe');
      assert.equal(getContinentFromGeoId('276'), 'europe');
      assert.equal(getContinentFromGeoId('826'), 'europe');
      assert.equal(getContinentFromGeoId('380'), 'europe');
      assert.equal(getContinentFromGeoId('724'), 'europe');
    });

    it('resolves africa countries correctly', () => {
      assert.equal(getContinentFromGeoId('834'), 'africa');
      assert.equal(getContinentFromGeoId('710'), 'africa');
      assert.equal(getContinentFromGeoId('566'), 'africa');
      assert.equal(getContinentFromGeoId('818'), 'africa');
    });

    it('resolves asia countries correctly', () => {
      assert.equal(getContinentFromGeoId('156'), 'asia');
      assert.equal(getContinentFromGeoId('356'), 'asia');
      assert.equal(getContinentFromGeoId('392'), 'asia');
      assert.equal(getContinentFromGeoId('682'), 'asia');
    });

    it('resolves oceania countries correctly', () => {
      assert.equal(getContinentFromGeoId('036'), 'oceania');
      assert.equal(getContinentFromGeoId('554'), 'oceania');
      assert.equal(getContinentFromGeoId('242'), 'oceania');
      assert.equal(getContinentFromGeoId('598'), 'oceania');
    });

    it('excludes Antarctica from americas and returns null', () => {
      assert.equal(getContinentFromGeoId('010'), null);
      assert.equal(getContinentFromGeoId(10), null);
    });

    it('returns null for unknown or invalid IDs', () => {
      assert.equal(getContinentFromGeoId(undefined), null);
      assert.equal(getContinentFromGeoId(null), null);
      assert.equal(getContinentFromGeoId('abc'), null);
      assert.equal(getContinentFromGeoId(9999), null);
    });
  });

  describe('isAntarctica', () => {
    it('identifies Antarctica accurately by numeric code 10 or 010', () => {
      assert.equal(isAntarctica('010'), true);
      assert.equal(isAntarctica(10), true);
      assert.equal(isAntarctica('840'), false);
      assert.equal(isAntarctica(undefined), false);
      assert.equal(isAntarctica(null), false);
    });
  });

  describe('getContinentStyle', () => {
    it('returns fixed neutral non-clickable styling for Antarctica', () => {
      const style = getContinentStyle(null, true, 'world');
      assert.equal(style.fill, 'rgba(128, 128, 128, 0.12)');
      assert.equal(style.stroke, 'none');
      assert.equal(style.strokeWidth, 0);
      assert.equal(style.isClickable, false);
      assert.ok(style.className.includes('cursor-default'));
    });

    it('returns active blue styling when selected continent matches', () => {
      const style = getContinentStyle('africa', false, 'africa');
      assert.equal(style.fill, '#378add');
      assert.equal(style.stroke, '#185fa5');
      assert.equal(style.strokeWidth, 1.5);
      assert.equal(style.isClickable, true);
      assert.ok(style.className.includes('cursor-pointer'));
    });

    it('returns translucent blue styling for mapped countries in world mode', () => {
      const style = getContinentStyle('europe', false, 'world');
      assert.equal(style.fill, 'rgba(55, 138, 221, 0.25)');
      assert.equal(style.stroke, '#378add');
      assert.equal(style.strokeWidth, 0.8);
      assert.equal(style.isClickable, true);
      assert.ok(style.className.includes('cursor-pointer'));
    });

    it('returns unselected styling when another continent is selected', () => {
      const style = getContinentStyle('asia', false, 'europe');
      assert.equal(style.fill, 'var(--tg-theme-secondary-bg-color, #232e3c)');
      assert.equal(style.stroke, 'rgba(128, 128, 128, 0.25)');
      assert.equal(style.strokeWidth, 0.5);
      assert.equal(style.isClickable, true);
      assert.ok(style.className.includes('cursor-pointer'));
    });

    it('returns non-clickable unselected styling for unmapped regions in single continent mode', () => {
      const style = getContinentStyle(null, false, 'asia');
      assert.equal(style.isClickable, false);
      assert.ok(style.className.includes('cursor-default'));
    });
  });
});
