import "@esri/calcite-components/components/calcite-fab";
import "@esri/calcite-components/components/calcite-popover";

import { useLayersState } from "../context/LayersContext";

import "./Attribution.css";

export function Attribution({
  slot = "bottom-left",
}: {
  slot?: string;
}): React.JSX.Element {
  const { attributionItems } = useLayersState();
  return (
    <div className="attribution" slot={slot}>
      <calcite-popover
        heading="Attribution"
        label="Attribution"
        referenceElement="popover-button"
        closable
        overlayPositioning="fixed"
        placement="right-end"
      >
        <section className="attribution-content">
          {attributionItems?.map((item, index) => (
            <span key={index} className="attribution-item">
              {item}
              {index < attributionItems.length - 1 && ", "}
            </span>
          ))}
        </section>
      </calcite-popover>
      <calcite-fab id="popover-button" icon="information"></calcite-fab>
    </div>
  );
}

