import type { Polygon, Site } from './types';

export type Bounds = [number, number, number, number];
export const DEFAULT_BOUNDS: Bounds = [76.085, 11.585, 76.155, 11.65];

export function siteBounds(sites: Site[]): Bounds {
  if (!sites.length) return [...DEFAULT_BOUNDS];
  let left = 180, right = -180, bottom = 90, top = -90;
  for (const site of sites) for (const ring of site.boundary.coordinates) for (const p of ring) {
    left = Math.min(left, p[0]); right = Math.max(right, p[0]);
    bottom = Math.min(bottom, p[1]); top = Math.max(top, p[1]);
  }
  const dx = Math.max((right - left) * 0.2, 0.001), dy = Math.max((top - bottom) * 0.2, 0.001);
  return [Math.max(-180, left - dx), Math.max(-90, bottom - dy), Math.min(180, right + dx), Math.min(90, top + dy)];
}

export function coordinateAt(x: number, y: number, bounds: Bounds): [number, number] {
  return [bounds[0] + Math.max(0, Math.min(1, x)) * (bounds[2] - bounds[0]), bounds[3] - Math.max(0, Math.min(1, y)) * (bounds[3] - bounds[1])];
}

export function closePolygon(points: number[][]): Polygon {
  if (points.length < 3) throw new Error('Add at least three points to define a site.');
  return { type: 'Polygon', coordinates: [[...points.map((point) => [...point]), [...points[0]]]] };
}

export function approximateHectares(points: number[][]): number {
  if (points.length < 3) return 0;
  const avgLat = points.reduce((sum, p) => sum + p[1], 0) / points.length;
  const latScale = 111320;
  const lonScale = 111320 * Math.cos((avgLat * Math.PI) / 180);
  let areaM2 = 0;
  for (let i = 0; i < points.length; i++) {
    const j = (i + 1) % points.length;
    const xi = points[i][0] * lonScale;
    const yi = points[i][1] * latScale;
    const xj = points[j][0] * lonScale;
    const yj = points[j][1] * latScale;
    areaM2 += xi * yj - xj * yi;
  }
  return Math.abs(areaM2) / 2 / 10000;
}

export function createRectanglePolygon(p1: [number, number], p2: [number, number]): Polygon {
  const minX = Math.min(p1[0], p2[0]), maxX = Math.max(p1[0], p2[0]);
  const minY = Math.min(p1[1], p2[1]), maxY = Math.max(p1[1], p2[1]);
  if (Math.abs(maxX - minX) < 0.00001 || Math.abs(maxY - minY) < 0.00001) {
    throw new Error('Drag across the map to define a site area.');
  }
  return {
    type: 'Polygon',
    coordinates: [[[minX, minY], [maxX, minY], [maxX, maxY], [minX, maxY], [minX, minY]]],
  };
}

export function createCenteredPlot(bounds: Bounds, hectares = 5): Polygon {
  const centerLon = (bounds[0] + bounds[2]) / 2;
  const centerLat = (bounds[1] + bounds[3]) / 2;
  const sideMeters = Math.sqrt(hectares * 10000);
  const latDelta = (sideMeters / 111320) / 2;
  const lonDelta = (sideMeters / (111320 * Math.cos((centerLat * Math.PI) / 180))) / 2;
  return createRectanglePolygon(
    [centerLon - lonDelta, centerLat - latDelta],
    [centerLon + lonDelta, centerLat + latDelta],
  );
}

export function readPolygon(text: string): Polygon {
  let geometry: unknown;
  try { geometry = JSON.parse(text); } catch { throw new Error('Enter valid GeoJSON. Check the commas and brackets.'); }
  if (!geometry || typeof geometry !== 'object' || !('type' in geometry) || geometry.type !== 'Polygon' || !('coordinates' in geometry) || !Array.isArray(geometry.coordinates)) {
    throw new Error('Provide a GeoJSON Polygon with type and coordinates.');
  }
  return geometry as Polygon;
}

export function exportSites(sites: Site[], name: string) {
  const collection = { type: 'FeatureCollection', features: sites.map((site) => ({
    type: 'Feature', id: site.id, properties: { name: site.name, area_hectares: site.area_hectares }, geometry: site.boundary,
  })) };
  const url = URL.createObjectURL(new Blob([JSON.stringify(collection, null, 2)], { type: 'application/geo+json' }));
  const link = document.createElement('a');
  link.href = url; link.download = `${name.replace(/[^a-z0-9-]/gi, '-').slice(0, 80)}-sites.geojson`;
  link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export const number = (value: number | null | undefined, digits = 1) => value == null ? '—' : new Intl.NumberFormat('en', { maximumFractionDigits: digits }).format(value);
export const shortDate = (value: string) => new Intl.DateTimeFormat('en', { month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(value));
