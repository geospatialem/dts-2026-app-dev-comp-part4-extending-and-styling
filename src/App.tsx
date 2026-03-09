// Individual imports for each Map, Chart and Calcite component
import "@arcgis/map-components/components/arcgis-elevation-profile";
import "@arcgis/map-components/components/arcgis-features";
import "@arcgis/map-components/components/arcgis-map";
import "@arcgis/map-components/components/arcgis-zoom";

import "@esri/calcite-components/components/calcite-action";
import "@esri/calcite-components/components/calcite-icon";
import "@esri/calcite-components/components/calcite-label";
import "@esri/calcite-components/components/calcite-navigation";
import "@esri/calcite-components/components/calcite-navigation-logo";
import "@esri/calcite-components/components/calcite-sheet";
import "@esri/calcite-components/components/calcite-shell";
import "@esri/calcite-components/components/calcite-switch";

import { useLayersActions, useLayersState } from "./context/LayersContext";
import { useResultsActions } from "./context/ResultsContext";
import { useThemeActions, useThemeState } from "./context/ThemeContext";
import { useUIActions, useUIState } from "./context/UIContext";

import { LayersPanel } from "./components/LayersPanel";
import { MorelPanel } from "./components/MorelPanel";
import { useEffect } from "react";

const mapItemId = "c5d76336253648c0af8da33ecf40c7af";

export function App(): React.JSX.Element {
  const { handleViewReady, toggleBackgroundLayer } = useLayersActions();
  const { handleMapClick, registerElevationProfileElement } =
    useResultsActions();
  const { isSmallScreen, isFiltersSheetOpen, isPopupOpen } = useUIState();
  const { openFilters, closeFilters, handleFeaturesSheetClose } =
    useUIActions();
  const { map } = useLayersState();
  const { mode } = useThemeState();
  const { toggleTheme } = useThemeActions();

  useEffect(() => {
    // Set the initial background layer based on the theme mode when the app loads
    if (map) {
      toggleBackgroundLayer(mode);
    }
  }, [map, mode, toggleBackgroundLayer]);

  return (
    // The Shell component is used as a layout for this template
    <calcite-shell content-behind className={`calcite-mode-${mode}`}>
      <calcite-navigation slot="header">
        {/* Heading and description dynamically populated */}
        <calcite-navigation-logo
          heading="Morel of the Story"
          description="Potential gathering spots"
          slot="logo"
        ></calcite-navigation-logo>
        <div slot="content-end" className="tool-group">
          <calcite-label layout="inline">
            <calcite-icon
              icon="brightness"
              scale="s"
              label="Light"
            ></calcite-icon>
            <calcite-switch
              checked={mode === "dark"}
              oncalciteSwitchChange={() => {
                toggleTheme();
              }}
            ></calcite-switch>
            <calcite-icon icon="moon" scale="s" label="Dark"></calcite-icon>
          </calcite-label>
          {isSmallScreen && (
            <calcite-action
              icon="gear"
              text="Filters"
              onClick={openFilters}
            ></calcite-action>
          )}
        </div>
      </calcite-navigation>
      {/* Hidden elevation-profile component used for elevation sampling on click. */}
      <arcgis-elevation-profile
        className="elevation-profile-hidden"
        referenceElement="morel-map"
        distanceUnit="imperial"
        elevationUnit="imperial"
        slot="bottom-right"
        hideChart
        hideLegend
        hideSettingsButton
        hideSelectButton
        hideStartButton
        hideClearButton
        hideVisualization
        ref={registerElevationProfileElement}
      ></arcgis-elevation-profile>
      <arcgis-map
        id="morel-map"
        item-id={mapItemId}
        onarcgisViewReadyChange={handleViewReady}
        onarcgisViewClick={handleMapClick}
        popup-disabled
        ground="world-elevation"
        // Set the attribution mode based on the current theme
        attributionMode={mode}
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
      <calcite-sheet
        resizable
        label="Morel details"
        open={isPopupOpen}
        slot="sheets"
        oncalciteSheetClose={handleFeaturesSheetClose}
      >
        <calcite-panel heading="Morel Details 🍄" className="popup-panel">
          <div className="popup-content" id="popup-content">
            <arcgis-features
              referenceElement="morel-map"
              hideCloseButton
            ></arcgis-features>
          </div>
        </calcite-panel>
      </calcite-sheet>
    </calcite-shell>
  );
}
