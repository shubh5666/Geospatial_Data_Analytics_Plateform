import { lazy, Suspense, useEffect, useState } from 'react';
import { Check, Crosshair, LocateFixed, MapPin, Minus, Pencil, Pentagon, Plus, RotateCcw, Sparkles, Square, Undo2, X } from 'lucide-react';
import type { Polygon, Site } from '../types';
import { approximateHectares, closePolygon, coordinateAt, createCenteredPlot, createRectanglePolygon, number, simplifyPoints, siteBounds, type Bounds } from '../geo';

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
  const [mode, setMode] = useState<'polygon' | 'sketch' | 'rectangle'>('polygon');
  const [points, setPoints] = useState<number[][]>([]);
  const [sketchPoints, setSketchPoints] = useState<number[][]>([]);
  const [isSketching, setIsSketching] = useState(false);

  // Rectangle mode state
  const [rectCorner1, setRectCorner1] = useState<[number, number] | null>(null);
  const [rectCorner2, setRectCorner2] = useState<[number, number] | null>(null);

  // Interactive state
  const [hoverCoord, setHoverCoord] = useState<[number, number] | null>(null);
  const [snapToStart, setSnapToStart] = useState(false);

  const [centerOpen, setCenterOpen] = useState(false);
  const [longitude, setLongitude] = useState(((bounds[0] + bounds[2]) / 2).toFixed(4));
  const [latitude, setLatitude] = useState(((bounds[1] + bounds[3]) / 2).toFixed(4));
  const [centerError, setCenterError] = useState('');

  const x = (value: number) => (value - bounds[0]) / (bounds[2] - bounds[0]) * 1000;
  const y = (value: number) => (bounds[3] - value) / (bounds[3] - bounds[1]) * 600;

  // Reset drawing internal state when drawing toggles
  useEffect(() => {
    if (!drawing) {
      setPoints([]);
      setSketchPoints([]);
      setIsSketching(false);
      setRectCorner1(null);
      setRectCorner2(null);
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
      } else if (event.key === 'Enter') {
        if (mode === 'polygon' && points.length >= 3) {
          onBoundary(closePolygon(points));
          setPoints([]);
        }
      } else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
        if (mode === 'polygon') setPoints((prev) => prev.slice(0, -1));
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

    if (mode === 'polygon') {
      if (points.length >= 3) {
        const p0x = x(points[0][0]);
        const p0y = y(points[0][1]);
        setSnapToStart(Math.hypot(px - p0x, py - p0y) < 26);
      } else {
        setSnapToStart(false);
      }
    } else if (mode === 'sketch' && isSketching) {
      const prev = sketchPoints[sketchPoints.length - 1];
      if (!prev) {
        setSketchPoints([coord]);
      } else {
        const dx = Math.abs(x(coord[0]) - x(prev[0]));
        const dy = Math.abs(y(coord[1]) - y(prev[1]));
        if (dx >= 4 || dy >= 4) {
          setSketchPoints((prev) => [...prev, coord]);
        }
      }
    } else if (mode === 'rectangle' && rectCorner1) {
      setRectCorner2(coord);
    }
  }

  function handleMouseDown(event: React.MouseEvent<SVGSVGElement>) {
    if (!drawing) return;
    const { coord } = getCoord(event);
    if (mode === 'sketch') {
      setIsSketching(true);
      setSketchPoints([coord]);
    } else if (mode === 'rectangle') {
      if (!rectCorner1) {
        setRectCorner1(coord);
        setRectCorner2(coord);
      }
    }
  }

  function handleMouseUp(event: React.MouseEvent<SVGSVGElement>) {
    if (!drawing) return;
    if (mode === 'sketch' && isSketching) {
      setIsSketching(false);
      if (sketchPoints.length >= 4) {
        const simplified = simplifyPoints(sketchPoints, 12);
        if (simplified.length >= 3) {
          try {
            onBoundary(closePolygon(simplified));
          } catch {
            // ignore
          }
        }
      }
      setSketchPoints([]);
    } else if (mode === 'rectangle' && rectCorner1) {
      const { coord } = getCoord(event);
      const minX = Math.min(rectCorner1[0], coord[0]);
      const maxX = Math.max(rectCorner1[0], coord[0]);
      const minY = Math.min(rectCorner1[1], coord[1]);
      const maxY = Math.max(rectCorner1[1], coord[1]);
      if ((maxX - minX) > 0.0001 && (maxY - minY) > 0.0001) {
        try {
          const poly = createRectanglePolygon(rectCorner1, coord);
          onBoundary(poly);
          setRectCorner1(null);
          setRectCorner2(null);
        } catch {
          // ignore
        }
      }
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
        // Every single click adds a point immediately and reliably!
        setPoints((prev) => [...prev, coord]);
      }
    } else if (mode === 'rectangle' && rectCorner1 && !isSketching) {
      try {
        const poly = createRectanglePolygon(rectCorner1, coord);
        onBoundary(poly);
        setRectCorner1(null);
        setRectCorner2(null);
      } catch {
        // ignore
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
    if (mode === 'polygon') {
      if (points.length >= 2 && hoverCoord) {
        return approximateHectares([...points, snapToStart ? points[0] : hoverCoord]);
      }
      if (points.length >= 3) return approximateHectares(points);
    } else if (mode === 'sketch' && sketchPoints.length >= 3) {
      return approximateHectares(sketchPoints);
    } else if (mode === 'rectangle' && rectCorner1) {
      const p2 = rectCorner2 || hoverCoord;
      if (p2) {
        const minX = Math.min(rectCorner1[0], p2[0]);
        const maxX = Math.max(rectCorner1[0], p2[0]);
        const minY = Math.min(rectCorner1[1], p2[1]);
        const maxY = Math.max(rectCorner1[1], p2[1]);
        return approximateHectares([[minX, minY], [maxX, minY], [maxX, maxY], [minX, maxY]]);
      }
    }
    return null;
  })();

  const rectPreview = (mode === 'rectangle' && rectCorner1 && (rectCorner2 || hoverCoord)) ? (() => {
    const p2 = (rectCorner2 || hoverCoord)!;
    const minX = Math.min(rectCorner1[0], p2[0]);
    const maxX = Math.max(rectCorner1[0], p2[0]);
    const minY = Math.min(rectCorner1[1], p2[1]);
    const maxY = Math.max(rectCorner1[1], p2[1]);
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
      <rect width="1000" height="600" fill="url(#map-grid-large)" style={{ pointerEvents: 'none' }} />

      {/* Existing site polygons (disabled pointer-events during drawing so they never intercept clicks) */}
      {sites.map((site, index) => (
        <g
          key={site.id}
          className="site-polygon"
          style={{ pointerEvents: drawing ? 'none' : 'auto' }}
          onClick={(event) => { if (!drawing) { event.stopPropagation(); onSelect(site.id); } }}
        >
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

      {/* FREEHAND SKETCH PREVIEW */}
      {drawing && mode === 'sketch' && sketchPoints.length > 0 && (
        <g style={{ pointerEvents: 'none' }}>
          <polyline
            points={sketchPoints.map((p) => `${x(p[0])},${y(p[1])}`).join(' ')}
            fill="rgba(125, 185, 105, 0.28)"
            stroke="#1d5530"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          {liveHectares != null && liveHectares > 0 && (
            <text
              x={x(sketchPoints[sketchPoints.length - 1][0])}
              y={y(sketchPoints[sketchPoints.length - 1][1]) - 14}
              fill="#184227"
              fontSize="11"
              fontWeight="bold"
              textAnchor="middle"
            >
              ~{number(liveHectares)} ha
            </text>
          )}
        </g>
      )}

      {/* RECTANGLE PREVIEW */}
      {rectPreview && (
        <g className="drag-guide-box" style={{ pointerEvents: 'none' }}>
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
        <g style={{ pointerEvents: 'none' }}>
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
              <circle cx={x(p[0])} cy={y(p[1])} r="7" fill="#1d5330" stroke="#fff" strokeWidth="2.5" />
              <text x={x(p[0])} y={y(p[1]) + 3.5} textAnchor="middle" fill="#fff" fontSize="8" fontWeight="bold">{i + 1}</text>
            </g>
          ))}

          {snapToStart && points.length >= 3 && (
            <g>
              <circle cx={x(points[0][0])} cy={y(points[0][1])} className="snap-ring" fill="none" stroke="#256b37" />
              <rect x={x(points[0][0]) + 12} y={y(points[0][1]) - 26} width="96" height="20" rx="4" fill="#184227" />
              <text x={x(points[0][0]) + 18} y={y(points[0][1]) - 12} fill="#fff" fontSize="10" fontWeight="600">Click to close</text>
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
            className={`draw-tool-btn ${mode === 'polygon' ? 'active' : ''}`}
            onClick={() => { setMode('polygon'); setPoints([]); setRectCorner1(null); setRectCorner2(null); setSketchPoints([]); }}
          >
            <Pentagon size={13} />Click Corners
          </button>
          <button
            type="button"
            className={`draw-tool-btn ${mode === 'sketch' ? 'active' : ''}`}
            onClick={() => { setMode('sketch'); setPoints([]); setRectCorner1(null); setRectCorner2(null); setSketchPoints([]); }}
          >
            <Pencil size={13} />Freehand Sketch
          </button>
          <button
            type="button"
            className={`draw-tool-btn ${mode === 'rectangle' ? 'active' : ''}`}
            onClick={() => { setMode('rectangle'); setPoints([]); setRectCorner1(null); setRectCorner2(null); setSketchPoints([]); }}
          >
            <Square size={13} />Rectangle
          </button>
        </div>

        <div className="draw-info">
          <span className="pulse-dot" />
          <span className="draw-info-text">
            {mode === 'polygon'
              ? (points.length === 0
                  ? 'Click anywhere on map for Corner 1'
                  : points.length < 3
                    ? `Corner ${points.length} placed! Click for Corner ${points.length + 1}`
                    : snapToStart
                      ? '✨ Click start point (1) to close shape!'
                      : `${points.length} corners placed • Double-click or click start point to finish`)
              : mode === 'sketch'
                ? (isSketching ? 'Drawing sketch… release mouse to finish site' : 'Hold mouse down & drag to sketch boundary')
                : (rectCorner1 ? 'Click opposite corner or drag to complete box' : 'Click corner 1 or drag across map')}
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
