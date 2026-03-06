import type { PropsWithChildren } from 'react';

import { LayersProvider } from './LayersContext';
import { ResultsProvider } from './ResultsContext';
import { UIProvider } from './UIContext';

export function AppProviders(props: PropsWithChildren): React.JSX.Element {
  return (
    <LayersProvider>
        <UIProvider>
          <ResultsProvider>{props.children}</ResultsProvider>
        </UIProvider>
    </LayersProvider>
  );
}
