import { describe, expect, it } from 'vitest';
import { approximateHectares, closePolygon, coordinateAt, createCenteredPlot, createRectanglePolygon, readPolygon, siteBounds } from './geo';
import type { Site } from './types';

describe('boundary editing', () => {
  it('converts screen positions into longitude/latitude with the y axis inverted', () => {
    expect(coordinateAt(0, 0, [70, 10, 80, 20])).toEqual([70, 20]);
    expect(coordinateAt(1, 1, [70, 10, 80, 20])).toEqual([80, 10]);
    expect(coordinateAt(.5, .5, [70, 10, 80, 20])).toEqual([75, 15]);
  });
  it('closes a polygon without changing the original points', () => {
    const points = [[77, 28], [78, 28], [78, 29]];
    const polygon = closePolygon(points);
    expect(points).toHaveLength(3);
    expect(polygon.coordinates[0]).toEqual([...points, [77, 28]]);
    expect(() => closePolygon(points.slice(0, 2))).toThrow('three points');
  });
  it('rejects a feature wrapper and malformed JSON with actionable errors', () => {
    expect(() => readPolygon('{')).toThrow('valid GeoJSON');
    expect(() => readPolygon('{"type":"Feature"}')).toThrow('Polygon');
    expect(readPolygon(JSON.stringify(closePolygon([[0, 0], [1, 0], [1, 1]]))).type).toBe('Polygon');
  });
  it('fits multiple polygons and keeps world coordinates within bounds', () => {
    const sites = [{ boundary: closePolygon([[179, 89], [180, 89], [180, 90]]) }] as Site[];
    const bounds = siteBounds(sites);
    expect(bounds[0]).toBeLessThan(179);
    expect(bounds[1]).toBeLessThan(89);
    expect(bounds[2]).toBe(180);
    expect(bounds[3]).toBe(90);
  });
  it('calculates approximate hectares and builds rectangular polygons accurately', () => {
    const rect = createRectanglePolygon([77.0, 28.0], [77.01, 28.01]);
    expect(rect.type).toBe('Polygon');
    expect(rect.coordinates[0]).toHaveLength(5);
    const ha = approximateHectares(rect.coordinates[0].slice(0, 4));
    expect(ha).toBeGreaterThan(50);
    expect(ha).toBeLessThan(150);
  });
  it('generates a centered standard plot of roughly the requested size', () => {
    const plot = createCenteredPlot([76.085, 11.585, 76.155, 11.65], 5);
    expect(plot.type).toBe('Polygon');
    const ha = approximateHectares(plot.coordinates[0].slice(0, 4));
    expect(ha).toBeCloseTo(5, 0);
  });
});
