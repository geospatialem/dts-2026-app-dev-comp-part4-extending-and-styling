import type FeatureLayer from '@arcgis/core/layers/FeatureLayer';
import type Point from '@arcgis/core/geometry/Point';
import EsriPoint from '@arcgis/core/geometry/Point.js';
import EsriPolyline from '@arcgis/core/geometry/Polyline.js';
import * as distanceOperator from '@arcgis/core/geometry/operators/distanceOperator.js';

import type Polyline from '@arcgis/core/geometry/Polyline';

type RendererSymbol = {
  color?: unknown;
  outline?: { color?: unknown };
};

type RendererLike = {
  symbol?: RendererSymbol;
  defaultSymbol?: RendererSymbol;
  uniqueValueInfos?: { symbol?: RendererSymbol }[];
};

function getFirstTextAttribute(
  attributes: Record<string, unknown> | null | undefined,
  candidateFieldNames: string[],
): string | null {
  if (!attributes) {
    return null;
  }

  for (const fieldName of candidateFieldNames) {
    const raw = attributes[fieldName];
    if (typeof raw === 'string') {
      const trimmed = raw.trim();
      if (trimmed) {
        return trimmed;
      }
    }
  }

  // Fallback: pick the first non-empty string attribute.
  for (const raw of Object.values(attributes)) {
    if (typeof raw === 'string') {
      const trimmed = raw.trim();
      if (trimmed) {
        return trimmed;
      }
    }
  }

  return null;
}

function formatNameOrUnknown(label: string, value: string | null): string {
  return value ? `${label}: ${value}` : `${label}: Unknown`;
}

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
  return title.includes('fireoccurrence');
}

export function isRoadLayer(layer: FeatureLayer): boolean {
  const title = (layer.title ?? '').toLowerCase();
  return title.includes('fireclosureline');
}

export function isTrailLayer(layer: FeatureLayer): boolean {
  const title = (layer.title ?? '').toLowerCase();
  return title.includes('trailnfspublish');
}

export function isRecreationSitesLayer(layer: FeatureLayer): boolean {
  const title = (layer.title ?? '').toLowerCase();
  return title.includes('recreationopportunities');
}

