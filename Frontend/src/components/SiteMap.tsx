import { lazy, Suspense, useEffect, useState } from 'react';
import { Check, Crosshair, LocateFixed, MapPin, Minus, Pentagon, Plus, RotateCcw, Sparkles, Square, Undo2, X } from 'lucide-react';
import type { Polygon, Site } from '../types';
import { approximateHectares, closePolygon, coordinateAt, createCenteredPlot, createRectanglePolygon, number, siteBounds, type Bounds } from '../geo';

const MapboxMap = lazy(() => import('./MapboxMap'));
export interface MapProps {
  sites: Site[]; selectedId: string | null; onSelect: (id: string) => void;
  drawing: boolean; onBoundary: (polygon: Polygon) => void; onCancel: () => void;
}

export function SiteMap(props: MapProps) {
  const [fallback, setFallback] = useState(false);
  const token = import.meta.env.VITE_MAPBOX_ACCESS_TOKEN?.trim();
  return token && !fallback ? <Suspense fallback={<div className="map-loading">Preparing map…</div>}><MapboxMap {...props} token={token} onFallback={() => setFallback(true)} /></Suspense> : <CoordinateMap {...props} />;
}

function CoordinateMap({ sites, selectedId, onSelect, drawing, onBoundary, onCancel }: MapProps) {
  const [bounds, setBounds] = useState<Bounds>(() => siteBounds(sites));
  const [mode, setMode] = useState<'rectangle' | 'polygon'>('rectangle');
  const [points, setPoints] = useState<number[][]>([]);
  const [centerOpen, setCenterOpen] = useState(false);
  const [longitude, setLongitude] = useState(((bounds[0] + bounds[2]) / 2).toFixed(4));
  const [latitude, setLatitude] = useState(((bounds[1] + bounds[3]) / 2).toFixed(4));
  const [centerError, setCenterError] = useState('');

  // Interactive drawing states
  const [hoverCoord, setHoverCoord] = useState<[number, number] | null>(null);
  const [dragStart, setDragStart] = useState<[number, number] | null>(null);
  const [dragCurrent, setDragCurrent] = useState<[number, number] | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [snapToStart, setSnapToStart] = useState(false);

  const x = (value: number) => (value - bounds[0]) / (bounds[2] - bounds[0]) * 1000;
  const y = (value: number) => (bounds[3] - value) / (bounds[3] - bounds[1]) * 600;

  // Reset drawing internal state when drawing toggles
  useEffect(() => {
    if (!drawing) {
      setPoints([]);
      setDragStart(null);
      setDragCurrent(null);
      setIsDragging(false);
      setSnapToStart(false);
      setHoverCoord(null);
    }
  }, [drawing]);

  // Keyboard accessibility
  useEffect(() => {
    if (!drawing) return;
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        onCancel();
      } else if (event.key === 'Enter' && mode === 'polygon' && points.length >= 3) {
        onBoundary(closePolygon(points));
        setPoints([]);
      } else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z' && mode === 'polygon') {
        setPoints((prev) => prev.slice(0, -1));
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [drawing, mode, points, onCancel, onBoundary]);

  function getCoord(event: React.MouseEvent<SVGSVGElement>): { coord: [number, number]; px: number; py: number } {
    const rect = event.currentTarget.getBoundingClientRect();
    const relX = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
    const relY = Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height));
    const coord = coordinateAt(relX, relY, bounds);
    return { coord, px: relX * 1000, py: relY * 600 };
  }

  function handleMouseMove(event: React.MouseEvent<SVGSVGElement>) {
    const { coord, px, py } = getCoord(event);
    setHoverCoord(coord);

    if (!drawing) return;

    if (mode === 'rectangle' && isDragging) {
      setDragCurrent(coord);
    } else if (mode === 'polygon' && points.length >= 1) {
      const p0x = x(points[0][0]);
      const p0y = y(points[0][1]);
      const dist = Math.hypot(px - p0x, py - p0y);
      setSnapToStart(dist < 22 && points.length >= 3);
    }
  }

  function handleMouseDown(event: React.MouseEvent<SVGSVGElement>) {
    if (!drawing) return;
    if (mode === 'rectangle') {
      const { coord } = getCoord(event);
      setDragStart(coord);
      setDragCurrent(coord);
      setIsDragging(true);
    }
  }

  function handleMouseUp() {
    if (!drawing) return;
    if (mode === 'rectangle' && isDragging && dragStart && dragCurrent) {
      const minX = Math.min(dragStart[0], dragCurrent[0]);
      const maxX = Math.max(dragStart[0], dragCurrent[0]);
      const minY = Math.min(dragStart[1], dragCurrent[1]);
      const maxY = Math.max(dragStart[1], dragCurrent[1]);
      if ((maxX - minX) > 0.0001 && (maxY - minY) > 0.0001) {
        try {
          const poly = createRectanglePolygon(dragStart, dragCurrent);
          onBoundary(poly);
        } catch {
          // Ignore zero-area drag
        }
      }
      setIsDragging(false);
      setDragStart(null);
      setDragCurrent(null);
    }
  }

  function handleClick(event: React.MouseEvent<SVGSVGElement>) {
    if (!drawing) return;
    const { coord } = getCoord(event);
    if (mode === 'polygon') {
      if (snapToStart && points.length >= 3) {
        onBoundary(closePolygon(points));
        setPoints([]);
        setSnapToStart(false);
      } else {
        setPoints((prev) => [...prev, coord]);
      }
    } else if (mode === 'rectangle' && !isDragging) {
      if (!dragStart) {
        setDragStart(coord);
        setDragCurrent(coord);
      } else {
        try {
          const poly = createRectanglePolygon(dragStart, coord);
          onBoundary(poly);
        } catch {
          // ignore
        }
        setDragStart(null);
        setDragCurrent(null);
      }
    }
  }

  function handleDoubleClick() {
    if (!drawing) return;
    if (mode === 'polygon' && points.length >= 3) {
      onBoundary(closePolygon(points));
      setPoints([]);
    }
  }

  function viewport(lon: number, lat: number, factor: number) {
    const width = Math.min(360, Math.max(0.00001, (bounds[2] - bounds[0]) * factor));
    const height = Math.min(180, Math.max(0.00001, (bounds[3] - bounds[1]) * factor));
    const left = Math.max(-180, Math.min(180 - width, lon - width / 2));
    const bottom = Math.max(-90, Math.min(90 - height, lat - height / 2));
    setBounds([left, bottom, left + width, bottom + height]);
  }
  function zoom(factor: number) { viewport((bounds[0] + bounds[2]) / 2, (bounds[1] + bounds[3]) / 2, factor); }

  const liveHectares = (() => {
    if (!drawing) return null;
    if (mode === 'rectangle' && dragStart && dragCurrent) {
      const minX = Math.min(dragStart[0], dragCurrent[0]);
      const maxX = Math.max(dragStart[0], dragCurrent[0]);
      const minY = Math.min(dragStart[1], dragCurrent[1]);
      const maxY = Math.max(dragStart[1], dragCurrent[1]);
      return approximateHectares([
        [minX, minY], [maxX, minY], [maxX, maxY], [minX, maxY],
      ]);
    }
    if (mode === 'polygon' && points.length >= 2 && hoverCoord) {
      return approximateHectares([...points, hoverCoord]);
    }
    if (mode === 'polygon' && points.length >= 3) {
      return approximateHectares(points);
    }
    return null;
  })();

  const rectPreview = (mode === 'rectangle' && dragStart && dragCurrent) ? (() => {
    const minX = Math.min(dragStart[0], dragCurrent[0]);
    const maxX = Math.max(dragStart[0], dragCurrent[0]);
    const minY = Math.min(dragStart[1], dragCurrent[1]);
    const maxY = Math.max(dragStart[1], dragCurrent[1]);
    return {
      x: x(minX),
      y: y(maxY),
      width: Math.max(1, x(maxX) - x(minX)),
      height: Math.max(1, y(minY) - y(maxY)),
      cx: (x(minX) + x(maxX)) / 2,
      cy: (y(minY) + y(maxY)) / 2,
    };
  })() : null;

  return <div className={`coordinate-map ${drawing ? 'is-drawing' : ''}`}>
    <div className="map-mode"><span className="tiny-dot" />Coordinate workspace<span className="map-mode-detail">WGS 84</span></div>

    <svg
      className="coordinate-surface"
      data-testid="coordinate-map"
      role="img"
      aria-label="Site boundaries on a longitude and latitude grid"
      viewBox="0 0 1000 600"
      preserveAspectRatio="none"
      onMouseMove={handleMouseMove}
      onMouseDown={handleMouseDown}
      onMouseUp={handleMouseUp}
      onClick={handleClick}
      onDoubleClick={handleDoubleClick}
      onMouseLeave={() => setHoverCoord(null)}
    >
      <defs>
        <pattern id="map-grid-small" width="50" height="50" patternUnits="userSpaceOnUse">
          <path d="M 50 0 L 0 0 0 50" fill="none" stroke="#dce3d6" strokeWidth=".8" />
        </pattern>
        <pattern id="map-grid-large" width="250" height="150" patternUnits="userSpaceOnUse">
          <rect width="250" height="150" fill="url(#map-grid-small)" />
          <path d="M 250 0 L 0 0 0 150" fill="none" stroke="#ced8c7" strokeWidth="1" />
        </pattern>
      </defs>
      <rect width="1000" height="600" fill="url(#map-grid-large)" />

      {/* Existing site polygons */}
      {sites.map((site, index) => (
        <g key={site.id} className="site-polygon" onClick={(event) => { if (!drawing) { event.stopPropagation(); onSelect(site.id); } }}>
          <path
            d={site.boundary.coordinates.map((ring) => ring.map((p, i) => `${i ? 'L' : 'M'} ${x(p[0])} ${y(p[1])}`).join(' ') + 'Z').join(' ')}
            fill={selectedId === site.id ? '#80ae64' : ['#94b898', '#8fafad', '#a9b981'][index % 3]}
            fillOpacity={selectedId === site.id ? '.4' : '.24'}
            stroke={selectedId === site.id ? '#315f36' : '#738b70'}
            strokeWidth={selectedId === site.id ? 2.5 : 1.5}
            fillRule="evenodd"
            vectorEffect="non-scaling-stroke"
          />
        </g>
      ))}

      {/* RECTANGLE PREVIEW */}
      {rectPreview && (
        <g className="drag-guide-box">
          <rect
            x={rectPreview.x}
            y={rectPreview.y}
            width={rectPreview.width}
            height={rectPreview.height}
            fill="rgba(125, 185, 105, 0.32)"
            stroke="#1d5530"
            strokeWidth="2.5"
            strokeDasharray="6 3"
            rx="3"
          />
          {liveHectares != null && liveHectares > 0 && (
            <g transform={`translate(${rectPreview.cx}, ${rectPreview.cy})`}>
              <rect x="-42" y="-12" width="84" height="24" rx="12" fill="#184227" />
              <text textAnchor="middle" y="4" fill="#fff" fontSize="11" fontWeight="bold">~{number(liveHectares)} ha</text>
            </g>
          )}
        </g>
      )}

      {/* POLYGON PREVIEW */}
      {drawing && mode === 'polygon' && points.length > 0 && (
        <g>
          {hoverCoord && points.length >= 2 && (
            <polygon
              points={[...points, snapToStart ? points[0] : hoverCoord].map((p) => `${x(p[0])},${y(p[1])}`).join(' ')}
              fill="rgba(125, 185, 105, 0.22)"
              stroke="#2e6439"
              strokeWidth="1.5"
              strokeDasharray="4 3"
            />
          )}

          <polyline
            points={points.map((p) => `${x(p[0])},${y(p[1])}`).join(' ')}
            fill="none"
            stroke="#204c35"
            strokeWidth="2.5"
          />

          {hoverCoord && (
            <line
              x1={x(points[points.length - 1][0])}
              y1={y(points[points.length - 1][1])}
              x2={snapToStart ? x(points[0][0]) : x(hoverCoord[0])}
              y2={snapToStart ? y(points[0][1]) : y(hoverCoord[1])}
              stroke="#1d5330"
              strokeWidth="2"
              strokeDasharray="5 3"
            />
          )}

          {points.map((p, i) => (
            <g key={i}>
              <circle cx={x(p[0])} cy={y(p[1])} r="5.5" fill="#fff" stroke="#1d5330" strokeWidth="2.5" />
              <circle cx={x(p[0])} cy={y(p[1])} r="2.5" fill="#1d5330" />
            </g>
          ))}

          {snapToStart && points.length >= 3 && (
            <g>
              <circle cx={x(points[0][0])} cy={y(points[0][1])} className="snap-ring" fill="none" stroke="#256b37" />
              <rect x={x(points[0][0]) + 10} y={y(points[0][1]) - 26} width="95" height="20" rx="4" fill="#184227" />
              <text x={x(points[0][0]) + 16} y={y(points[0][1]) - 12} fill="#fff" fontSize="10" fontWeight="600">Click to close</text>
            </g>
          )}
        </g>
      )}
    </svg>

    {/* Axis indicators */}
    {Array.from({ length: 4 }, (_, i) => (
      <div key={i} className="map-axis">
        <span className="longitude-label" style={{ left: `${i * 25 + 1}%` }}>{(bounds[0] + (bounds[2] - bounds[0]) * i / 4).toFixed(3)}°</span>
        <span className="latitude-label" style={{ top: `${i * 25 + 12.5}%` }}>{(bounds[3] - (bounds[3] - bounds[1]) * (i / 4 + .125)).toFixed(3)}°</span>
      </div>
    ))}

    {!drawing && sites.map((site, index) => {
      const ring = site.boundary.coordinates[0].slice(0, -1);
      const left = ring.reduce((sum, p) => sum + x(p[0]), 0) / ring.length / 10;
      const top = ring.reduce((sum, p) => sum + y(p[1]), 0) / ring.length / 6;
      return <button key={site.id} className={`map-site-marker ${selectedId === site.id ? 'selected' : ''}`} style={{ left: `${left}%`, top: `${top}%` }} aria-label={`Select site ${site.name}`} onClick={() => onSelect(site.id)}>{String(index + 1).padStart(2, '0')}</button>;
    })}

    {!sites.length && !drawing && <div className="map-empty"><MapPin size={24} /><strong>Your sites belong here.</strong><span>Draw a boundary to put your project on the map.</span></div>}

    <div className="map-controls">
      <button aria-label="Zoom in" title="Zoom in" onClick={() => zoom(.65)}><Plus size={18} /></button>
      <button aria-label="Zoom out" title="Zoom out" onClick={() => zoom(1.5)}><Minus size={18} /></button>
      <button aria-label="Fit all sites" title="Fit all sites" onClick={() => setBounds(siteBounds(sites))}><LocateFixed size={18} /></button>
      <button aria-label="Set map center" title="Set map center" onClick={() => { setCenterOpen(!centerOpen); setCenterError(''); }}><Crosshair size={18} /></button>
    </div>
    <div className="map-north">N<span>↑</span></div>

    {centerOpen && <form className="map-center-form" onSubmit={(event) => {
      event.preventDefault(); const lon = Number(longitude), lat = Number(latitude);
      if (!longitude.trim() || !latitude.trim() || !Number.isFinite(lon) || !Number.isFinite(lat) || Math.abs(lon) > 180 || Math.abs(lat) > 90) { setCenterError('Enter valid longitude and latitude.'); return; }
      viewport(lon, lat, 1); setCenterOpen(false);
    }}><strong>Go to coordinates</strong><label>Longitude<input type="number" step="any" min={-180} max={180} required value={longitude} onChange={(e) => setLongitude(e.target.value)} /></label><label>Latitude<input type="number" step="any" min={-90} max={90} required value={latitude} onChange={(e) => setLatitude(e.target.value)} /></label>{centerError && <p role="alert">{centerError}</p>}<button className="button primary small-button">Go to location</button></form>}

    {/* DRAWING TOOLBAR */}
    {drawing ? (
      <div className="draw-toolbar">
        <div className="draw-tools-group" role="group" aria-label="Drawing mode">
          <button
            type="button"
            className={`draw-tool-btn ${mode === 'rectangle' ? 'active' : ''}`}
            onClick={() => { setMode('rectangle'); setPoints([]); }}
          >
            <Square size={13} />Rectangle
          </button>
          <button
            type="button"
            className={`draw-tool-btn ${mode === 'polygon' ? 'active' : ''}`}
            onClick={() => { setMode('polygon'); setDragStart(null); setDragCurrent(null); }}
          >
            <Pentagon size={13} />Polygon
          </button>
        </div>

        <div className="draw-info">
          <span className="pulse-dot" />
          <span className="draw-info-text">
            {mode === 'rectangle'
              ? (isDragging ? 'Release to set plot boundary' : 'Click & drag across map to draw a plot')
              : (points.length === 0
                  ? 'Click anywhere for 1st corner'
                  : points.length < 3
                    ? `${points.length} corner${points.length > 1 ? 's' : ''} added • Click next corner`
                    : snapToStart
                      ? '✨ Click start point to finish shape!'
                      : `${points.length} corners • Double-click or click start point to finish`)}
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
            onClick={() => onBoundary(createCenteredPlot(bounds, 5.0))}
          >
            <Sparkles size={13} />5 ha Plot
          </button>

          {mode === 'polygon' && (
            <>
              <button
                type="button"
                className="icon-button"
                aria-label="Undo last point (Ctrl+Z)"
                title="Undo last point (Ctrl+Z)"
                disabled={!points.length}
                onClick={() => setPoints((p) => p.slice(0, -1))}
              >
                <Undo2 size={16} />
              </button>
              <button
                type="button"
                className="icon-button"
                aria-label="Clear points"
                title="Clear points"
                disabled={!points.length}
                onClick={() => setPoints([])}
              >
                <RotateCcw size={15} />
              </button>
              <button
                type="button"
                className="button primary small-button"
                disabled={points.length < 3}
                onClick={() => { onBoundary(closePolygon(points)); setPoints([]); }}
              >
                <Check size={14} />Finish
              </button>
            </>
          )}

          <button
            type="button"
            className="icon-button"
            aria-label="Cancel drawing (Esc)"
            title="Cancel drawing (Esc)"
            onClick={() => { setPoints([]); onCancel(); }}
          >
            <X size={17} />
          </button>
        </div>
      </div>
    ) : (
      <div className="map-legend">
        <span><i />Site boundary</span>
        <span>WGS 84 · Longitude / latitude</span>
      </div>
    )}
  </div>;
}
