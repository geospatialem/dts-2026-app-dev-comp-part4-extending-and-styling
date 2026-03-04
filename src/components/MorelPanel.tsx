import '@esri/calcite-components/components/calcite-panel';
import '@esri/calcite-components/components/calcite-chip';
import '@esri/calcite-components/components/calcite-tile';
import '@esri/calcite-components/components/calcite-tile-group';
import '@esri/calcite-components/components/calcite-meter';

interface MorelPanelProps {
  burnStatusLabel: string;
  burnStatusValue: number;
  burnDetail: string;
  elevationValue: number | null;
  suitabilityLabel: string;
  suitabilityValue: number;
  accessDetail: string;
  locationLabel: string;
  isSmallScreen: boolean;
}

export function MorelPanel(props: MorelPanelProps): React.JSX.Element {
  const {
    burnStatusLabel,
    burnStatusValue,
    burnDetail,
    elevationValue,
    suitabilityLabel,
    suitabilityValue,
    accessDetail,
    locationLabel,
  } = props;

  return (
    <calcite-tile-group
      label="Morel probability tiles"
      layout={'vertical'}
      selection-mode="none"
      scale="s"
      slot="top-right"
    >
      <calcite-tile
        icon="pin"
        description="Latitude and longitude of last map click."
        heading="Location"
      >
        <div className="big-number" slot="content-top">
          {locationLabel}
        </div>
      </calcite-tile>
      <calcite-tile
        icon="drive-time"
        description={burnDetail}
        heading="Recent Wildfire"
      >
        <div className="big-number" slot="content-top">
          {burnStatusLabel}
        </div>
        <calcite-meter
          scale="s"
          className="big-number"
          slot="content-top"
          label="Burn status"
          min={0}
          max={100}
          value={burnStatusValue}
        ></calcite-meter>
      </calcite-tile>
      <calcite-tile
        className="danger"
        description={
          elevationValue !== null
            ? 'Elevation at clicked location.'
            : 'Click the map to see elevation.'
        }
        icon="altitude"
        heading="Elevation"
      >
        <div className="big-number " slot="content-top">
          {elevationValue !== null
            ? `${Math.round(elevationValue)} m`
            : 'Tap map'}
        </div>
        <calcite-meter
          scale="s"
          slot="content-top"
          label="Elevation"
          min={0}
          max={4000}
          value={Math.min(Math.max(elevationValue ?? 0, 0), 4000)}
        ></calcite-meter>
      </calcite-tile>
      <calcite-tile icon="walking" description={accessDetail} heading="Access">
        <div className="big-number" slot="content-top">
          {suitabilityLabel}
        </div>
        {/* todo this meter is backwards - maybe part 4 can theme this with tokens for meaning */}
        <calcite-meter
          scale="s"
          slot="content-top"
          label="Access suitability"
          min={0}
          max={100}
          value={suitabilityValue}
        ></calcite-meter>
      </calcite-tile>
    </calcite-tile-group>
  );
}
