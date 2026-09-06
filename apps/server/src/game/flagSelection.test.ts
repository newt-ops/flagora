import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { COUNTRIES, DEFAULT_RUN_TIER_MIX, type CountryFlag } from '@flagora/shared';
import { selectRunFlags, generateChoices } from './flagSelection.js';

describe('selectRunFlags', () => {
  it('selects exactly 10 flags matching the default tier mix', () => {
    const selected = selectRunFlags(DEFAULT_RUN_TIER_MIX, [], COUNTRIES);

    assert.equal(selected.length, 10);

    const tierCounts = { 1: 0, 2: 0, 3: 0, 4: 0 };
    for (const flag of selected) {
      tierCounts[flag.tier] += 1;
    }

    assert.equal(tierCounts[1], 4);
    assert.equal(tierCounts[2], 3);
    assert.equal(tierCounts[3], 2);
    assert.equal(tierCounts[4], 1);
  });

  it('never returns duplicate flags within the same selection', () => {
    const selected = selectRunFlags(DEFAULT_RUN_TIER_MIX, [], COUNTRIES);
    const codes = new Set(selected.map((f) => f.isoCode));

    assert.equal(codes.size, selected.length);
  });

  it('avoids picking flags specified in excludeIsoCodes', () => {
    const excludedCodes = ['us', 'gb', 'fr', 'de'];
    const selected = selectRunFlags(DEFAULT_RUN_TIER_MIX, excludedCodes, COUNTRIES);

    const selectedCodes = new Set(selected.map((f) => f.isoCode));
    for (const excluded of excludedCodes) {
      assert.equal(selectedCodes.has(excluded), false);
    }
  });

  it('falls back gracefully when excluded count exceeds available flags', () => {
    const tier1Flags = COUNTRIES.filter((f) => f.tier === 1);
    const allTier1Codes = tier1Flags.map((f) => f.isoCode);

    const selected = selectRunFlags({ 1: 3, 2: 0, 3: 0, 4: 0 }, allTier1Codes, COUNTRIES);

    assert.equal(selected.length, 3);
    const codes = new Set(selected.map((f) => f.isoCode));
    assert.equal(codes.size, 3);
  });
});

describe('generateChoices', () => {
  it('returns exactly 4 choices including the correct flag name', () => {
    const correctFlag: CountryFlag = {
      isoCode: 'jp',
      name: 'Japan',
      tier: 1,
    };
    const tier1Peers = COUNTRIES.filter((f) => f.tier === 1);

    const choices = generateChoices(correctFlag, tier1Peers);

    assert.equal(choices.length, 4);
    assert.ok(choices.includes('Japan'));

    const occurrences = choices.filter((c) => c === 'Japan').length;
    assert.equal(occurrences, 1);
  });

  it('never contains duplicate choices', () => {
    const correctFlag: CountryFlag = {
      isoCode: 'br',
      name: 'Brazil',
      tier: 1,
    };
    const tier1Peers = COUNTRIES.filter((f) => f.tier === 1);

    const choices = generateChoices(correctFlag, tier1Peers);
    const unique = new Set(choices);

    assert.equal(unique.size, 4);
  });

  it('distractors are drawn from same tier and differ from the correct flag', () => {
    const correctFlag: CountryFlag = {
      isoCode: 'ca',
      name: 'Canada',
      tier: 1,
    };
    const tier1Peers = COUNTRIES.filter((f) => f.tier === 1);
    const peerNames = new Set(tier1Peers.map((f) => f.name));

    const choices = generateChoices(correctFlag, tier1Peers);

    for (const choice of choices) {
      assert.ok(peerNames.has(choice));
    }
  });
});
