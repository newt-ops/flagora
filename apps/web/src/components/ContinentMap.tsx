import { memo } from 'react';
import { ComposableMap, Geographies, Geography } from 'react-simple-maps';
import type { Continent } from '@flagora/shared';
import worldData from '../assets/world-110m.json';
import {
  getContinentFromGeoId,
  isAntarctica,
  getContinentStyle,
} from './continentMapHelpers.js';

interface ContinentMapProps {
  selectedContinent: Continent;
  onSelectContinent: (continent: Continent) => void;
}

const geoJsonData = worldData as unknown as string;

export const ContinentMap = memo(function ContinentMap({
  selectedContinent,
  onSelectContinent,
}: ContinentMapProps) {
  return (
    <div className="relative w-full rounded-2xl bg-tg-secondary-bg/50 p-2.5 overflow-hidden">
      <div className="relative w-full aspect-[2/1] flex items-center justify-center">
        <ComposableMap
          projection="geoNaturalEarth1"
          projectionConfig={{
            center: [0, 20],
            scale: 145,
          }}
          className="w-full h-full select-none"
        >
          <Geographies geography={geoJsonData}>
            {({ geographies }) =>
              geographies.map((geo) => {
                const geoId = geo.id;
                const antarctica = isAntarctica(geoId);
                const continent = getContinentFromGeoId(geoId);
                const style = getContinentStyle(continent, antarctica, selectedContinent);

                const handleClick = () => {
                  if (style.isClickable && continent) {
                    onSelectContinent(continent);
                  }
                };

                return (
                  <Geography
                    key={geo.rsmKey}
                    geography={geo}
                    onClick={handleClick}
                    fill={style.fill}
                    stroke={style.stroke}
                    strokeWidth={style.strokeWidth}
                    className={style.className}
                  />
                );
              })
            }
          </Geographies>
        </ComposableMap>

        <div className="absolute bottom-2 right-2 bg-tg-section/90 backdrop-blur-md px-2.5 py-1 rounded-full text-[11px] font-semibold text-tg-button uppercase tracking-wider pointer-events-none">
          {selectedContinent === 'world' ? 'All World' : selectedContinent}
        </div>
      </div>
    </div>
  );
});
