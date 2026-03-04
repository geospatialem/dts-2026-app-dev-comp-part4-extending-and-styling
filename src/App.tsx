// Individual imports for each Map, Chart and Calcite component
import '@arcgis/map-components/components/arcgis-map';
import '@arcgis/map-components/components/arcgis-zoom';
import '@esri/calcite-components/components/calcite-shell';
import '@esri/calcite-components/components/calcite-navigation';
import '@esri/calcite-components/components/calcite-navigation-logo';
import '@esri/calcite-components/components/calcite-action';
import '@esri/calcite-components/components/calcite-sheet';

import { useLayersActions } from './context/LayersContext';
import { useResultsActions } from './context/ResultsContext';
import { useUIActions, useUIState } from './context/UIContext';

import { LayersPanel } from './components/LayersPanel';
import { MorelPanel } from './components/MorelPanel';

const mapItemId = 'ecaf67baea484e99b1b499131ae8e179';

export function App(): React.JSX.Element {
  const { handleViewReady } = useLayersActions();
  const { handleMapClick } = useResultsActions();
  const { isSmallScreen, isFiltersSheetOpen } = useUIState();
  const { openFilters, closeFilters } = useUIActions();

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
            onClick={openFilters}
          ></calcite-action>
        )}
      </calcite-navigation>
      {/* The Map component fits to the size of the parent element  */}
      <arcgis-map
        item-id={mapItemId}
        onarcgisViewReadyChange={handleViewReady}
        onarcgisViewClick={handleMapClick}
      >
        {/* We'll use the map slots to position additional components */}
        {!isSmallScreen && (
          <div slot="top-left">
            <LayersPanel />
          </div>
        )}
        <arcgis-zoom slot="bottom-right" />

        <div slot="top-right">
          <MorelPanel />
        </div>
      </arcgis-map>
      {isSmallScreen && (
        <calcite-sheet
          label="Map filters"
          position="inline-end"
          open={isFiltersSheetOpen}
          oncalciteSheetClose={closeFilters}
        >
          <LayersPanel />
        </calcite-sheet>
      )}
    </calcite-shell>
  );
}
