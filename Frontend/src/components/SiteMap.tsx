import { lazy, Suspense, useState } from 'react';
import { Check, Crosshair, LocateFixed, MapPin, Minus, Plus, Undo2, X } from 'lucide-react';
import type { Polygon, Site } from '../types';
import { closePolygon, coordinateAt, siteBounds, type Bounds } from '../geo';

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
  const [points, setPoints] = useState<number[][]>([]);
  const [centerOpen, setCenterOpen] = useState(false);
  const [longitude, setLongitude] = useState(((bounds[0] + bounds[2]) / 2).toFixed(4));
  const [latitude, setLatitude] = useState(((bounds[1] + bounds[3]) / 2).toFixed(4));
  const [centerError, setCenterError] = useState('');
  const x = (value: number) => (value - bounds[0]) / (bounds[2] - bounds[0]) * 1000;
  const y = (value: number) => (bounds[3] - value) / (bounds[3] - bounds[1]) * 600;
  function viewport(lon: number, lat: number, factor: number) {
    const width = Math.min(360, Math.max(0.00001, (bounds[2] - bounds[0]) * factor));
    const height = Math.min(180, Math.max(0.00001, (bounds[3] - bounds[1]) * factor));
    const left = Math.max(-180, Math.min(180 - width, lon - width / 2));
    const bottom = Math.max(-90, Math.min(90 - height, lat - height / 2));
    setBounds([left, bottom, left + width, bottom + height]);
  }
  function zoom(factor: number) { viewport((bounds[0] + bounds[2]) / 2, (bounds[1] + bounds[3]) / 2, factor); }
  return <div className={`coordinate-map ${drawing ? 'is-drawing' : ''}`}>
    <div className="map-mode"><span className="tiny-dot" />Coordinate workspace<span className="map-mode-detail">No basemap</span></div>
    <svg className="coordinate-surface" data-testid="coordinate-map" role="img" aria-label="Site boundaries on a longitude and latitude grid" viewBox="0 0 1000 600" preserveAspectRatio="none" onClick={(event) => {
      if (!drawing) return;
      const rect = event.currentTarget.getBoundingClientRect();
      setPoints((previous) => [...previous, coordinateAt((event.clientX - rect.left) / rect.width, (event.clientY - rect.top) / rect.height, bounds)]);
    }}>
      <defs><pattern id="map-grid-small" width="50" height="50" patternUnits="userSpaceOnUse"><path d="M 50 0 L 0 0 0 50" fill="none" stroke="#dce3d6" strokeWidth=".8" /></pattern><pattern id="map-grid-large" width="250" height="150" patternUnits="userSpaceOnUse"><rect width="250" height="150" fill="url(#map-grid-small)" /><path d="M 250 0 L 0 0 0 150" fill="none" stroke="#ced8c7" strokeWidth="1" /></pattern></defs><rect width="1000" height="600" fill="url(#map-grid-large)" />
      {sites.map((site, index) => {
        return <g key={site.id} className="site-polygon" onClick={(event) => { if (!drawing) { event.stopPropagation(); onSelect(site.id); } }}><path d={site.boundary.coordinates.map((ring) => ring.map((p, i) => `${i ? 'L' : 'M'} ${x(p[0])} ${y(p[1])}`).join(' ') + 'Z').join(' ')} fill={selectedId === site.id ? '#80ae64' : ['#94b898', '#8fafad', '#a9b981'][index % 3]} fillOpacity={selectedId === site.id ? '.4' : '.24'} stroke={selectedId === site.id ? '#315f36' : '#738b70'} strokeWidth={selectedId === site.id ? 2.5 : 1.5} fillRule="evenodd" vectorEffect="non-scaling-stroke" /></g>;
      })}
      {drawing && points.length > 0 && <g><polyline points={points.map((p) => `${x(p[0])},${y(p[1])}`).join(' ')} fill="#97b77e" fillOpacity=".2" stroke="#224c37" strokeWidth="2" strokeDasharray="6 4" />{points.map((p, i) => <circle key={i} cx={x(p[0])} cy={y(p[1])} r="5" fill="#fff" stroke="#224c37" strokeWidth="2" />)}</g>}
    </svg>
    {Array.from({ length: 4 }, (_, i) => <div key={i} className="map-axis"><span className="longitude-label" style={{ left: `${i * 25 + 1}%` }}>{(bounds[0] + (bounds[2] - bounds[0]) * i / 4).toFixed(3)}°</span><span className="latitude-label" style={{ top: `${i * 25 + 12.5}%` }}>{(bounds[3] - (bounds[3] - bounds[1]) * (i / 4 + .125)).toFixed(3)}°</span></div>)}
    {!drawing && sites.map((site, index) => {
      const ring = site.boundary.coordinates[0].slice(0, -1);
      const left = ring.reduce((sum, p) => sum + x(p[0]), 0) / ring.length / 10;
      const top = ring.reduce((sum, p) => sum + y(p[1]), 0) / ring.length / 6;
      return <button key={site.id} className={`map-site-marker ${selectedId === site.id ? 'selected' : ''}`} style={{ left: `${left}%`, top: `${top}%` }} aria-label={`Select site ${site.name}`} onClick={() => onSelect(site.id)}>{String(index + 1).padStart(2, '0')}</button>;
    })}
    {!sites.length && !drawing && <div className="map-empty"><MapPin size={24} /><strong>Your sites belong here.</strong><span>Draw a boundary to put your project on the map.</span></div>}
    <div className="map-controls"><button aria-label="Zoom in" title="Zoom in" onClick={() => zoom(.65)}><Plus size={18} /></button><button aria-label="Zoom out" title="Zoom out" onClick={() => zoom(1.5)}><Minus size={18} /></button><button aria-label="Fit all sites" title="Fit all sites" onClick={() => setBounds(siteBounds(sites))}><LocateFixed size={18} /></button><button aria-label="Set map center" title="Set map center" onClick={() => { setCenterOpen(!centerOpen); setCenterError(''); }}><Crosshair size={18} /></button></div>
    <div className="map-north">N<span>↑</span></div>
    {centerOpen && <form className="map-center-form" onSubmit={(event) => {
      event.preventDefault(); const lon = Number(longitude), lat = Number(latitude);
      if (!longitude.trim() || !latitude.trim() || !Number.isFinite(lon) || !Number.isFinite(lat) || Math.abs(lon) > 180 || Math.abs(lat) > 90) { setCenterError('Enter valid longitude and latitude.'); return; }
      viewport(lon, lat, 1); setCenterOpen(false);
    }}><strong>Go to coordinates</strong><label>Longitude<input type="number" step="any" min={-180} max={180} required value={longitude} onChange={(e) => setLongitude(e.target.value)} /></label><label>Latitude<input type="number" step="any" min={-90} max={90} required value={latitude} onChange={(e) => setLatitude(e.target.value)} /></label>{centerError && <p role="alert">{centerError}</p>}<button className="button primary small-button">Go to location</button></form>}
    {drawing ? <div className="draw-toolbar"><span><span className="pulse-dot" />{points.length ? `${points.length} points added` : 'Click the map to add boundary points'}</span><button className="icon-button" aria-label="Undo last point" disabled={!points.length} onClick={() => setPoints((p) => p.slice(0, -1))}><Undo2 size={17} /></button><button className="button primary small-button" disabled={points.length < 3} onClick={() => { onBoundary(closePolygon(points)); setPoints([]); }}><Check size={15} />Finish boundary</button><button className="icon-button" aria-label="Cancel drawing" onClick={() => { setPoints([]); onCancel(); }}><X size={18} /></button></div> : <div className="map-legend"><span><i />Site boundary</span><span>WGS 84 · Longitude / latitude</span></div>}
  </div>;
}
