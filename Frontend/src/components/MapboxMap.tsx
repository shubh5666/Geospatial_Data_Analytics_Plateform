import { useEffect, useRef, useState, useCallback } from 'react';
import * as maplibregl from 'maplibre-gl';
import type { GeoJSONSource, StyleSpecification } from 'maplibre-gl';
import { Box, Compass, Layers, RotateCcw, RotateCw, Sparkles, X, Check, Undo2 } from 'lucide-react';
import { approximateHectares, closePolygon, createCenteredPlot, number, siteBounds } from '../geo';
import type { MapProps } from './SiteMap';
import 'maplibre-gl/dist/maplibre-gl.css';

const SATELLITE_STYLE: StyleSpecification = {
  version: 8,
  sources: {
    'esri-satellite': {
      type: 'raster',
      tiles: [
        'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      ],
      tileSize: 256,
      attribution: 'Tiles © Esri — Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community',
      maxzoom: 19,
    },
  },
  layers: [
    {
      id: 'satellite-tiles',
      type: 'raster',
      source: 'esri-satellite',
      minzoom: 0,
      maxzoom: 19,
    },
  ],
};

const OUTDOORS_STYLE: StyleSpecification = {
  version: 8,
  sources: {
    'carto-voyager': {
      type: 'raster',
      tiles: [
        'https://basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}@2x.png',
      ],
      tileSize: 256,
      attribution: '© <a href="https://www.openstreetmap.org/copyright" target="_blank">OpenStreetMap</a> contributors © <a href="https://carto.com/attributions" target="_blank">CARTO</a>',
      maxzoom: 20,
    },
  },
  layers: [
    {
      id: 'carto-tiles',
      type: 'raster',
      source: 'carto-voyager',
      minzoom: 0,
      maxzoom: 20,
    },
  ],
};

export default function MapboxMap(props: MapProps & { onFallback?: () => void }) {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const latest = useRef(props);
  latest.current = props;

  const [mapError, setMapError] = useState(false);
  const [ready, setReady] = useState(false);
  const [satellite, setSatellite] = useState(true);
  const [bearing, setBearing] = useState(0);
  const [pitch, setPitch] = useState(0);
  const [drawPoints, setDrawPoints] = useState<[number, number][]>([]);

  // Rotate and 3D control handlers
  const handleRotateLeft = useCallback(() => {
    if (!map.current) return;
    const current = map.current.getBearing();
    map.current.easeTo({ bearing: current - 45, duration: 400 });
  }, []);

  const handleRotateRight = useCallback(() => {
    if (!map.current) return;
    const current = map.current.getBearing();
    map.current.easeTo({ bearing: current + 45, duration: 400 });
  }, []);

  const handleToggle3D = useCallback(() => {
    if (!map.current) return;
    const currentPitch = map.current.getPitch();
    if (currentPitch < 25) {
      map.current.easeTo({ pitch: 58, duration: 500 });
    } else {
      map.current.easeTo({ pitch: 0, duration: 500 });
    }
  }, []);

  const handleResetNorth = useCallback(() => {
    if (!map.current) return;
    map.current.resetNorthPitch({ duration: 500 });
  }, []);

  const toggleBasemap = useCallback(() => {
    if (!map.current) return;
    setReady(false);
    const nextStyle = satellite ? OUTDOORS_STYLE : SATELLITE_STYLE;
    map.current.setStyle(nextStyle);
    setSatellite(!satellite);
  }, [satellite]);

  // Synchronize site layers
  const syncSites = useCallback(() => {
    const instance = map.current;
    if (!instance || !instance.isStyleLoaded()) return;

    const features = latest.current.sites.map((site) => ({
      type: 'Feature' as const,
      id: site.id,
      geometry: site.boundary,
      properties: { id: site.id, name: site.name },
    }));

    const data = { type: 'FeatureCollection' as const, features };

    if (!instance.getSource('sites')) {
      instance.addSource('sites', { type: 'geojson', data });
      instance.addLayer({
        id: 'site-fill',
        type: 'fill',
        source: 'sites',
        paint: {
          'fill-color': '#75be62',
          'fill-opacity': ['case', ['==', ['get', 'id'], latest.current.selectedId ?? ''], 0.52, 0.28],
        },
      });
      instance.addLayer({
        id: 'site-outline',
        type: 'line',
        source: 'sites',
        paint: {
          'line-color': '#194925',
          'line-width': 2.5,
        },
      });
    } else {
      (instance.getSource('sites') as GeoJSONSource).setData(data);
      instance.setPaintProperty('site-fill', 'fill-opacity', [
        'case',
        ['==', ['get', 'id'], latest.current.selectedId ?? ''],
        0.52,
        0.28,
      ]);
    }

    // Drawing preview source & layers
    if (!instance.getSource('draw-preview')) {
      instance.addSource('draw-preview', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      });
      instance.addLayer({
        id: 'draw-preview-fill',
        type: 'fill',
        source: 'draw-preview',
        paint: {
          'fill-color': '#a0d97b',
          'fill-opacity': 0.35,
        },
      });
      instance.addLayer({
        id: 'draw-preview-line',
        type: 'line',
        source: 'draw-preview',
        paint: {
          'line-color': '#ffffff',
          'line-width': 3,
          'line-dasharray': [2, 1],
        },
      });
      instance.addLayer({
        id: 'draw-preview-points',
        type: 'circle',
        source: 'draw-preview',
        paint: {
          'circle-radius': 6,
          'circle-color': '#215c32',
          'circle-stroke-width': 2.5,
          'circle-stroke-color': '#ffffff',
        },
      });
    }

    setReady(true);
  }, []);

  // Initialize MapLibre
  useEffect(() => {
    if (!container.current) return;
    let instance: maplibregl.Map;

    try {
      const bounds = siteBounds(latest.current.sites);
      instance = new maplibregl.Map({
        container: container.current,
        style: SATELLITE_STYLE,
        bounds: [
          [bounds[0], bounds[1]],
          [bounds[2], bounds[3]],
        ],
        fitBoundsOptions: { padding: 60, maxZoom: 15 },
        attributionControl: false,
        dragRotate: true,
        touchPitch: true,
        pitchWithRotate: true,
      });
    } catch {
      setMapError(true);
      return;
    }

    map.current = instance;

    instance.addControl(
      new maplibregl.NavigationControl({
        visualizePitch: true,
        showCompass: true,
        showZoom: true,
      }),
      'top-right'
    );

    instance.addControl(
      new maplibregl.AttributionControl({ compact: true }),
      'bottom-left'
    );

    instance.on('style.load', syncSites);

    instance.on('error', () => {
      // If WebGL fails, allow fallback
      setMapError(true);
    });

    instance.on('rotate', () => {
      setBearing(Math.round(instance.getBearing()));
    });

    instance.on('pitch', () => {
      setPitch(Math.round(instance.getPitch()));
    });

    // Site selection click handler
    instance.on('click', 'site-fill', (event) => {
      if (latest.current.drawing) return;
      const id = event.features?.[0]?.properties?.id;
      if (typeof id === 'string') latest.current.onSelect(id);
    });

    instance.on('mouseenter', 'site-fill', () => {
      if (!latest.current.drawing) instance.getCanvas().style.cursor = 'pointer';
    });

    instance.on('mouseleave', 'site-fill', () => {
      if (!latest.current.drawing) instance.getCanvas().style.cursor = '';
    });

    // Drawing click handler on map
    instance.on('click', (event) => {
      if (!latest.current.drawing) return;
      const clickedSite = instance.queryRenderedFeatures(event.point, { layers: ['site-fill'] });
      // If user clicked inside an existing site while drawing, still capture point for drawing
      if (clickedSite.length > 0 && !latest.current.drawing) return;

      const newPoint: [number, number] = [event.lngLat.lng, event.lngLat.lat];
      setDrawPoints((prev) => {
        // If clicking close to the first point with 3+ points, complete shape!
        if (prev.length >= 3) {
          const first = prev[0];
          const dist = Math.hypot(first[0] - newPoint[0], first[1] - newPoint[1]);
          if (dist < 0.003) {
            try {
              latest.current.onBoundary(closePolygon(prev));
            } catch {
              // ignore
            }
            return [];
          }
        }
        return [...prev, newPoint];
      });
    });

    // Double click to finish drawing
    instance.on('dblclick', (event) => {
      if (!latest.current.drawing) return;
      event.preventDefault();
      setDrawPoints((prev) => {
        if (prev.length >= 3) {
          try {
            latest.current.onBoundary(closePolygon(prev));
          } catch {
            // ignore
          }
        }
        return [];
      });
    });

    const observer = new ResizeObserver(() => instance.resize());
    observer.observe(container.current);

    return () => {
      observer.disconnect();
      instance.remove();
      map.current = null;
    };
  }, [syncSites]);

  // Update site layers when sites or selectedId change
  useEffect(() => {
    if (!ready) return;
    syncSites();
  }, [props.sites, props.selectedId, ready, syncSites]);

  // Synchronize drawing preview GeoJSON
  useEffect(() => {
    const instance = map.current;
    if (!ready || !instance) return;
    const source = instance.getSource('draw-preview') as GeoJSONSource | undefined;
    if (!source) return;

    if (!props.drawing || drawPoints.length === 0) {
      source.setData({ type: 'FeatureCollection', features: [] });
      return;
    }

    const features: GeoJSON.Feature[] = [];

    // Vertices
    for (let i = 0; i < drawPoints.length; i++) {
      features.push({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: drawPoints[i] },
        properties: { index: i + 1 },
      });
    }

    // Line connecting vertices
    if (drawPoints.length >= 2) {
      features.push({
        type: 'Feature',
        geometry: { type: 'LineString', coordinates: drawPoints },
        properties: {},
      });
    }

    // Polygon preview if 3+ vertices
    if (drawPoints.length >= 3) {
      features.push({
        type: 'Feature',
        geometry: {
          type: 'Polygon',
          coordinates: [[...drawPoints, drawPoints[0]]],
        },
        properties: {},
      });
    }

    source.setData({ type: 'FeatureCollection', features });
  }, [drawPoints, props.drawing, ready]);

  // Reset drawing points when props.drawing turns false
  useEffect(() => {
    if (!props.drawing) {
      setDrawPoints([]);
    }
  }, [props.drawing]);

  // Calculate live hectares for drawing
  const liveHectares = drawPoints.length >= 3 ? approximateHectares(drawPoints) : null;

  return (
    <div className="mapbox-wrapper">
      <div className="mapbox-container" ref={container} />

      {/* Rotation & 3D Tilt Toolbar */}
      <div className="map-rotate-controls" role="toolbar" aria-label="Map camera and rotation controls">
        <button
          type="button"
          aria-label="Rotate map left 45 degrees"
          title={`Rotate Left 45° (Current: ${bearing}°)`}
          onClick={handleRotateLeft}
        >
          <RotateCcw size={16} />
        </button>
        <button
          type="button"
          aria-label="Rotate map right 45 degrees"
          title={`Rotate Right 45° (Current: ${bearing}°)`}
          onClick={handleRotateRight}
        >
          <RotateCw size={16} />
        </button>
        <button
          type="button"
          aria-label="Toggle 3D perspective pitch"
          title={pitch > 20 ? `Reset to 2D Top-Down View (${pitch}°)` : 'Tilt into 3D Isometric View (58°)'}
          style={pitch > 20 ? { color: '#1b4d28', background: '#e5f3df', fontWeight: 'bold' } : undefined}
          onClick={handleToggle3D}
        >
          <Box size={16} />
        </button>
        <button
          type="button"
          aria-label="Reset North"
          title={`Reset to North (Bearing: ${bearing}°, Pitch: ${pitch}°)`}
          onClick={handleResetNorth}
        >
          <Compass
            size={16}
            style={{
              transform: `rotate(${-bearing}deg)`,
              transition: 'transform 0.25s cubic-bezier(0.2, 0, 0, 1)',
              color: bearing !== 0 ? '#1b4d28' : undefined,
            }}
          />
        </button>
      </div>

      {/* Basemap Switcher (Satellite vs Outdoors) */}
      <button
        type="button"
        className="basemap-toggle"
        disabled={props.drawing}
        onClick={toggleBasemap}
        title="Toggle between Satellite Imagery and Cartographic Topo map"
      >
        <Layers size={14} />
        <span>{satellite ? 'Outdoors Map' : 'Satellite View'}</span>
      </button>

      {/* Fallback notification if WebGL error occurs */}
      {mapError && (
        <div className="map-error" role="status">
          Interactive WebGL map background unavailable in this browser environment.
          {props.onFallback && (
            <button type="button" className="text-button" onClick={props.onFallback}>
              Switch to 2D coordinate workspace
            </button>
          )}
        </div>
      )}

      {/* Drawing Toolbar */}
      {props.drawing && (
        <div className="draw-toolbar">
          <div className="draw-info">
            <span className="pulse-dot" />
            <span className="draw-info-text">
              {drawPoints.length === 0
                ? 'Click on the map for Corner 1'
                : drawPoints.length < 3
                  ? `Corner ${drawPoints.length} placed! Click for Corner ${drawPoints.length + 1}`
                  : `${drawPoints.length} corners placed • Double-click or click start point to finish`}
            </span>
            {liveHectares != null && liveHectares > 0 && (
              <span className="draw-area-chip">~{number(liveHectares)} ha</span>
            )}
          </div>
          <div className="draw-actions">
            <button
              type="button"
              className="button secondary small-button"
              title="Place a ready 5-hectare plot in current map view"
              onClick={() => {
                const center = map.current?.getCenter();
                const centerBounds: [number, number, number, number] = center
                  ? [center.lng - 0.01, center.lat - 0.01, center.lng + 0.01, center.lat + 0.01]
                  : siteBounds(latest.current.sites);
                latest.current.onBoundary(createCenteredPlot(centerBounds, 5));
                setDrawPoints([]);
              }}
            >
              <Sparkles size={13} />5 ha Plot
            </button>

            {drawPoints.length > 0 && (
              <>
                <button
                  type="button"
                  className="icon-button"
                  aria-label="Undo last corner"
                  title="Undo last corner"
                  onClick={() => setDrawPoints((p) => p.slice(0, -1))}
                >
                  <Undo2 size={16} />
                </button>
                <button
                  type="button"
                  className="button primary small-button"
                  disabled={drawPoints.length < 3}
                  onClick={() => {
                    if (drawPoints.length >= 3) {
                      latest.current.onBoundary(closePolygon(drawPoints));
                      setDrawPoints([]);
                    }
                  }}
                >
                  <Check size={14} />Finish
                </button>
              </>
            )}

            <button
              type="button"
              className="icon-button"
              aria-label="Cancel drawing"
              onClick={() => {
                setDrawPoints([]);
                props.onCancel();
              }}
            >
              <X size={18} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
