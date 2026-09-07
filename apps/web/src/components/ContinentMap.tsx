import type { Continent } from '@flagora/shared';

interface ContinentMapProps {
  selectedContinent: Continent;
  onSelectContinent: (continent: Continent) => void;
}

export function ContinentMap({ selectedContinent, onSelectContinent }: ContinentMapProps) {
  const getFillColor = (c: Continent) => {
    if (selectedContinent === c) return 'var(--tg-theme-button-color, #2481cc)';
    if (selectedContinent === 'world') return 'rgba(36, 129, 204, 0.45)';
    return 'var(--tg-theme-secondary-bg-color, #232e3c)';
  };

  const getStrokeColor = (c: Continent) => {
    if (selectedContinent === c) return '#ffffff';
    if (selectedContinent === 'world') return 'var(--tg-theme-button-color, #2481cc)';
    return 'var(--tg-theme-section-separator-color, #303e4d)';
  };

  return (
    <div className="relative w-full rounded-2xl bg-tg-secondary-bg/50 border border-tg-separator p-2.5 overflow-hidden">
      <div className="relative w-full aspect-[2/1] flex items-center justify-center">
        <svg
          viewBox="0 0 1000 500"
          className="w-full h-full drop-shadow-sm select-none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <title>World Continents Map</title>
          <g stroke="rgba(128,128,128,0.12)" strokeWidth="1" strokeDasharray="4 4">
            <line x1="0" y1="250" x2="1000" y2="250" />
            <line x1="500" y1="0" x2="500" y2="500" />
          </g>

          <g
            className="cursor-pointer transition-all duration-300 hover:opacity-90"
            onClick={() => onSelectContinent('americas')}
          >
            <path
              d="M140,50 L260,40 L340,70 L380,110 L300,160 L240,190 L210,240 L190,260 L180,240 L150,170 L110,130 L100,80 Z"
              fill={getFillColor('americas')}
              stroke={getStrokeColor('americas')}
              strokeWidth="2"
              className="transition-colors duration-300"
            />
            <path
              d="M190,260 L220,280 L240,300 L215,310 L185,270 Z"
              fill={getFillColor('americas')}
              stroke={getStrokeColor('americas')}
              strokeWidth="1.5"
              className="transition-colors duration-300"
            />
            <path
              d="M230,300 L320,310 L360,370 L330,440 L270,470 L250,440 L230,360 L215,310 Z"
              fill={getFillColor('americas')}
              stroke={getStrokeColor('americas')}
              strokeWidth="2"
              className="transition-colors duration-300"
            />
          </g>

          <g
            className="cursor-pointer transition-all duration-300 hover:opacity-90"
            onClick={() => onSelectContinent('europe')}
          >
            <path
              d="M450,80 L520,70 L580,90 L600,150 L540,180 L480,185 L440,160 L430,120 L450,80 Z"
              fill={getFillColor('europe')}
              stroke={getStrokeColor('europe')}
              strokeWidth="2"
              className="transition-colors duration-300"
            />
            <path
              d="M430,110 L445,100 L440,130 L425,125 Z M480,45 L520,40 L530,90 L500,100 Z"
              fill={getFillColor('europe')}
              stroke={getStrokeColor('europe')}
              strokeWidth="1.5"
              className="transition-colors duration-300"
            />
          </g>

          <g
            className="cursor-pointer transition-all duration-300 hover:opacity-90"
            onClick={() => onSelectContinent('africa')}
          >
            <path
              d="M440,195 L560,190 L610,240 L580,330 L550,390 L500,430 L460,380 L440,290 L420,240 Z"
              fill={getFillColor('africa')}
              stroke={getStrokeColor('africa')}
              strokeWidth="2"
              className="transition-colors duration-300"
            />
            <path
              d="M605,340 L620,350 L610,395 L595,385 Z"
              fill={getFillColor('africa')}
              stroke={getStrokeColor('africa')}
              strokeWidth="1.5"
              className="transition-colors duration-300"
            />
          </g>

          <g
            className="cursor-pointer transition-all duration-300 hover:opacity-90"
            onClick={() => onSelectContinent('asia')}
          >
            <path
              d="M590,80 L760,60 L870,100 L890,180 L840,240 L760,280 L710,280 L670,220 L610,210 L590,140 Z"
              fill={getFillColor('asia')}
              stroke={getStrokeColor('asia')}
              strokeWidth="2"
              className="transition-colors duration-300"
            />
            <path
              d="M660,220 L710,240 L690,300 L660,270 Z M760,270 L800,280 L780,340 L740,320 Z"
              fill={getFillColor('asia')}
              stroke={getStrokeColor('asia')}
              strokeWidth="1.5"
              className="transition-colors duration-300"
            />
            <path
              d="M875,180 L895,190 L885,230 L865,210 Z"
              fill={getFillColor('asia')}
              stroke={getStrokeColor('asia')}
              strokeWidth="1.5"
              className="transition-colors duration-300"
            />
          </g>

          <g
            className="cursor-pointer transition-all duration-300 hover:opacity-90"
            onClick={() => onSelectContinent('oceania')}
          >
            <path
              d="M780,360 L890,360 L910,420 L870,460 L800,450 L760,400 Z"
              fill={getFillColor('oceania')}
              stroke={getStrokeColor('oceania')}
              strokeWidth="2"
              className="transition-colors duration-300"
            />
            <path
              d="M930,440 L945,455 L925,485 L915,470 Z M820,320 L860,330 L840,345 Z"
              fill={getFillColor('oceania')}
              stroke={getStrokeColor('oceania')}
              strokeWidth="1.5"
              className="transition-colors duration-300"
            />
          </g>
        </svg>

        <div className="absolute bottom-2 right-2 bg-tg-section/90 backdrop-blur-md px-2.5 py-1 rounded-full border border-tg-separator text-[11px] font-semibold text-tg-button uppercase tracking-wider">
          {selectedContinent === 'world' ? 'All World' : selectedContinent}
        </div>
      </div>
    </div>
  );
}
