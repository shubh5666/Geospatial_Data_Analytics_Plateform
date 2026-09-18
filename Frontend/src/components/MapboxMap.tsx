import { useEffect, useRef, useState } from 'react';
import mapboxgl, { type GeoJSONSource } from 'mapbox-gl';
import MapboxDraw from '@mapbox/mapbox-gl-draw';
import type { Feature, Polygon } from 'geojson';
import { X } from 'lucide-react';
import { siteBounds } from '../geo';
import type { MapProps } from './SiteMap';
import 'mapbox-gl/dist/mapbox-gl.css';
import '@mapbox/mapbox-gl-draw/dist/mapbox-gl-draw.css';

export default function MapboxMap(props: MapProps & { token: string; onFallback: () => void }) {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const draw = useRef<MapboxDraw | null>(null);
  const latest = useRef(props); latest.current = props;
  const [mapError, setMapError] = useState(false);
  const [ready, setReady] = useState(false);
  const [satellite, setSatellite] = useState(false);
  useEffect(() => {
    if (!container.current) return;
    let instance: mapboxgl.Map;
    try {
      instance = new mapboxgl.Map({ container: container.current, accessToken: props.token,
        style: 'mapbox://styles/mapbox/outdoors-v12', bounds: siteBounds(latest.current.sites),
        fitBoundsOptions: { padding: 60, maxZoom: 15 }, attributionControl: true,
      });
    } catch { setMapError(true); return; }
    map.current = instance;
    const drawing = new MapboxDraw({ displayControlsDefault: false, controls: {}, defaultMode: 'simple_select' });
    draw.current = drawing; instance.addControl(drawing); instance.addControl(new mapboxgl.NavigationControl(), 'top-right');
    function synchronize() {
      if (!instance.isStyleLoaded()) return;
      const features = latest.current.sites.map((site) => ({ type: 'Feature' as const, id: site.id, geometry: site.boundary, properties: { id: site.id, name: site.name } }));
      const data = { type: 'FeatureCollection' as const, features };
      if (!instance.getSource('sites')) {
        instance.addSource('sites', { type: 'geojson', data });
        instance.addLayer({ id: 'site-fill', type: 'fill', source: 'sites', paint: { 'fill-color': '#82ab66', 'fill-opacity': .38 } });
        instance.addLayer({ id: 'site-outline', type: 'line', source: 'sites', paint: { 'line-color': '#285936', 'line-width': 2 } });
      } else (instance.getSource('sites') as GeoJSONSource).setData(data);
      instance.setPaintProperty('site-fill', 'fill-opacity', ['case', ['==', ['get', 'id'], latest.current.selectedId ?? ''], .6, .25]);
      setReady(true);
    }
    instance.on('style.load', synchronize);
    instance.on('error', () => setMapError(true));
    instance.on('click', 'site-fill', (event) => {
      const id = event.features?.[0]?.properties?.id;
      if (typeof id === 'string' && !latest.current.drawing) latest.current.onSelect(id);
    });
    instance.on('mouseenter', 'site-fill', () => { if (!latest.current.drawing) instance.getCanvas().style.cursor = 'pointer'; });
    instance.on('mouseleave', 'site-fill', () => { instance.getCanvas().style.cursor = ''; });
    instance.on('draw.create', (event: unknown) => {
      const feature = (event as { features: Feature[] }).features[0];
      if (feature?.geometry.type === 'Polygon') {
        latest.current.onBoundary(feature.geometry as Polygon); drawing.deleteAll();
      }
    });
    const observer = new ResizeObserver(() => instance.resize()); observer.observe(container.current);
    return () => { observer.disconnect(); instance.remove(); map.current = null; draw.current = null; };
  }, [props.token]);
  useEffect(() => {
    const instance = map.current;
    if (!ready || !instance?.getSource('sites')) return;
    (instance.getSource('sites') as GeoJSONSource).setData({ type: 'FeatureCollection', features: props.sites.map((site) => ({ type: 'Feature', id: site.id, geometry: site.boundary, properties: { id: site.id, name: site.name } })) });
    instance.setPaintProperty('site-fill', 'fill-opacity', ['case', ['==', ['get', 'id'], props.selectedId ?? ''], .6, .25]);
  }, [props.sites, props.selectedId, ready]);
  useEffect(() => {
    if (!ready || !draw.current) return;
    if (props.drawing) draw.current.changeMode('draw_polygon');
    else { draw.current.changeMode('simple_select'); draw.current.deleteAll(); }
  }, [props.drawing, ready]);
  return <div className="mapbox-wrapper"><div className="mapbox-container" ref={container} />
    {mapError && <div className="map-error" role="status">Map background unavailable.<button className="text-button" onClick={props.onFallback}>Use coordinate workspace</button></div>}
    <button className="basemap-toggle" disabled={props.drawing} onClick={() => { setReady(false); map.current?.setStyle(satellite ? 'mapbox://styles/mapbox/outdoors-v12' : 'mapbox://styles/mapbox/satellite-streets-v12'); setSatellite(!satellite); }}>{satellite ? 'Outdoors view' : 'Satellite view'}</button>
    {props.drawing && <div className="draw-toolbar"><span>Click to draw. Click the first point to finish.</span><button className="icon-button" aria-label="Cancel drawing" onClick={props.onCancel}><X size={18} /></button></div>}
  </div>;
}
