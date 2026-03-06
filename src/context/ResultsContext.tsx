import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useReducer,
  useRef,
  type PropsWithChildren,
} from 'react';

import Graphic from '@arcgis/core/Graphic.js';
import Polyline from '@arcgis/core/geometry/Polyline.js';
import type MapView from '@arcgis/core/views/MapView.js';
import type SceneView from '@arcgis/core/views/SceneView.js';
import type ElevationProfileAnalysisView2D from '@arcgis/core/views/2d/analysis/ElevationProfileAnalysisView2D.js';

import {
  getBurnStatusAtPoint,
  getWalkingAccessAtPoint,
} from '../utils/mapUtils';
import { useLayersState } from './LayersContext';
import { useUIActions } from './UIContext';

type ResultsState = {
  burnStatusValue: number;
  burnStatusLabel: string;
  burnDetail: string;
  elevationValue: number | null;
  accessLabel: string;
  accessDetail: string;
  accessValue: number;
  locationLabel: string;
  canInspectFeaturesAtLocation: boolean;
};

type ResultsAction =
  | {
      type: 'setAccessStatus';
      label: string;
      detail: string;
      value: number;
    }
  | {
      type: 'setBurnStatus';
      score: number;
      label: string;
      detail: string;
    }
  | { type: 'setCanInspectFeaturesAtLocation'; value: boolean }
  | { type: 'setElevationValue'; value: number | null }
  | { type: 'setLocationLabel'; label: string };

const initialState: ResultsState = {
  burnStatusValue: 0,
  burnStatusLabel: 'Tap map',
  elevationValue: null,
  burnDetail: 'Click the map to see burn history.',
  accessLabel: 'Tap map',
  accessDetail: 'Click the map to see walking distance via nearby trails.',
  accessValue: 0,
  locationLabel: 'Tap map',
  canInspectFeaturesAtLocation: false,
};

function getAccessValueFromMiles(alongTrailMiles: number | null): number {
  if (alongTrailMiles === null || !Number.isFinite(alongTrailMiles)) {
    return 0;
  }

  // Best is within 1 mile; worst is > 10 miles.
  if (alongTrailMiles <= 1) {
    return 100;
  }
  if (alongTrailMiles >= 10) {
    return 0;
  }

  // Linear scale: 1mi => 100, 10mi => 0
  const t = (alongTrailMiles - 1) / 9;
  const value = 100 * (1 - t);
  return Math.min(100, Math.max(0, Math.round(value)));
}

function resultsReducer(
  state: ResultsState,
  action: ResultsAction,
): ResultsState {
  switch (action.type) {
    case 'setLocationLabel':
      return { ...state, locationLabel: action.label };
    case 'setBurnStatus':
      return {
        ...state,
        burnStatusValue: action.score,
        burnStatusLabel: action.label,
        burnDetail: action.detail,
      };
    case 'setElevationValue':
      return { ...state, elevationValue: action.value };
    case 'setAccessStatus':
      return {
        ...state,
        accessLabel: action.label,
        accessDetail: action.detail,
        accessValue: action.value,
      };
    case 'setCanInspectFeaturesAtLocation':
      return { ...state, canInspectFeaturesAtLocation: action.value };
    default:
      return state;
  }
}

type ResultsActions = {
  handleMapClick: (event: HTMLArcgisMapElement['arcgisViewClick']) => void;
  inspectFeaturesAtLocation: () => void;
  registerElevationProfileElement: (
    el: HTMLArcgisElevationProfileElement | null,
  ) => void;
};

const ResultsStateContext = createContext<ResultsState | null>(null);
const ResultsActionsContext = createContext<ResultsActions | null>(null);

