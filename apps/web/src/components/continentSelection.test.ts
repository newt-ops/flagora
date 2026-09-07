import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { COUNTRIES, getCountriesByContinent, type Continent } from '@flagora/shared';

describe('continentSelection and flag dataset', () => {
  it('contains exactly 194 sovereign countries in the global list', () => {
    assert.equal(COUNTRIES.length, 194);
  });

  it('strictly excludes Israel (il) from the entire country list', () => {
    const israelFound = COUNTRIES.some(
      (c) => c.isoCode.toLowerCase() === 'il' || c.name.toLowerCase().includes('israel'),
    );
    assert.equal(israelFound, false);
  });

  it('includes Palestine (ps) with Tier 1 in Asia', () => {
    const palestine = COUNTRIES.find((c) => c.isoCode.toLowerCase() === 'ps');
    assert.ok(palestine, 'Palestine should be present in country list');
    assert.equal(palestine.tier, 1);
    assert.equal(palestine.continent, 'asia');
  });

  it('correctly filters countries by each continent', () => {
    const continents: Continent[] = ['africa', 'asia', 'europe', 'americas', 'oceania'];

    for (const continent of continents) {
      const filtered = getCountriesByContinent(continent);
      assert.ok(filtered.length > 0, `Continent ${continent} should have countries`);
      for (const country of filtered) {
        assert.equal(
          country.continent,
          continent,
          `Country ${country.isoCode} should belong to continent ${continent}`,
        );
      }
    }
  });

  it('world continent returns all 194 countries', () => {
    const world = getCountriesByContinent('world');
    assert.equal(world.length, 194);
  });

  it('sum of countries across all 5 continents equals 194', () => {
    const africa = getCountriesByContinent('africa').length;
    const asia = getCountriesByContinent('asia').length;
    const europe = getCountriesByContinent('europe').length;
    const americas = getCountriesByContinent('americas').length;
    const oceania = getCountriesByContinent('oceania').length;

    assert.equal(africa + asia + europe + americas + oceania, 194);
  });
});
