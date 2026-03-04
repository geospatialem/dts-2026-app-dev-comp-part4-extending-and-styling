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

import {
  getBurnStatusAtPoint,
  getWalkingAccessAtPoint,
} from '../utils/mapUtils';
import { useLayersState } from './LayersContext';

type ResultsState = {
  burnStatusValue: number;
  burnStatusLabel: string;
  burnDetail: string;
  elevationValue: number | null;
  accessLabel: string;
  accessDetail: string;
  accessValue: number;
  locationLabel: string;
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
    default:
      return state;
  }
}

type ResultsActions = {
  handleMapClick: (event: HTMLArcgisMapElement['arcgisViewClick']) => void;
};

const ResultsStateContext = createContext<ResultsState | null>(null);
const ResultsActionsContext = createContext<ResultsActions | null>(null);

export function ResultsProvider(props: PropsWithChildren): React.JSX.Element {
  const [state, dispatch] = useReducer(resultsReducer, initialState);
  const requestIdRef = useRef(0);

  const {
    perimeterLayers,
    trailLayers,
    recreationSitesLayers,
    clickPinLayer,
    selectedTrailRouteLayer,
  } = useLayersState();

  const handleMapClick = useCallback(
    async (event: HTMLArcgisMapElement['arcgisViewClick']): Promise<void> => {
      const { mapPoint } = event.detail;

      requestIdRef.current += 1;
      const requestId = requestIdRef.current;

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

      // Elevation still TODO
      dispatch({ type: 'setElevationValue', value: null });

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
    () => ({ handleMapClick }),
    [handleMapClick],
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
