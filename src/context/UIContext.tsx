import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type PropsWithChildren,
} from 'react';

import { useIsBelowScreenSize } from '../hooks/useScreenSize';

type UIState = {
  isSmallScreen: boolean;
  isFiltersSheetOpen: boolean;
};

type UIActions = {
  openFilters: () => void;
  closeFilters: () => void;
};

const UIStateContext = createContext<UIState | null>(null);
const UIActionsContext = createContext<UIActions | null>(null);

export function UIProvider(props: PropsWithChildren): React.JSX.Element {
  const isSmallScreen = useIsBelowScreenSize(680);
  const [isFiltersSheetOpen, setIsFiltersSheetOpen] = useState(false);

  const openFilters = useCallback(() => setIsFiltersSheetOpen(true), []);
  const closeFilters = useCallback(() => setIsFiltersSheetOpen(false), []);

  useEffect(() => {
    if (!isSmallScreen) {
      setIsFiltersSheetOpen(false);
    }
  }, [isSmallScreen]);

  const state: UIState = useMemo(
    () => ({ isSmallScreen, isFiltersSheetOpen }),
    [isSmallScreen, isFiltersSheetOpen],
  );

  const actions: UIActions = useMemo(
    () => ({ openFilters, closeFilters }),
    [openFilters, closeFilters],
  );

  return (
    <UIStateContext value={state}>
      <UIActionsContext value={actions}>{props.children}</UIActionsContext>
    </UIStateContext>
  );
}

export function useUIState(): UIState {
  const ctx = useContext(UIStateContext);
  if (!ctx) {
    throw new Error('useUIState must be used within UIProvider');
  }
  return ctx;
}

export function useUIActions(): UIActions {
  const ctx = useContext(UIActionsContext);
  if (!ctx) {
    throw new Error('useUIActions must be used within UIProvider');
  }
  return ctx;
}
