import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  type PropsWithChildren,
} from 'react';

import {
  filterRelevantLayers,
  isPerimeterLayer,
  isRecreationSitesLayer,
  isRoadLayer,
  isTrailLayer,
} from '../utils/mapUtils';

import type WebMap from '@arcgis/core/WebMap.js';
import type FeatureLayer from '@arcgis/core/layers/FeatureLayer.js';
import GraphicsLayer from '@arcgis/core/layers/GraphicsLayer.js';

const FIREYEARS = [2025, 2024, 2023, 2022, 2021, 2020] as const;

type LayersState = {
  featureLayers: FeatureLayer[];
  activeFireYears: number[];
  activeRoadTrailLayerIds: string[];
  clickPinLayer: GraphicsLayer | null;
  selectedTrailRouteLayer: GraphicsLayer | null;
};

type LayersAction =
  | {
      type: 'viewReadyLoadedLayers';
      featureLayers: FeatureLayer[];
      initialRoadTrailLayerIds: string[];
      clickPinLayer: GraphicsLayer;
      selectedTrailRouteLayer: GraphicsLayer;
    }
  | { type: 'toggleFireYear'; year: number }
  | { type: 'toggleRoadTrailLayer'; layerId: string };

const initialState: LayersState = {
  featureLayers: [],
  activeFireYears: [...FIREYEARS],
  activeRoadTrailLayerIds: [],
  clickPinLayer: null,
  selectedTrailRouteLayer: null,
};

function layersReducer(state: LayersState, action: LayersAction): LayersState {
  switch (action.type) {
    case 'viewReadyLoadedLayers': {
      return {
        ...state,
        featureLayers: action.featureLayers,
        activeRoadTrailLayerIds: action.initialRoadTrailLayerIds,
        clickPinLayer: action.clickPinLayer,
        selectedTrailRouteLayer: action.selectedTrailRouteLayer,
      };
    }
    case 'toggleFireYear': {
      const exists = state.activeFireYears.includes(action.year);
      const nextYears = exists
        ? state.activeFireYears.filter((year) => year !== action.year)
        : [...state.activeFireYears, action.year];

      return { ...state, activeFireYears: nextYears };
    }
    case 'toggleRoadTrailLayer': {
      const exists = state.activeRoadTrailLayerIds.includes(action.layerId);
      const nextIds = exists
        ? state.activeRoadTrailLayerIds.filter((id) => id !== action.layerId)
        : [...state.activeRoadTrailLayerIds, action.layerId];
      return { ...state, activeRoadTrailLayerIds: nextIds };
    }
    default: {
      return state;
    }
  }
}

type LayersSelectors = {
  fireYears: number[];
  perimeterLayers: FeatureLayer[];
  roadClosureLayers: FeatureLayer[];
  roadAndTrailLayers: FeatureLayer[];
  trailLayers: FeatureLayer[];
  recreationSitesLayers: FeatureLayer[];
};

type LayersContextValue = LayersSelectors & LayersState;

type LayersActions = {
  handleViewReady: (
    event: HTMLArcgisMapElement['arcgisViewReadyChange'],
  ) => void;
  handleFireYearSelection: (event: CustomEvent) => void;
  handleRoadTrailSelection: (event: CustomEvent) => void;
};

const LayersStateContext = createContext<LayersContextValue | null>(null);
const LayersActionsContext = createContext<LayersActions | null>(null);

