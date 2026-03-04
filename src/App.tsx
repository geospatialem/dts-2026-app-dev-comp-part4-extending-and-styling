import { useEffect, useState } from 'react';

// Individual imports for each Map, Chart and Calcite component
import '@arcgis/map-components/components/arcgis-map';
import '@arcgis/map-components/components/arcgis-zoom';
import '@esri/calcite-components/components/calcite-shell';
import '@esri/calcite-components/components/calcite-navigation';
import '@esri/calcite-components/components/calcite-navigation-logo';
import '@esri/calcite-components/components/calcite-action';
import '@esri/calcite-components/components/calcite-sheet';

import {
  getAccessAtPoint,
  getBurnStatusAtPoint,
  filterRelevantLayers,
  isPerimeterLayer,
  isRoadLayer,
  isTrailLayer,
} from './utils/mapUtils';

import type WebMap from '@arcgis/core/WebMap';
import type FeatureLayer from '@arcgis/core/layers/FeatureLayer';

import { LayersPanel } from './components/LayersPanel';
import { MorelPanel } from './components/MorelPanel';

const FIREYEARS = [2025, 2024, 2023, 2022, 2021, 2020];

export function App(): React.JSX.Element {
  const [featureLayers, setFeatureLayers] = useState<FeatureLayer[]>([]);
  const [activeFireYears, setActiveFireYears] = useState<number[]>([
    ...FIREYEARS,
  ]);
  const [activeRoadTrailLayerIds, setActiveRoadTrailLayerIds] = useState<
    string[]
  >([]);
  const [burnStatusValue, setBurnStatusValue] = useState(0);
  const [burnStatusLabel, setBurnStatusLabel] = useState('Tap map');
  const [elevationValue, setElevationValue] = useState<number | null>(null);
  const [suitabilityValue, setSuitabilityValue] = useState(0);
  const [suitabilityLabel, setSuitabilityLabel] = useState('Tap map');
  const [burnDetail, setBurnDetail] = useState(
    'Click the map to see burn history.',
  );
  const [accessDetail, setAccessDetail] = useState(
    'Click the map to see distance to closure lines.',
  );
  const [locationLabel, setLocationLabel] = useState('Tap map');
  const [isSmallScreen, setIsSmallScreen] = useState<boolean>(
    typeof window !== 'undefined' ? window.innerWidth < 680 : false,
  );
  const [isFiltersSheetOpen, setIsFiltersSheetOpen] = useState(false);

  const handleViewReady = (
    event: HTMLArcgisMapElement['arcgisViewReadyChange'],
  ): void => {
    const viewElement = event.target;
    const map = viewElement.map as WebMap;
    const layers = map.allLayers.filter(
      (layer): layer is FeatureLayer => layer.type === 'feature',
    );

    const filteredLayers = filterRelevantLayers(layers.toArray());
    setFeatureLayers(filteredLayers);

    const initialRoadTrailIds = filteredLayers
      .filter((layer) => isRoadLayer(layer) || isTrailLayer(layer))
      .map((layer) => layer.id);
    setActiveRoadTrailLayerIds(initialRoadTrailIds);
  };

  const handleFireYearSelection = (event: CustomEvent): void => {
    const item = event.target as HTMLCalciteListItemElement | null;

    if (!item) {
      return;
    }

    const yearNumber = Number(item.value);
    if (!yearNumber || Number.isNaN(yearNumber)) {
      return;
    }

    setActiveFireYears((currentYears) => {
      const exists = currentYears.includes(yearNumber);
      const nextYears = exists
        ? currentYears.filter((year) => year !== yearNumber)
        : [...currentYears, yearNumber];

      item.selected = !exists;
      return nextYears;
    });
  };

  const handleListSelection = (event: CustomEvent): void => {
    const item = event.target as HTMLCalciteListItemElement | null;

    if (!item) {
      return;
    }

    const id = String(item.value ?? '');

    if (!id) {
      return;
    }

    setActiveRoadTrailLayerIds((current) => {
      const exists = current.includes(id);
      const next = exists
        ? current.filter((layerId) => layerId !== id)
        : [...current, id];

      item.selected = !exists;
      return next;
    });
  };

  const perimeterLayers = featureLayers.filter((layer) =>
    isPerimeterLayer(layer),
  );

  const roadClosureLayers = featureLayers.filter((layer) => isRoadLayer(layer));

  const roadAndTrailLayers = featureLayers.filter(
    (layer) => isRoadLayer(layer) || isTrailLayer(layer),
  );

  const handleMapClick = async (
    event: HTMLArcgisMapElement['arcgisViewClick'],
  ): Promise<void> => {
    const { mapPoint } = event.detail;

    // Update location label for tile group
    if (
      typeof mapPoint.latitude === 'number' &&
      typeof mapPoint.longitude === 'number'
    ) {
      const latitude = mapPoint.latitude.toFixed(4);
      const longitude = mapPoint.longitude.toFixed(4);
      setLocationLabel(`${latitude}, ${longitude}`);
    } else {
      setLocationLabel('Tap map');
    }

    // Burn status: whether click is inside any final fire perimeter
    const burnStatus = await getBurnStatusAtPoint(mapPoint, perimeterLayers);
    setBurnStatusValue(burnStatus.score);
    setBurnStatusLabel(burnStatus.label);
    setBurnDetail(burnStatus.detail);

    // 2) Elevation todo
    setElevationValue(null);

    // Suitability based on proximity to closure lines (no score meter)
    const accessStatus = await getAccessAtPoint(mapPoint, roadClosureLayers);
    setSuitabilityValue(accessStatus.score);
    setSuitabilityLabel(accessStatus.label);
    setAccessDetail(accessStatus.detail);
  };

  useEffect(() => {
    const years = [...activeFireYears].sort((a, b) => a - b);
    const hasYears = years.length > 0;
    const yearList = years.join(',');
    // todo not working
    featureLayers
      .filter((layer) => isPerimeterLayer(layer))
      .forEach((layer) => {
        if (!hasYears) {
          layer.definitionExpression = '1 = 0';
        } else {
          layer.definitionExpression = `FIREYEAR IN (${yearList})`;
        }
      });
  }, [featureLayers, activeFireYears]);

  useEffect(() => {
    featureLayers
      .filter((layer) => isRoadLayer(layer) || isTrailLayer(layer))
      .forEach((layer) => {
        layer.visible = activeRoadTrailLayerIds.includes(layer.id);
      });
  }, [featureLayers, activeRoadTrailLayerIds]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const handleResize = (): void => {
      const isNarrow = window.innerWidth < 680;

      setIsSmallScreen((current) => {
        if (current !== isNarrow && !isNarrow) {
          setIsFiltersSheetOpen(false);
        }
        return isNarrow;
      });
    };

    handleResize();

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return (
    // The Shell component is used as a layout for this template
    <calcite-shell content-behind>
      <calcite-navigation slot="header">
        {/* Heading and description dynamically populated */}
        <calcite-navigation-logo
          heading="Morel of the Story"
          description="Potential gathering spots"
          slot="logo"
        ></calcite-navigation-logo>

        {isSmallScreen && (
          <calcite-action
            slot="content-end"
            icon="gear"
            text="Filters"
            onClick={() => setIsFiltersSheetOpen(true)}
          ></calcite-action>
        )}
      </calcite-navigation>
      {/* The Map component fits to the size of the parent element  */}
      <arcgis-map
        item-id="ecaf67baea484e99b1b499131ae8e179"
        onarcgisViewReadyChange={handleViewReady}
        onarcgisViewClick={handleMapClick}
      >
        {/* We'll use the map slots to position additional components */}
        {!isSmallScreen && (
          <div slot="top-left">
            <LayersPanel
              fireYears={FIREYEARS}
              activeFireYears={activeFireYears}
              onFireYearSelect={handleFireYearSelection}
              perimeterLayers={perimeterLayers}
              roadAndTrailLayers={roadAndTrailLayers}
              activeRoadTrailLayerIds={activeRoadTrailLayerIds}
              onRoadTrailSelect={handleListSelection}
            />
          </div>
        )}
        <arcgis-zoom slot="bottom-right" />

        <div slot="top-right">
          <MorelPanel
            burnStatusLabel={burnStatusLabel}
            burnStatusValue={burnStatusValue}
            burnDetail={burnDetail}
            elevationValue={elevationValue}
            suitabilityLabel={suitabilityLabel}
            suitabilityValue={suitabilityValue}
            accessDetail={accessDetail}
            locationLabel={locationLabel}
            isSmallScreen={isSmallScreen}
          />
        </div>
      </arcgis-map>
      {isSmallScreen && (
        <calcite-sheet
          label="Map filters"
          position="inline-end"
          open={isFiltersSheetOpen}
          oncalciteSheetClose={() => setIsFiltersSheetOpen(false)}
        >
          <LayersPanel
            fireYears={FIREYEARS}
            activeFireYears={activeFireYears}
            onFireYearSelect={handleFireYearSelection}
            perimeterLayers={perimeterLayers}
            roadAndTrailLayers={roadAndTrailLayers}
            activeRoadTrailLayerIds={activeRoadTrailLayerIds}
            onRoadTrailSelect={handleListSelection}
          />
        </calcite-sheet>
      )}
    </calcite-shell>
  );
}