export function filterRelevantLayers(layers: FeatureLayer[]): FeatureLayer[] {
  return layers.filter(
    (layer) =>
      isPerimeterLayer(layer) ||
      isRoadLayer(layer) ||
      isTrailLayer(layer) ||
      isRecreationSitesLayer(layer),
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

type GraphNode = { x: number; y: number };
type GraphEdge = { to: string; weightMeters: number };
type TrailGraph = {
  nodes: Map<string, GraphNode>;
  adjacency: Map<string, GraphEdge[]>;
};

function isWebMercatorLike(point: Point): boolean {
  return point.spatialReference.isWebMercator;
}

function euclideanDistanceMeters(
  a: { x: number; y: number },
  b: { x: number; y: number },
): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function distanceMeters(a: Point, b: Point): number {
  // When points are in WebMercator, x/y are already meters.
  if (isWebMercatorLike(a) && isWebMercatorLike(b)) {
    // Use geometry operator to satisfy ArcGIS operator requirement.
    // (Unit omitted because WebMercator's unit is already meters.)
    return distanceOperator.execute(a, b);
  }

  // Non-WebMercator: keep it simple (this demo primarily operates in WebMercator).
  return euclideanDistanceMeters(a, b);
}

function formatImperialDistance(meters: number): string {
  const safeMeters = Number.isFinite(meters) ? Math.max(meters, 0) : 0;
  const feet = safeMeters * 3.28084;

  if (feet < 1000) {
    return `${Math.round(feet)} ft`;
  }

  const miles = feet / 5280;
  const decimals = miles < 10 ? 2 : 1;
  return `${miles.toFixed(decimals)} mi`;
}

function quantizeKey(x: number, y: number, toleranceMeters: number): string {
  const qx = Math.round(x / toleranceMeters);
  const qy = Math.round(y / toleranceMeters);
  return `${qx}|${qy}`;
}

function addGraphEdge(
  graph: TrailGraph,
  from: string,
  to: string,
  weightMeters: number,
): void {
  const list = graph.adjacency.get(from) ?? [];
  list.push({ to, weightMeters });
  graph.adjacency.set(from, list);
}

function ensureGraphNode(
  graph: TrailGraph,
  key: string,
  node: GraphNode,
): void {
  if (!graph.nodes.has(key)) {
    graph.nodes.set(key, node);
  }
}

type Segment2D = {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
};

type SegmentSplitPoint = { t: number; x: number; y: number };

function segmentBBox(seg: Segment2D): {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
} {
  return {
    minX: Math.min(seg.x1, seg.x2),
    minY: Math.min(seg.y1, seg.y2),
    maxX: Math.max(seg.x1, seg.x2),
    maxY: Math.max(seg.y1, seg.y2),
  };
}

function gridKey(ix: number, iy: number): string {
  return `${ix}|${iy}`;
}

function parseQuantizedKey(key: string): { qx: number; qy: number } | null {
  const [sx, sy] = key.split('|');
  const qx = Number(sx);
  const qy = Number(sy);
  if (!Number.isFinite(qx) || !Number.isFinite(qy)) {
    return null;
  }
  return { qx, qy };
}

function addNearMissEdges(graph: TrailGraph, toleranceMeters: number): void {
  // quantizeKey() uses rounding; two points can be < tolerance apart but land
  // in adjacent bins near the rounding boundary. This pass adds short edges
  // to bridge those cases.
  const keys = [...graph.nodes.keys()];

  const neighborOffsets = [-1, 0, 1];

  keys.forEach((key) => {
    const q = parseQuantizedKey(key);
    const node = graph.nodes.get(key);
    if (!q || !node) {
      return;
    }

    neighborOffsets.forEach((dx) => {
      neighborOffsets.forEach((dy) => {
        if (dx === 0 && dy === 0) {
          return;
        }
        const neighborKey = gridKey(q.qx + dx, q.qy + dy);
        if (!graph.nodes.has(neighborKey)) {
          return;
        }
        const neighbor = graph.nodes.get(neighborKey);
        if (!neighbor) {
          return;
        }
        const dist = Math.hypot(neighbor.x - node.x, neighbor.y - node.y);
        if (dist > 0 && dist <= toleranceMeters) {
          addGraphEdge(graph, key, neighborKey, dist);
          addGraphEdge(graph, neighborKey, key, dist);
        }
      });
    });
  });
}

function cellsForBBox(
  bbox: { minX: number; minY: number; maxX: number; maxY: number },
  cellSizeMeters: number,
): string[] {
  const minIx = Math.floor(bbox.minX / cellSizeMeters);
  const maxIx = Math.floor(bbox.maxX / cellSizeMeters);
  const minIy = Math.floor(bbox.minY / cellSizeMeters);
  const maxIy = Math.floor(bbox.maxY / cellSizeMeters);

  const keys: string[] = [];
  for (let ix = minIx; ix <= maxIx; ix += 1) {
    for (let iy = minIy; iy <= maxIy; iy += 1) {
      keys.push(gridKey(ix, iy));
    }
  }
  return keys;
}

function cross2(ax: number, ay: number, bx: number, by: number): number {
  return ax * by - ay * bx;
}

function segmentIntersection(
  a: Segment2D,
  b: Segment2D,
  epsilon = 1e-9,
): { x: number; y: number; tA: number; tB: number } | null {
  const rX = a.x2 - a.x1;
  const rY = a.y2 - a.y1;
  const sX = b.x2 - b.x1;
  const sY = b.y2 - b.y1;

  const denom = cross2(rX, rY, sX, sY);
  const qpx = b.x1 - a.x1;
  const qpy = b.y1 - a.y1;

  // Parallel or colinear
  if (Math.abs(denom) < epsilon) {
    // Colinear overlaps are not split here; endpoint quantization handles most shared-vertex cases.
    return null;
  }

  const t = cross2(qpx, qpy, sX, sY) / denom;
  const u = cross2(qpx, qpy, rX, rY) / denom;

  // Allow a tiny tolerance so endpoint hits aren't missed.
  const min = -1e-10;
  const max = 1 + 1e-10;
  if (t < min || t > max || u < min || u > max) {
    return null;
  }

  const tClamped = Math.max(0, Math.min(1, t));
  const uClamped = Math.max(0, Math.min(1, u));

  return {
    x: a.x1 + tClamped * rX,
    y: a.y1 + tClamped * rY,
    tA: tClamped,
    tB: uClamped,
  };
}

function buildTrailGraph(
  polylines: Polyline[],
  toleranceMeters: number,
): TrailGraph {
  const graph: TrailGraph = {
    nodes: new Map(),
    adjacency: new Map(),
  };

  // 1) Collect all segments from all polylines.
  const segments: Segment2D[] = [];
  polylines.forEach((polyline) => {
    polyline.paths.forEach((path) => {
      for (let i = 0; i < path.length - 1; i += 1) {
        const [x1, y1] = path[i] ?? [];
        const [x2, y2] = path[i + 1] ?? [];
        if (
          typeof x1 !== 'number' ||
          typeof y1 !== 'number' ||
          typeof x2 !== 'number' ||
          typeof y2 !== 'number'
        ) {
          continue;
        }
        // Skip zero-length segments.
        if (x1 === x2 && y1 === y2) {
          continue;
        }
        segments.push({ x1, y1, x2, y2 });
      }
    });
  });

  if (segments.length === 0) {
    return graph;
  }

  // 2) Spatial index segments in a coarse grid to avoid O(n^2).
  //    Cell size chosen to be large enough to reduce buckets, small enough to prune comparisons.
  const cellSizeMeters = Math.max(250, toleranceMeters * 50);
  const grid = new Map<string, number[]>();

  segments.forEach((seg, index) => {
    const bbox = segmentBBox(seg);
    // Expand bbox by a small amount so near-border intersections aren't missed.
    const expand = toleranceMeters;
    const expanded = {
      minX: bbox.minX - expand,
      minY: bbox.minY - expand,
      maxX: bbox.maxX + expand,
      maxY: bbox.maxY + expand,
    };

    cellsForBBox(expanded, cellSizeMeters).forEach((key) => {
      const list = grid.get(key) ?? [];
      list.push(index);
      grid.set(key, list);
    });
  });

  // 3) For each segment, gather split points (endpoints + intersections).
  const splitsBySegment = new Map<number, SegmentSplitPoint[]>();
  const ensureSplits = (idx: number): SegmentSplitPoint[] => {
    const existing = splitsBySegment.get(idx);
    if (existing) {
      return existing;
    }
    const seg = segments[idx];
    const list: SegmentSplitPoint[] = [
      { t: 0, x: seg.x1, y: seg.y1 },
      { t: 1, x: seg.x2, y: seg.y2 },
    ];
    splitsBySegment.set(idx, list);
    return list;
  };

  // Deduplicate segment pair checks.
  const seenPair = new Set<string>();

  segments.forEach((segA, i) => {
    const bboxA = segmentBBox(segA);
    const expandedA = {
      minX: bboxA.minX - toleranceMeters,
      minY: bboxA.minY - toleranceMeters,
      maxX: bboxA.maxX + toleranceMeters,
      maxY: bboxA.maxY + toleranceMeters,
    };

    const candidateIndices = new Set<number>();
    cellsForBBox(expandedA, cellSizeMeters).forEach((key) => {
      const list = grid.get(key);
      if (!list) {
        return;
      }
      list.forEach((j) => {
        if (j !== i) {
          candidateIndices.add(j);
        }
      });
    });

    candidateIndices.forEach((j) => {
      const a = Math.min(i, j);
      const b = Math.max(i, j);
      const pairKey = `${a}:${b}`;
      if (seenPair.has(pairKey)) {
        return;
      }
      seenPair.add(pairKey);

      const segB = segments[j];

      // Quick bbox reject.
      const bboxB = segmentBBox(segB);
      if (
        expandedA.maxX < bboxB.minX ||
        expandedA.minX > bboxB.maxX ||
        expandedA.maxY < bboxB.minY ||
        expandedA.minY > bboxB.maxY
      ) {
        return;
      }

      const intersection = segmentIntersection(segA, segB);
      if (!intersection) {
        return;
      }

      ensureSplits(i).push({
        t: intersection.tA,
        x: intersection.x,
        y: intersection.y,
      });
      ensureSplits(j).push({
        t: intersection.tB,
        x: intersection.x,
        y: intersection.y,
      });
    });
  });

  const uniqueSortSplits = (
    splits: SegmentSplitPoint[],
  ): SegmentSplitPoint[] => {
    const sorted = [...splits].sort((a, b) => a.t - b.t);
    const out: SegmentSplitPoint[] = [];
    let lastKey: string | null = null;

    sorted.forEach((p) => {
      const key = quantizeKey(p.x, p.y, toleranceMeters);
      if (key === lastKey) {
        return;
      }
      lastKey = key;
      out.push(p);
    });

    return out;
  };

  // 4) Convert each segment's split points into graph edges.
  for (let i = 0; i < segments.length; i += 1) {
    const splits = uniqueSortSplits(ensureSplits(i));
    for (let k = 0; k < splits.length - 1; k += 1) {
      const a = splits[k];
      const b = splits[k + 1];

      const aKey = quantizeKey(a.x, a.y, toleranceMeters);
      const bKey = quantizeKey(b.x, b.y, toleranceMeters);

      if (aKey === bKey) {
        continue;
      }

      ensureGraphNode(graph, aKey, { x: a.x, y: a.y });
      ensureGraphNode(graph, bKey, { x: b.x, y: b.y });

      const lengthMeters = Math.hypot(b.x - a.x, b.y - a.y);
      if (!Number.isFinite(lengthMeters) || lengthMeters <= 0) {
        continue;
      }

      addGraphEdge(graph, aKey, bKey, lengthMeters);
      addGraphEdge(graph, bKey, aKey, lengthMeters);
    }
  }

  // 5) Bridge near-miss nodes across quantization boundaries.
  addNearMissEdges(graph, toleranceMeters);

  return graph;
}

class MinPriorityQueue {
  private heap: { key: string; priority: number }[] = [];

  push(key: string, priority: number): void {
    this.heap.push({ key, priority });
    this.bubbleUp(this.heap.length - 1);
  }

  pop(): { key: string; priority: number } | undefined {
    if (this.heap.length === 0) {
      return undefined;
    }

    const first = this.heap[0];
    const last = this.heap.pop();
    if (!last) {
      return undefined;
    }

    if (this.heap.length > 0) {
      this.heap[0] = last;
      this.bubbleDown(0);
    }
    return first;
  }

  get size(): number {
    return this.heap.length;
  }

  private bubbleUp(index: number): void {
    while (index > 0) {
      const parent = Math.floor((index - 1) / 2);
      if (this.heap[parent].priority <= this.heap[index].priority) {
        return;
      }
      const tmp = this.heap[parent];
      this.heap[parent] = this.heap[index];
      this.heap[index] = tmp;
      index = parent;
    }
  }

  private bubbleDown(index: number): void {
    const n = this.heap.length;
    for (;;) {
      const left = index * 2 + 1;
      const right = index * 2 + 2;
      let smallest = index;

      if (left < n && this.heap[left].priority < this.heap[smallest].priority) {
        smallest = left;
      }
      if (
        right < n &&
        this.heap[right].priority < this.heap[smallest].priority
      ) {
        smallest = right;
      }
      if (smallest === index) {
        return;
      }
      const tmp = this.heap[smallest];
      this.heap[smallest] = this.heap[index];
      this.heap[index] = tmp;
      index = smallest;
    }
  }
}

function dijkstraShortestPath(
  graph: TrailGraph,
  start: { aKey: string; bKey: string; distToA: number; distToB: number },
  end: { aKey: string; bKey: string; distToA: number; distToB: number },
): { distanceMeters: number; pathNodeKeys: string[] } | null {
  // Special-case: both points are on the same underlying segment.
  const sameSegment =
    (start.aKey === end.aKey && start.bKey === end.bKey) ||
    (start.aKey === end.bKey && start.bKey === end.aKey);
  const directOnSegment = sameSegment
    ? Math.abs(start.distToA - end.distToA)
    : null;

  const startKey = '__start__';
  const endKey = '__end__';

  const adjacency = (key: string): GraphEdge[] => {
    if (key === startKey) {
      return [
        { to: start.aKey, weightMeters: start.distToA },
        { to: start.bKey, weightMeters: start.distToB },
      ];
    }
    if (key === endKey) {
      return [];
    }

    const base = graph.adjacency.get(key) ?? [];
    // Allow routes to end without forcing traversal to endpoints.
    const extraToEnd: GraphEdge[] = [];
    if (key === end.aKey) {
      extraToEnd.push({ to: endKey, weightMeters: end.distToA });
    }
    if (key === end.bKey) {
      extraToEnd.push({ to: endKey, weightMeters: end.distToB });
    }
    return extraToEnd.length ? [...base, ...extraToEnd] : base;
  };

  const distances = new Map<string, number>();
  distances.set(startKey, 0);
  const previous = new Map<string, string>();
  const pq = new MinPriorityQueue();
  pq.push(startKey, 0);

  while (pq.size > 0) {
    const current = pq.pop();
    if (!current) {
      break;
    }

    const known = distances.get(current.key);
    if (typeof known === 'number' && current.priority > known) {
      continue;
    }

    if (current.key === endKey) {
      const best = current.priority;

      const path: string[] = [];
      let cursor: string | undefined = endKey;
      while (cursor) {
        path.push(cursor);
        if (cursor === startKey) {
          break;
        }
        cursor = previous.get(cursor);
      }

      path.reverse();
      const pathNodeKeys = path.filter(
        (key) => key !== startKey && key !== endKey,
      );

      if (directOnSegment !== null) {
        return best <= directOnSegment
          ? { distanceMeters: best, pathNodeKeys }
          : { distanceMeters: directOnSegment, pathNodeKeys: [] };
      }

      return { distanceMeters: best, pathNodeKeys };
    }

    for (const edge of adjacency(current.key)) {
      const nextDistance = current.priority + edge.weightMeters;
      const prev = distances.get(edge.to);
      if (prev === undefined || nextDistance < prev) {
        distances.set(edge.to, nextDistance);
        previous.set(edge.to, current.key);
        pq.push(edge.to, nextDistance);
      }
    }
  }

  if (directOnSegment !== null) {
    return { distanceMeters: directOnSegment, pathNodeKeys: [] };
  }
  return null;
}

type SnapToNetworkResult = {
  snapPoint: Point;
  offTrailMeters: number;
  aKey: string;
  bKey: string;
  distToA: number;
  distToB: number;
  trailName: string | null;
  layerTitle: string;
};

function snapPointToTrailNetwork(
  mapPoint: Point,
  candidates: {
    polyline: Polyline;
    layerTitle: string;
    trailName: string | null;
  }[],
  toleranceMeters: number,
): SnapToNetworkResult | null {
  let best:
    | {
        distanceMeters: number;
        snapXY: { x: number; y: number };
        t: number;
        a: { x: number; y: number };
        b: { x: number; y: number };
        layerTitle: string;
        trailName: string | null;
      }
    | undefined;

  const p = toPointLike(mapPoint);

  candidates.forEach(({ polyline, layerTitle, trailName }) => {
    polyline.paths.forEach((path) => {
      for (let i = 0; i < path.length - 1; i += 1) {
        const [x1, y1] = path[i] ?? [];
        const [x2, y2] = path[i + 1] ?? [];
        if (
          typeof x1 !== 'number' ||
          typeof y1 !== 'number' ||
          typeof x2 !== 'number' ||
          typeof y2 !== 'number'
        ) {
          continue;
        }

        const nearest = nearestPointOnSegment(
          p,
          { x: x1, y: y1 },
          { x: x2, y: y2 },
        );
        const dist = Math.hypot(nearest.x - p.x, nearest.y - p.y);
        if (!best || dist < best.distanceMeters) {
          best = {
            distanceMeters: dist,
            snapXY: { x: nearest.x, y: nearest.y },
            t: nearest.t,
            a: { x: x1, y: y1 },
            b: { x: x2, y: y2 },
            layerTitle,
            trailName,
          };
        }
      }
    });
  });

  if (!best) {
    return null;
  }

  const segmentLength = Math.hypot(best.b.x - best.a.x, best.b.y - best.a.y);
  const distToA = best.t * segmentLength;
  const distToB = (1 - best.t) * segmentLength;
  const aKey = quantizeKey(best.a.x, best.a.y, toleranceMeters);
  const bKey = quantizeKey(best.b.x, best.b.y, toleranceMeters);

  return {
    snapPoint: pointFromXY(mapPoint, best.snapXY),
    offTrailMeters: best.distanceMeters,
    aKey,
    bKey,
    distToA,
    distToB,
    layerTitle: best.layerTitle,
    trailName: best.trailName,
  };
}

function toPointLike(point: Point): { x: number; y: number } {
  return { x: point.x, y: point.y };
}

function pointFromXY(reference: Point, xy: { x: number; y: number }): Point {
  return new EsriPoint({
    x: xy.x,
    y: xy.y,
    spatialReference: reference.spatialReference,
  });
}

function nearestPointOnSegment(
  p: { x: number; y: number },
  a: { x: number; y: number },
  b: { x: number; y: number },
): { x: number; y: number; t: number } {
  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const apx = p.x - a.x;
  const apy = p.y - a.y;

  const abLen2 = abx * abx + aby * aby;
  if (abLen2 === 0) {
    return { x: a.x, y: a.y, t: 0 };
  }

  let t = (apx * abx + apy * aby) / abLen2;
  t = Math.max(0, Math.min(1, t));

  return { x: a.x + t * abx, y: a.y + t * aby, t };
}

export async function getWalkingAccessAtPoint(
  mapPoint: Point | null,
  trailLayers: FeatureLayer[],
  recreationSitesLayers: FeatureLayer[],
  options?: { searchRadiusKilometers?: number },
): Promise<{
  label: string;
  detail: string;
  offTrailMeters: number | null;
  alongTrailMeters: number | null;
  totalMeters: number | null;
  trailName?: string | null;
  trailheadName?: string | null;
  routeGeometry?: Polyline | null;
}> {
  const radiusKm = options?.searchRadiusKilometers ?? 5;
  const graphJoinToleranceMeters = 5;

  if (!mapPoint) {
    return {
      label: 'Tap map',
      detail: 'Click the map to see walking distance via nearby trails.',
      offTrailMeters: null,
      alongTrailMeters: null,
      totalMeters: null,
      trailName: null,
      trailheadName: null,
      routeGeometry: null,
    };
  }

  if (trailLayers.length === 0) {
    return {
      label: 'No trails',
      detail: 'This web map has no trail layers loaded.',
      offTrailMeters: null,
      alongTrailMeters: null,
      totalMeters: null,
      trailName: null,
      trailheadName: null,
      routeGeometry: null,
    };
  }

  const trailQueryResults = await Promise.all(
    trailLayers.map(
      async (layer) =>
        await layer.queryFeatures({
          geometry: mapPoint,
          distance: radiusKm,
          units: 'kilometers',
          spatialRelationship: 'intersects',
          outFields: ['*'],
          returnGeometry: true,
        }),
    ),
  );

  const trailGeometries: {
    polyline: Polyline;
    layerTitle: string;
    trailName: string | null;
  }[] = [];
  trailQueryResults.forEach((result, idx) => {
    const layerTitle = trailLayers[idx]?.title ?? 'Trail layer';
    result.features.forEach((feature) => {
      const geometry = feature.geometry;
      if (geometry?.type !== 'polyline') {
        return;
      }

      const attrs = (feature.attributes ?? null) as Record<
        string,
        unknown
      > | null;
      const trailName = getFirstTextAttribute(attrs, [
        'TRAIL_NAME',
        'TRAILNAME',
        'TRAIL_NM',
        'TRAIL',
        'NAME',
        'NFS_TRAIL_NAME',
      ]);

      trailGeometries.push({ polyline: geometry, layerTitle, trailName });
    });
  });

  if (trailGeometries.length === 0) {
    return {
      label: 'No trails nearby',
      detail: `No trail found within ${radiusKm} km of this point.`,
      offTrailMeters: null,
      alongTrailMeters: null,
      totalMeters: null,
      trailName: null,
      trailheadName: null,
      routeGeometry: null,
    };
  }

  const clickSnap = snapPointToTrailNetwork(
    mapPoint,
    trailGeometries,
    graphJoinToleranceMeters,
  );

  if (!clickSnap) {
    return {
      label: 'No trails nearby',
      detail: `No usable trail geometry found within ${radiusKm} km.`,
      offTrailMeters: null,
      alongTrailMeters: null,
      totalMeters: null,
      trailName: null,
      trailheadName: null,
      routeGeometry: null,
    };
  }

  const offTrailMeters = clickSnap.offTrailMeters;
  const trailName = clickSnap.trailName ?? clickSnap.layerTitle;

  const graph = buildTrailGraph(
    trailGeometries.map((t) => t.polyline),
    graphJoinToleranceMeters,
  );

  if (recreationSitesLayers.length === 0) {
    return {
      label: formatImperialDistance(offTrailMeters),
      detail: `${formatNameOrUnknown('Trail', trailName)} • Recreation site layer not available; showing only distance to nearest trail.`,
      offTrailMeters,
      alongTrailMeters: null,
      totalMeters: offTrailMeters,
      trailName,
      trailheadName: null,
      routeGeometry: null,
    };
  }

  const siteQueryResults = await Promise.all(
    recreationSitesLayers.map(
      async (layer) =>
        await layer.queryFeatures({
          geometry: mapPoint,
          distance: radiusKm,
          units: 'kilometers',
          spatialRelationship: 'intersects',
          outFields: ['*'],
          returnGeometry: true,
        }),
    ),
  );

  const sitePoints: { point: Point; name: string | null }[] = [];
  siteQueryResults.forEach((result) => {
    result.features.forEach((feature) => {
      const geometry = feature.geometry;
      if (geometry?.type !== 'point') {
        return;
      }

      const attrs = (feature.attributes ?? null) as Record<
        string,
        unknown
      > | null;
      const name = getFirstTextAttribute(attrs, [
        'NAME',
        'SITE_NAME',
        'REC_SITE',
        'RECAREA',
        'RECAREA_NAME',
        'TITLE',
      ]);

      sitePoints.push({ point: geometry, name });
    });
  });

  if (sitePoints.length === 0) {
    return {
      label: formatImperialDistance(offTrailMeters),
      detail: `${formatNameOrUnknown('Trail', trailName)} • No trailhead found within ${radiusKm} km; showing only off-trail distance.`,
      offTrailMeters,
      alongTrailMeters: null,
      totalMeters: offTrailMeters,
      trailName,
      trailheadName: null,
      routeGeometry: null,
    };
  }

  let bestSite:
    | {
        sitePoint: Point;
        siteName: string | null;
        siteSnap: SnapToNetworkResult;
        directMeters: number;
        alongTrailMeters: number;
        pathNodeKeys: string[];
      }
    | undefined;

  sitePoints.forEach(({ point: sitePoint, name: siteName }) => {
    const siteSnap = snapPointToTrailNetwork(
      sitePoint,
      trailGeometries,
      graphJoinToleranceMeters,
    );
    if (!siteSnap) {
      return;
    }

    const directMeters = distanceMeters(sitePoint, mapPoint);

    const pathResult = dijkstraShortestPath(
      graph,
      {
        aKey: siteSnap.aKey,
        bKey: siteSnap.bKey,
        distToA: siteSnap.distToA,
        distToB: siteSnap.distToB,
      },
      {
        aKey: clickSnap.aKey,
        bKey: clickSnap.bKey,
        distToA: clickSnap.distToA,
        distToB: clickSnap.distToB,
      },
    );

    if (!pathResult) {
      return;
    }

    const alongTrailMeters = pathResult.distanceMeters;

    if (!bestSite || directMeters < bestSite.directMeters) {
      bestSite = {
        sitePoint,
        siteName,
        siteSnap,
        directMeters,
        alongTrailMeters,
        pathNodeKeys: pathResult.pathNodeKeys,
      };
    }
  });

  if (!bestSite) {
    return {
      label: formatImperialDistance(offTrailMeters),
      detail: `${formatNameOrUnknown('Trail', trailName)} • A trailhead was found, but it could not be matched to the same trail segment; showing only off-trail distance.`,
      offTrailMeters,
      alongTrailMeters: null,
      totalMeters: offTrailMeters,
      trailName,
      trailheadName: null,
      routeGeometry: null,
    };
  }

  const alongTrailMeters = bestSite.alongTrailMeters;
  const totalMeters = offTrailMeters + alongTrailMeters;
  const trailheadName = bestSite.siteName;

  const routePath: number[][] = [];
  routePath.push([
    bestSite.siteSnap.snapPoint.x,
    bestSite.siteSnap.snapPoint.y,
  ]);
  bestSite.pathNodeKeys.forEach((key) => {
    const node = graph.nodes.get(key);
    if (!node) {
      return;
    }
    const last = routePath[routePath.length - 1];
    if (last[0] === node.x && last[1] === node.y) {
      return;
    }
    routePath.push([node.x, node.y]);
  });
  routePath.push([clickSnap.snapPoint.x, clickSnap.snapPoint.y]);

  const routeGeometry =
    routePath.length >= 2
      ? new EsriPolyline({
          paths: [routePath],
          spatialReference: mapPoint.spatialReference,
        })
      : null;

  return {
    label: formatImperialDistance(totalMeters),
    detail: `${formatNameOrUnknown('Trail', trailName)} • ${formatNameOrUnknown('Trailhead', trailheadName)} • Off trail: ${formatImperialDistance(offTrailMeters)} • Along trail: ${formatImperialDistance(alongTrailMeters)}`,
    offTrailMeters,
    alongTrailMeters,
    totalMeters,
    trailName,
    trailheadName,
    routeGeometry,
  };
}