export function LayersProvider(props: PropsWithChildren): React.JSX.Element {
  const [state, dispatch] = useReducer(layersReducer, initialState);

  const perimeterLayers = useMemo(
    () => state.featureLayers.filter((layer) => isPerimeterLayer(layer)),
    [state.featureLayers],
  );

  const roadClosureLayers = useMemo(
    () => state.featureLayers.filter((layer) => isRoadLayer(layer)),
    [state.featureLayers],
  );

  const roadAndTrailLayers = useMemo(
    () =>
      state.featureLayers.filter(
        (layer) => isRoadLayer(layer) || isTrailLayer(layer),
      ),
    [state.featureLayers],
  );

  const trailLayers = useMemo(
    () => state.featureLayers.filter((layer) => isTrailLayer(layer)),
    [state.featureLayers],
  );

  const recreationSitesLayers = useMemo(
    () => state.featureLayers.filter((layer) => isRecreationSitesLayer(layer)),
    [state.featureLayers],
  );

  // Keep ArcGIS layer filtering in sync (perimeter layer is one layer w/ FIREYEAR).
  useEffect(() => {
    const years = [...state.activeFireYears].sort((a, b) => a - b);
    const hasYears = years.length > 0;
    const yearList = years.join(',');

    perimeterLayers.forEach((layer) => {
      if (!hasYears) {
        layer.definitionExpression = '1 = 0';
      } else {
        layer.definitionExpression = `FIREYEAR IN (${yearList})`;
      }
    });
  }, [perimeterLayers, state.activeFireYears]);

  // Keep road/trail visibility in sync.
  useEffect(() => {
    roadAndTrailLayers.forEach((layer) => {
      layer.visible = state.activeRoadTrailLayerIds.includes(layer.id);
    });
  }, [roadAndTrailLayers, state.activeRoadTrailLayerIds]);

  const handleViewReady = useCallback(
    (event: HTMLArcgisMapElement['arcgisViewReadyChange']): void => {
      const viewElement = event.target;
      const map = viewElement.map as WebMap;
      const layers = map.allLayers.filter(
        (layer): layer is FeatureLayer => layer.type === 'feature',
      );

      const filteredLayers = filterRelevantLayers(layers.toArray());

      const initialRoadTrailIds = filteredLayers
        .filter((layer) => isRoadLayer(layer) || isTrailLayer(layer))
        .map((layer) => layer.id);

      const clickPinLayerId = 'click-pin-layer';
      let clickPinLayer = map.findLayerById(clickPinLayerId) as
        | GraphicsLayer
        | undefined;

      if (!clickPinLayer) {
        clickPinLayer = new GraphicsLayer({
          id: clickPinLayerId,
          title: 'Clicked location',
          listMode: 'hide',
        });
        map.add(clickPinLayer);
      }

      const selectedTrailRouteLayerId = 'selected-trail-route-layer';
      let selectedTrailRouteLayer = map.findLayerById(
        selectedTrailRouteLayerId,
      ) as GraphicsLayer | undefined;

      if (!selectedTrailRouteLayer) {
        selectedTrailRouteLayer = new GraphicsLayer({
          id: selectedTrailRouteLayerId,
          title: 'Selected trail route',
          listMode: 'hide',
        });
        map.add(selectedTrailRouteLayer);
      }

      dispatch({
        type: 'viewReadyLoadedLayers',
        featureLayers: filteredLayers,
        initialRoadTrailLayerIds: initialRoadTrailIds,
        clickPinLayer,
        selectedTrailRouteLayer,
      });
    },
    [],
  );

  const handleFireYearSelection = useCallback(
    (event: CustomEvent): void => {
      const item = event.target as HTMLCalciteListItemElement | null;
      if (!item) {
        return;
      }

      const yearNumber = Number(item.value);
      if (!yearNumber || Number.isNaN(yearNumber)) {
        return;
      }

      const exists = state.activeFireYears.includes(yearNumber);
      item.selected = !exists;
      dispatch({ type: 'toggleFireYear', year: yearNumber });
    },
    [state.activeFireYears],
  );

  const handleRoadTrailSelection = useCallback(
    (event: CustomEvent): void => {
      const item = event.target as HTMLCalciteListItemElement | null;
      if (!item) {
        return;
      }

      const id = String(item.value ?? '');
      if (!id) {
        return;
      }

      const exists = state.activeRoadTrailLayerIds.includes(id);
      item.selected = !exists;
      dispatch({ type: 'toggleRoadTrailLayer', layerId: id });
    },
    [state.activeRoadTrailLayerIds],
  );

  const value: LayersContextValue = useMemo(
    () => ({
      ...state,
      fireYears: [...FIREYEARS],
      perimeterLayers,
      roadClosureLayers,
      roadAndTrailLayers,
      trailLayers,
      recreationSitesLayers,
    }),
    [
      state,
      perimeterLayers,
      roadClosureLayers,
      roadAndTrailLayers,
      trailLayers,
      recreationSitesLayers,
    ],
  );

  const actions: LayersActions = useMemo(
    () => ({
      handleViewReady,
      handleFireYearSelection,
      handleRoadTrailSelection,
    }),
    [handleViewReady, handleFireYearSelection, handleRoadTrailSelection],
  );

  return (
    <LayersStateContext value={value}>
      <LayersActionsContext value={actions}>
        {props.children}
      </LayersActionsContext>
    </LayersStateContext>
  );
}

export function useLayersState(): LayersContextValue {
  const ctx = useContext(LayersStateContext);
  if (!ctx) {
    throw new Error('useLayersState must be used within LayersProvider');
  }
  return ctx;
}

export function useLayersActions(): LayersActions {
  const ctx = useContext(LayersActionsContext);
  if (!ctx) {
    throw new Error('useLayersActions must be used within LayersProvider');
  }
  return ctx;
}