export function ResultsProvider(props: PropsWithChildren): React.JSX.Element {
  const [state, dispatch] = useReducer(resultsReducer, initialState);
  const requestIdRef = useRef(0);
  const clickDetailRef = useRef<
    HTMLArcgisMapElement['arcgisViewClick']['detail'] | null
  >(null);
  const elevationProfileElementRef =
    useRef<HTMLArcgisElevationProfileElement | null>(null);

  const {
    perimeterLayers,
    trailLayers,
    recreationSitesLayers,
    clickPinLayer,
    selectedTrailRouteLayer,
  } = useLayersState();

  const { openPopup } = useUIActions();

  const registerElevationProfileElement = useCallback(
    (el: HTMLArcgisElevationProfileElement | null): void => {
      elevationProfileElementRef.current = el;
    },
    [],
  );

  const waitForElevationProfileDone = useCallback(
    async (
      el: HTMLArcgisElevationProfileElement,
      requestId: number,
    ): Promise<void> => {
      if (el.progress === 1) {
        // Allow a microtask for results to settle.
        await Promise.resolve();
        return;
      }

      await new Promise<void>((resolve, reject) => {
        const timeoutMs = 15_000;
        const timeoutId = window.setTimeout(() => {
          cleanup();
          reject(new Error('Elevation profile timed out'));
        }, timeoutMs);

        const onChange = (
          event: HTMLArcgisElevationProfileElement['arcgisPropertyChange'],
        ) => {
          if (requestIdRef.current !== requestId) {
            cleanup();
            resolve();
            return;
          }
          if (event.detail.name !== 'progress') {
            return;
          }
          if (el.progress === 1) {
            cleanup();
            resolve();
          }
        };

        const cleanup = () => {
          window.clearTimeout(timeoutId);
          el.removeEventListener(
            'arcgisPropertyChange',
            onChange as unknown as EventListener,
          );
        };

        el.addEventListener(
          'arcgisPropertyChange',
          onChange as unknown as EventListener,
        );
      });
    },
    [],
  );

  const inspectFeaturesAtLocation = useCallback(async (): Promise<void> => {
    const clickDetail = clickDetailRef.current;
    if (!clickDetail) {
      return;
    }

    const features = document.querySelector('arcgis-features');
    if (!features) {
      return;
    }

    features.clear();
    await features.fetchFeatures(clickDetail);
    features.open = true;
    openPopup();
  }, [openPopup]);

  const handleMapClick = useCallback(
    async (event: HTMLArcgisMapElement['arcgisViewClick']): Promise<void> => {
      const { mapPoint } = event.detail;

      // Default to not inspectable until a hitTest proves otherwise.
      clickDetailRef.current = null;
      dispatch({ type: 'setCanInspectFeaturesAtLocation', value: false });

      requestIdRef.current += 1;
      const requestId = requestIdRef.current;

      // Clear prior elevation immediately (avoid stale values while loading).
      dispatch({ type: 'setElevationValue', value: null });

      // Clear any prior route immediately (avoid stale highlights).
      if (selectedTrailRouteLayer) {
        selectedTrailRouteLayer.removeAll();
      }

      if (
        typeof mapPoint.latitude === 'number' &&
        typeof mapPoint.longitude === 'number'
      ) {
        const latitude = mapPoint.latitude.toFixed(4);
        const longitude = mapPoint.longitude.toFixed(4);
        dispatch({
          type: 'setLocationLabel',
          label: `${latitude}, ${longitude}`,
        });
      } else {
        dispatch({ type: 'setLocationLabel', label: 'Tap map' });
      }

      try {
        const response = await event.target.view.hitTest(event.detail);
        const hitTestResults = response.results;
        // check if response has results in our filtered layers
        const actionableResults = hitTestResults.filter((result) =>
          [perimeterLayers, trailLayers, recreationSitesLayers]
            .flat()
            .some((layer) => layer === result.layer),
        );

        if (actionableResults.length > 0) {
          clickDetailRef.current = event.detail;
          dispatch({ type: 'setCanInspectFeaturesAtLocation', value: true });
        }
      } catch {
        clickDetailRef.current = null;
      }

      // Add/replace a location pin graphic so users can see what they clicked.
      if (clickPinLayer) {
        clickPinLayer.removeAll();
        clickPinLayer.add(
          new Graphic({
            geometry: mapPoint,
            symbol: {
              type: 'simple-marker',
              size: 12,
            },
          }),
        );
      }

      const burnStatus = await getBurnStatusAtPoint(mapPoint, perimeterLayers);
      if (requestIdRef.current !== requestId) {
        return;
      }
      dispatch({
        type: 'setBurnStatus',
        score: burnStatus.score,
        label: burnStatus.label,
        detail: burnStatus.detail,
      });

      // Elevation via <arcgis-elevation-profile /> sampled at the clicked point.
      try {
        const elevationProfileElement = elevationProfileElementRef.current;
        if (!elevationProfileElement) {
          throw new Error('Elevation profile element not registered');
        }

        const view =
          elevationProfileElement.view ??
          (event.target.view as MapView | SceneView | undefined);

        if (!view) {
          throw new Error('No view available for elevation profile');
        }

        // Ensure the polyline is valid (must have at least two points).
        const offsetMeters = 20;
        const sr = mapPoint.spatialReference;
        const offsetX = sr.isGeographic ? 0.0002 : offsetMeters;

        elevationProfileElement.feature = new Graphic({
          geometry: new Polyline({
            spatialReference: sr,
            paths: [
              [
                [mapPoint.x, mapPoint.y],
                [mapPoint.x + offsetX, mapPoint.y],
              ],
            ],
          }),
        });

        // Wait for the component to finish computing.
        await waitForElevationProfileDone(elevationProfileElement, requestId);

        if (requestIdRef.current !== requestId) {
          return;
        }

        await view.when();

        type WhenAnalysisView = (
          analysis: unknown,
        ) => Promise<ElevationProfileAnalysisView2D>;

        const analysisView = await (
          view as unknown as { whenAnalysisView: WhenAnalysisView }
        ).whenAnalysisView(elevationProfileElement.analysis);

        const firstResult = analysisView.results[0];
        const samples = firstResult.samples;

        let elevationFeet: number | null = null;
        if (Array.isArray(samples) && samples.length > 0) {
          const elevation = samples[0].elevation;
          if (typeof elevation === 'number' && Number.isFinite(elevation)) {
            elevationFeet = elevation;
          }
        }

        dispatch({ type: 'setElevationValue', value: elevationFeet });
      } catch {
        if (requestIdRef.current !== requestId) {
          return;
        }
        dispatch({ type: 'setElevationValue', value: null });
      }

      const accessStatus = await getWalkingAccessAtPoint(
        mapPoint,
        trailLayers,
        recreationSitesLayers,
        { searchRadiusKilometers: 20 },
      );
      if (requestIdRef.current !== requestId) {
        return;
      }

      if (selectedTrailRouteLayer) {
        selectedTrailRouteLayer.removeAll();
        if (accessStatus.routeGeometry) {
          selectedTrailRouteLayer.add(
            new Graphic({
              geometry: accessStatus.routeGeometry,
              symbol: {
                type: 'simple-line',
                width: 4,
              },
            }),
          );
        }
      }

      const alongTrailMiles =
        accessStatus.alongTrailMeters !== null
          ? (accessStatus.alongTrailMeters * 3.28084) / 5280
          : null;

      dispatch({
        type: 'setAccessStatus',
        label: accessStatus.label,
        detail: accessStatus.detail,
        value: getAccessValueFromMiles(alongTrailMiles),
      });
    },
    [
      clickPinLayer,
      perimeterLayers,
      recreationSitesLayers,
      selectedTrailRouteLayer,
      trailLayers,
    ],
  );

  const actions: ResultsActions = useMemo(
    () => ({
      handleMapClick,
      inspectFeaturesAtLocation,
      registerElevationProfileElement,
    }),
    [
      handleMapClick,
      inspectFeaturesAtLocation,
      registerElevationProfileElement,
    ],
  );

  return (
    <ResultsStateContext value={state}>
      <ResultsActionsContext value={actions}>
        {props.children}
      </ResultsActionsContext>
    </ResultsStateContext>
  );
}

export function useResultsState(): ResultsState {
  const ctx = useContext(ResultsStateContext);
  if (!ctx) {
    throw new Error('useResultsState must be used within ResultsProvider');
  }
  return ctx;
}

export function useResultsActions(): ResultsActions {
  const ctx = useContext(ResultsActionsContext);
  if (!ctx) {
    throw new Error('useResultsActions must be used within ResultsProvider');
  }
  return ctx;
}