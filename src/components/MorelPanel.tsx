import '@esri/calcite-components/components/calcite-panel';
import '@esri/calcite-components/components/calcite-chip';
import '@esri/calcite-components/components/calcite-tile';
import '@esri/calcite-components/components/calcite-tile-group';
import '@esri/calcite-components/components/calcite-meter';

import { useResultsState } from '../context/ResultsContext';
import { MorelTile } from './MorelTile';
import type { MorelTileProps } from './MorelTile';

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export function MorelPanel(): React.JSX.Element {
  const {
    burnStatusLabel,
    burnStatusValue,
    burnDetail,
    elevationValue,
    accessLabel,
    accessDetail,
    accessValue,
    locationLabel,
  } = useResultsState();

  const resultsTiles: (MorelTileProps & { key: string })[] = [
    {
      key: 'location',
      icon: 'pin',
      description: 'Latitude and longitude of last map click.',
      heading: 'Location',
      bigNumber: locationLabel,
    },
    {
      key: 'burn',
      icon: 'drive-time',
      description: burnDetail,
      heading: 'Recent Wildfire',
      bigNumber: burnStatusLabel,
      meter: {
        label: 'Burn status',
        min: 0,
        max: 100,
        value: burnStatusValue,
        className: 'big-number',
      },
    },
    {
      key: 'elevation',
      className: 'danger',
      icon: 'altitude',
      description:
        elevationValue !== null
          ? 'Elevation at clicked location.'
          : 'Click the map to see elevation.',
      heading: 'Elevation',
      bigNumber:
        elevationValue !== null ? `${Math.round(elevationValue)} m` : 'Tap map',
      meter: {
        label: 'Elevation',
        min: 0,
        max: 4000,
        value: elevationValue !== null ? clamp(elevationValue, 0, 4000) : null,
      },
    },
    {
      key: 'access',
      icon: 'walking',
      description: accessDetail,
      heading: 'Access',
      bigNumber: accessLabel,
      meter: {
        label: 'Access (distance)',
        min: 0,
        max: 100,
        value: accessValue,
      },
    },
  ];

  return (
    <calcite-tile-group
      label="Morel probability tiles"
      layout="vertical"
      selection-mode="none"
      scale="s"
    >
      {resultsTiles.map(({ key, ...tileProps }) => (
        <MorelTile key={key} {...tileProps} />
      ))}
    </calcite-tile-group>
  );
}
