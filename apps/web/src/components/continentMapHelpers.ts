import type { Continent } from '@flagora/shared';

const AMERICAS_COUNTRY_IDS = [
  124, 484, 840, 32, 68, 76, 152, 170, 218, 600, 604, 858, 862, 192, 214, 320, 340,
  388, 474, 558, 591, 630, 659, 662, 670, 780, 796, 332, 222, 328, 740, 84, 188,
];

const EUROPE_COUNTRY_IDS = [
  8, 20, 40, 56, 70, 100, 191, 196, 203, 208, 233, 246, 250, 276, 300, 348, 352, 372,
  380, 428, 438, 440, 442, 470, 492, 499, 528, 578, 616, 620, 642, 643, 674, 688, 703,
  705, 724, 752, 756, 792, 804, 807, 826, 112, 51, 31, 268, 498,
];

const AFRICA_COUNTRY_IDS = [
  12, 24, 204, 72, 86, 108, 120, 132, 140, 148, 174, 178, 180, 188, 262, 818, 231, 266,
  288, 324, 624, 384, 404, 426, 430, 434, 450, 454, 466, 478, 504, 508, 516, 562, 566,
  646, 678, 686, 694, 706, 710, 729, 716, 728, 768, 788, 800, 834, 894, 854,
];

const ASIA_COUNTRY_IDS = [
  4, 50, 64, 96, 104, 116, 156, 626, 356, 360, 364, 368, 376, 392, 400, 398, 408, 410,
  414, 418, 422, 458, 462, 496, 524, 512, 586, 275, 608, 634, 682, 702, 144, 760, 764,
  762, 795, 860, 887, 704,
];

const OCEANIA_COUNTRY_IDS = [
  36, 242, 583, 584, 520, 554, 585, 598, 882, 90, 776, 548, 798,
];

const CONTINENT_BY_COUNTRY_ID = new Map<number, Continent>();

for (const id of AMERICAS_COUNTRY_IDS) {
  CONTINENT_BY_COUNTRY_ID.set(id, 'americas');
}
for (const id of EUROPE_COUNTRY_IDS) {
  CONTINENT_BY_COUNTRY_ID.set(id, 'europe');
}
for (const id of AFRICA_COUNTRY_IDS) {
  CONTINENT_BY_COUNTRY_ID.set(id, 'africa');
}
for (const id of ASIA_COUNTRY_IDS) {
  CONTINENT_BY_COUNTRY_ID.set(id, 'asia');
}
for (const id of OCEANIA_COUNTRY_IDS) {
  CONTINENT_BY_COUNTRY_ID.set(id, 'oceania');
}

export function isAntarctica(geoId: string | number | undefined | null): boolean {
  if (geoId === undefined || geoId === null) return false;
  const num = Number(geoId);
  return num === 10;
}

export function getContinentFromGeoId(
  geoId: string | number | undefined | null,
): Continent | null {
  if (geoId === undefined || geoId === null) return null;
  const num = Number(geoId);
  if (isNaN(num) || num === 10) return null;
  return CONTINENT_BY_COUNTRY_ID.get(num) ?? null;
}

export interface GeographyStyleConfig {
  fill: string;
  stroke: string;
  strokeWidth: number;
  className: string;
  isClickable: boolean;
}

export function getContinentStyle(
  geoContinent: Continent | null,
  isAntarcticaGeo: boolean,
  selectedContinent: Continent,
): GeographyStyleConfig {
  if (isAntarcticaGeo) {
    return {
      fill: 'rgba(128, 128, 128, 0.12)',
      stroke: 'none',
      strokeWidth: 0,
      className: 'outline-none cursor-default',
      isClickable: false,
    };
  }

  if (selectedContinent === 'world') {
    if (!geoContinent) {
      return {
        fill: 'var(--tg-theme-secondary-bg-color, #232e3c)',
        stroke: 'rgba(128, 128, 128, 0.25)',
        strokeWidth: 0.5,
        className: 'outline-none cursor-default',
        isClickable: false,
      };
    }
    return {
      fill: 'rgba(55, 138, 221, 0.25)',
      stroke: '#378add',
      strokeWidth: 0.8,
      className: 'transition-colors duration-200 outline-none cursor-pointer hover:opacity-75',
      isClickable: true,
    };
  }

  if (geoContinent && selectedContinent === geoContinent) {
    return {
      fill: '#378add',
      stroke: '#185fa5',
      strokeWidth: 1.5,
      className: 'transition-colors duration-200 outline-none cursor-pointer hover:opacity-90',
      isClickable: true,
    };
  }

  return {
    fill: 'var(--tg-theme-secondary-bg-color, #232e3c)',
    stroke: 'rgba(128, 128, 128, 0.25)',
    strokeWidth: 0.5,
    className: geoContinent
      ? 'transition-colors duration-200 outline-none cursor-pointer hover:opacity-70'
      : 'outline-none cursor-default',
    isClickable: geoContinent !== null,
  };
}
