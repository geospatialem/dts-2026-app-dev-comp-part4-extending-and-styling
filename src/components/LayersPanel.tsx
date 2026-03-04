import '@esri/calcite-components/components/calcite-panel';
import '@esri/calcite-components/components/calcite-list';
import '@esri/calcite-components/components/calcite-list-item';
import '@esri/calcite-components/components/calcite-notice';
import '@esri/calcite-components/components/calcite-block';
import '@esri/calcite-components/components/calcite-slider';

import type FeatureLayer from '@arcgis/core/layers/FeatureLayer';

import { getLayerColor } from '../utils/mapUtils';

interface LayersPanelProps {
  fireYears: number[];
  activeFireYears: number[];
  onFireYearSelect: (event: CustomEvent) => void;
  perimeterLayers?: FeatureLayer[];
  roadAndTrailLayers: FeatureLayer[];
  activeRoadTrailLayerIds: string[];
  onRoadTrailSelect: (event: CustomEvent) => void;
}

export function LayersPanel(props: LayersPanelProps): React.JSX.Element {
  const {
    fireYears,
    activeFireYears,
    onFireYearSelect,
    perimeterLayers,
    roadAndTrailLayers,
    activeRoadTrailLayerIds,
    onRoadTrailSelect,
  } = props;

  const perimeterColor =
    perimeterLayers && perimeterLayers.length > 0
      ? getLayerColor(perimeterLayers[0])
      : undefined;

  return (
    <calcite-panel heading="Will I Find Morels? " className="panel-layers">
      <calcite-notice slot="footer" open color="brand" kind="warning">
        <div slot="message">
          For illustration purposes only. Always follow local guidelines and
          regulations when foraging.
        </div>
      </calcite-notice>

      <calcite-block
        icon-end="drive-time"
        heading="Has it burned recently?"
        expanded
      >
        <calcite-list label="Fire occurrence by year" selection-mode="multiple">
          {fireYears.map((year) => {
            const isSelected = activeFireYears.includes(year);
            return (
              <calcite-list-item
                key={year}
                label={`${year} Fire Occurrence`}
                scale="s"
                value={year}
                selected={isSelected}
                oncalciteListItemSelect={onFireYearSelect}
              >
                {/* todo perform filter here not hide show like roads - based on FIREYEAR */}
                {/* todo - need to source this color differently - its all one layer, roads work as they are different layers */}

                {perimeterColor && (
                  <div
                    slot="content-end"
                    style={{
                      width: '1rem',
                      height: '1rem',
                      borderRadius: '999px',
                      backgroundColor: perimeterColor,
                    }}
                  ></div>
                )}
              </calcite-list-item>
            );
          })}
        </calcite-list>
      </calcite-block>

      <calcite-block
        icon-end="altitude"
        heading="Is the elevation right?"
        expanded
        className="block-elevation"
      >
        <calcite-label>
          <calcite-slider
            minValue={2000}
            maxValue={6000}
            max={10000}
            min={0}
            groupSeparator
            labelHandles
            precise
          ></calcite-slider>
        </calcite-label>
      </calcite-block>

      {roadAndTrailLayers.length > 0 && (
        <calcite-block icon-end="walking" heading="Can I access it?" expanded>
          <calcite-list label="Roads and trails" selection-mode="multiple">
            {roadAndTrailLayers.map((layer) => (
              <calcite-list-item
                key={layer.id}
                label={layer.title ?? 'USFS layer'}
                scale="s"
                value={layer.id}
                selected={activeRoadTrailLayerIds.includes(layer.id)}
                oncalciteListItemSelect={onRoadTrailSelect}
              >
                {getLayerColor(layer) && (
                  <div
                    slot="content-end"
                    style={{
                      width: '1rem',
                      height: '1rem',
                      borderRadius: '999px',
                      opacity: activeRoadTrailLayerIds.includes(layer.id)
                        ? 1
                        : 0.5,
                      backgroundColor: getLayerColor(layer) ?? undefined,
                    }}
                  ></div>
                )}
              </calcite-list-item>
            ))}
          </calcite-list>
        </calcite-block>
      )}
    </calcite-panel>
  );
}
