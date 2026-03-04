import type FeatureLayer from '@arcgis/core/layers/FeatureLayer';
import type Point from '@arcgis/core/geometry/Point';

type RendererSymbol = {
  color?: unknown;
  outline?: { color?: unknown };
};

type RendererLike = {
  symbol?: RendererSymbol;
  defaultSymbol?: RendererSymbol;
  uniqueValueInfos?: { symbol?: RendererSymbol }[];
};

export function getLayerColor(layer: FeatureLayer): string | undefined {
  const renderer = (layer as { renderer?: RendererLike }).renderer;

  if (!renderer) {
    return undefined;
  }

  const symbol =
    renderer.symbol ??
    renderer.defaultSymbol ??
    renderer.uniqueValueInfos?.[0]?.symbol;

  const color = symbol?.color ?? symbol?.outline?.color;

  const colorWithToCss = color as {
    toCss?: (includeAlpha?: boolean) => string;
  } | null;

  if (!colorWithToCss || typeof colorWithToCss.toCss !== 'function') {
    return undefined;
  }

  return colorWithToCss.toCss(true);
}

export function isPerimeterLayer(layer: FeatureLayer): boolean {
  const title = (layer.title ?? '').toLowerCase();
  return title.includes('fire occurrence');
}

export function isRoadLayer(layer: FeatureLayer): boolean {
  const title = (layer.title ?? '').toLowerCase();
  return title.includes('fireclosureline');
}

export function isTrailLayer(layer: FeatureLayer): boolean {
  const title = (layer.title ?? '').toLowerCase();
  return title.includes('trailnfspublish');
}

export function filterRelevantLayers(layers: FeatureLayer[]): FeatureLayer[] {
  return layers.filter(
    (layer) =>
      isPerimeterLayer(layer) || isRoadLayer(layer) || isTrailLayer(layer),
  );
}

export async function getBurnStatusAtPoint(
  mapPoint: Point | null,
  perimeterLayers: FeatureLayer[],
): Promise<{
  score: number;
  label: string;
  detail: string;
}> {
  if (!mapPoint || perimeterLayers.length === 0) {
    return {
      score: 0,
      label: 'No perimeter data',
      detail: 'This web map has no fire occurrence layers loaded.',
    };
  }

  const queryResults = await Promise.all(
    perimeterLayers.map(
      async (layer) =>
        await layer.queryFeatures({
          geometry: mapPoint,
          spatialRelationship: 'intersects',
          outFields: ['FIREYEAR'],
          returnGeometry: false,
        }),
    ),
  );

  const years: number[] = [];

  queryResults.forEach((result) => {
    result.features.forEach((feature) => {
      const attrs = feature.attributes as Record<string, unknown>;
      const rawYear = (attrs.FIREYEAR as number | string | undefined) ?? null;
      const yearNumber =
        typeof rawYear === 'number'
          ? rawYear
          : rawYear !== null
            ? Number(rawYear)
            : NaN;

      if (!Number.isNaN(yearNumber)) {
        years.push(yearNumber);
      }
    });
  });

  if (years.length === 0) {
    return {
      score: 0,
      label: 'No recent burn',
      detail: 'No mapped fire occurrence at this spot.',
    };
  }

  const mostRecentYear = Math.max(...years);

  let score = 100;
  let detailText = '';

  if (mostRecentYear >= 2024) {
    detailText = '2024 burn — extremely recent, peak morel potential.';
  } else if (mostRecentYear === 2023) {
    score = 95;
    detailText = '2023 burn — very recent, excellent morel potential.';
  } else if (mostRecentYear === 2022) {
    score = 90;
    detailText = '2022 burn — very recent, excellent morel potential.';
  } else if (mostRecentYear === 2021) {
    score = 85;
    detailText = '2021 burn — recent, very good morel potential.';
  } else if (mostRecentYear === 2020) {
    score = 80;
    detailText = '2020 burn — recent, good morel potential.';
  }

  return {
    score,
    label: `Burned in ${mostRecentYear}`,
    detail: detailText,
  };
}

export async function getAccessAtPoint(
  mapPoint: Point | null,
  roadClosureLayers: FeatureLayer[],
): Promise<{
  score: number;
  label: string;
  detail: string;
}> {
  if (!mapPoint || roadClosureLayers.length === 0) {
    return {
      score: 100,
      label: 'High',
      detail: 'No road closure lines in this map. Access is high.',
    };
  }

  const thresholds = [250, 500, 1000];
  const distanceResults = await Promise.all(
    thresholds.map(async (distance) => {
      const counts = await Promise.all(
        roadClosureLayers.map(
          async (layer) =>
            await layer.queryFeatureCount({
              geometry: mapPoint,
              distance,
              units: 'meters',
              spatialRelationship: 'intersects',
            }),
        ),
      );

      return { distance, counts };
    }),
  );

  const nearestMatch = distanceResults.find(({ counts }) =>
    counts.some((count) => count > 0),
  );

  const nearestBucket = nearestMatch?.distance ?? null;

  let score = 100;
  let suitabilityText = 'High';
  let detail = 'More than 1 km from any closure.';

  if (nearestBucket !== null) {
    if (nearestBucket <= 250) {
      score = 20;
      suitabilityText = 'Low';
      detail = 'Within 250 m of a closure.';
    } else if (nearestBucket <= 500) {
      score = 50;
      suitabilityText = 'Moderate';
      detail = 'Within 500 m of a closure.';
    } else {
      score = 80;
      suitabilityText = 'Good';
      detail = 'Within 1 km of a closure.';
    }
  }

  return {
    score,
    label: suitabilityText,
    detail,
  };
}
