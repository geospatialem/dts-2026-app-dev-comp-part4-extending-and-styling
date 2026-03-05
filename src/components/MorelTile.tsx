import '@esri/calcite-components/components/calcite-meter';
import '@esri/calcite-components/components/calcite-tile';

import type React from 'react';

type CalciteTileIcon = React.JSX.IntrinsicElements['calcite-tile']['icon'];

export type MorelTileMeterProps = {
  label: string;
  min: number;
  max: number;
  value: number | null | undefined;
  placeholder?: React.ReactNode;
  className?: string;
};

export type MorelTileProps = {
  heading: string;
  icon: Exclude<CalciteTileIcon, undefined>;
  description?: string;
  className?: string;
  bigNumber?: React.ReactNode;
  meter?: MorelTileMeterProps;
  contentTopExtra?: React.ReactNode;
  children?: React.ReactNode;
};

export function MorelTile({
  heading,
  icon,
  description,
  className,
  bigNumber,
  meter,
  contentTopExtra,
  children,
}: MorelTileProps): React.JSX.Element {
  return (
    <calcite-tile
      className={className}
      icon={icon}
      description={description}
      heading={heading}
    >
      {bigNumber != null ? (
        <div className="big-number" slot="content-top">
          {bigNumber}
        </div>
      ) : null}

      {meter ? (
        meter.value == null ? (
          <div className="big-number" slot="content-top">
            {meter.placeholder ?? '—'}
          </div>
        ) : (
          <calcite-meter
            scale="s"
            className={meter.className}
            slot="content-top"
            label={meter.label}
            min={meter.min}
            max={meter.max}
            value={meter.value}
          ></calcite-meter>
        )
      ) : null}

      {contentTopExtra != null ? (
        <div slot="content-top">{contentTopExtra}</div>
      ) : null}

      {children}
    </calcite-tile>
  );
}
