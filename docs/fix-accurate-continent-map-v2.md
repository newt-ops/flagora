# Fix: Accurate Continent Map — react-simple-maps + Telegram Blue Styling

Read `MASTER_PROMPT.md` and `FLAGORA_GAME_SYSTEM_GUIDE.md` before starting.
This replaces `apps/web/src/components/ContinentMap.tsx` with an accurate,
geographic world map that looks native to Telegram. The current component
uses hand-drawn SVG blob paths that don't resemble real continent outlines.

## Why react-simple-maps

There is no way to produce accurate continent outlines with hand-drawn SVG
paths in a maintainable way. `react-simple-maps` renders real Natural Earth
geographic data (public domain) as flat SVG, which is then styled to match
Flagora's Telegram design language. The geographic accuracy comes from the
library; the Telegram-native feel comes from the styling decisions below.

## Install

Add to `apps/web/package.json` dependencies:
- `react-simple-maps` (latest — MIT licensed)
- `topojson-client` (for parsing the bundled world data)

Add type declarations if needed:
- `@types/topojson-client` to devDependencies

## World data

Download `https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json`
and save it as `apps/web/src/assets/world-110m.json`. This is a public
domain Natural Earth dataset at 110m resolution — low enough detail to
look clean at this zoom level, not cluttered with tiny islands and jagged
coastlines. Import it as a static JSON asset (Vite handles this natively),
not fetched at runtime.

## Continent grouping

Natural Earth's 110m country dataset uses numeric country codes (ISO 3166-1
numeric). Group them into Flagora's five `Continent` values from
`@flagora/shared` using this mapping applied to each geography's `id`
property:

```
americas: [
  124,484,840,032,068,076,152,170,218,600,604,858,862,192,214,320,340,
  388,474,558,591,630,659,662,670,780,796,332,222,328,740,084,188,010
]
europe: [
  8,20,40,56,70,100,191,196,203,208,233,246,250,276,300,348,352,372,
  380,428,438,440,442,470,492,499,528,578,616,620,642,643,674,688,703,
  705,724,752,756,792,804,807,826,112,51,31,268,498
]
africa: [
  12,24,204,72,86,108,120,132,140,148,174,178,180,188,262,818,231,266,
  288,324,624,384,404,426,430,434,450,454,466,478,504,508,516,562,566,
  646,678,686,694,706,710,729,716,728,768,788,800,818,834,894,854
]
asia: [
  4,50,64,96,104,116,156,626,356,360,364,368,376,392,400,398,408,410,
  414,418,422,458,462,496,524,512,586,275,608,634,682,702,144,760,764,
  762,795,860,887,704,887,356,704,050,064
]
oceania: [
  36,242,583,584,520,554,585,598,882,90,776,548,798
]
```

Any country code not in these lists (Antarctica = 010 is already in
americas above — remove it and exclude it from all groups so it renders
as a fixed neutral non-clickable shape) should be rendered but not
assigned to any selectable continent (render it in the unselected neutral
color with no click handler).

Antarctica (geographies where `id === "010"` or similar) must be excluded
from the clickable continent groups entirely and rendered as a fixed light
neutral shape — it is never a selectable region in Flagora.

## Styling decisions — Telegram blue palette, flat aesthetic

The entire visual language uses Telegram's own CSS variables already wired
into the Tailwind config (`tailwind.config.ts`) plus two hardcoded blue
hex values for the geographic fill states (since SVG `fill`/`stroke` props
can't consume Tailwind classes directly in react-simple-maps):

```
Selected continent fill:     #378add   (Telegram button blue, solid)
Selected continent stroke:   #185fa5   (darker blue for border)
Selected stroke-width:       1.5

World mode fill:             rgba(55, 138, 221, 0.25)  (translucent blue)
World mode stroke:           #378add
World mode stroke-width:     0.8

Unselected fill:             var(--tg-theme-secondary-bg-color, #232e3c) in dark
                             — use #d4d8dc as a hardcoded fallback for the
                             SVG prop since CSS vars don't work in SVG fill attrs;
                             read the actual computed value at mount time via
                             getComputedStyle if you want true theme-responsiveness,
                             otherwise #d4d8dc in light / #2a3a4a in dark works fine
Unselected stroke:           rgba(128,128,128,0.25)
Unselected stroke-width:     0.5

Antarctica fill:             rgba(128,128,128,0.12)
Antarctica stroke:           none

Hover (non-selected):        increase fill opacity to 0.45 on mouseenter, 
                             restore on mouseleave
```

No drop shadows, no gradients, no glow. Flat fills only, consistent with
Section 2/12's restraint principle.

## Projection

Use `geoNaturalEarth1` projection — it gives a clean, balanced world shape
that looks intentional at mobile size, without Mercator's polar distortion
that makes Greenland look bigger than Africa.

Center: [0, 20] (shift slightly north so Africa/Europe are well-centered
and Antarctica is small at the bottom edge).
Scale: tune so the map fills the container width without Antarctica taking
up vertical space — approximately 145 at this container size.

## Container

The outer wrapper div keeps the same className as the current component:
```
"relative w-full rounded-2xl bg-tg-secondary-bg/50 border border-tg-separator p-2.5 overflow-hidden"
```
Inside it, a `div` with `className="relative w-full aspect-[2/1]"` wraps
the `ComposableMap`. This preserves `CustomGameModal.tsx`'s layout exactly.

The bottom-right badge (current selection label) is kept as-is from the
current component — it sits absolutely positioned inside the container div.

## Props interface — unchanged

```tsx
interface ContinentMapProps {
  selectedContinent: Continent;
  onSelectContinent: (continent: Continent) => void;
}
```

`CustomGameModal.tsx` requires zero changes.

## Click handling

Each `<Geography>` component's `onClick` should look up which continent
that geography's `id` belongs to (using a reverse lookup from the mapping
above) and call `onSelectContinent` with that continent value. If the
geography is Antarctica or unmapped, `onClick` should be a no-op.

## Performance

`react-simple-maps` memoizes geography data by default. Wrap the whole
`ComposableMap` in `React.memo` and ensure `onSelectContinent` is stable
at the call site (it already is — `CustomGameModal` passes `setContinent`
directly from `useState`, which is stable). No additional memoization
needed.

## Explicit exclusions

- No country-level hover tooltips showing country names.
- No zoom, pan, or any interactive camera movement.
- No changes to `CustomGameModal.tsx` or any other file outside
  `ContinentMap.tsx` and `apps/web/package.json`.
- No runtime fetch of the world data — bundled static asset only.

## Completion criteria

1. The map renders recognizable, geographically-accurate continent outlines
   (not blobs) at mobile size.
2. Clicking any country within a continent fires `onSelectContinent` with
   the correct `Continent` value.
3. Selected / world / unselected visual states match the styling spec above.
4. Antarctica is not clickable and renders in a fixed neutral color.
5. `CustomGameModal.tsx` is unchanged and works identically.
6. No inline `style={{ }}` usage in JSX beyond what `react-simple-maps`
   requires for its own `Geography` style prop (that prop is the library's
   API, not layout/spacing styles, so it's exempt from the project's
   no-inline-styles convention).
7. `pnpm lint` and `pnpm build` pass across the monorepo, including type-
   checking for the JSON import and `topojson-client` usage.
