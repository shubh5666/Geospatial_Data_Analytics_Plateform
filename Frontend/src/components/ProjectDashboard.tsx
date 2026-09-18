import { useEffect, useState } from 'react';
import { ArrowDownToLine, ArrowUpRight, CalendarDays, ChevronRight, CodeXml, FolderOpen, Leaf, LoaderCircle, MapPin, Plus, Scan, Sprout, Trees } from 'lucide-react';
import { allPages, api, messageOf } from '../api';
import { exportSites, number, readPolygon, shortDate } from '../geo';
import type { Measurement, Polygon, Project, Site, Summary } from '../types';
import { Dialog } from './Dialog';
import { SiteMap } from './SiteMap';
import { TimelineChart } from './TimelineChart';

export function ProjectDashboard({ project, view, onViewMap }: { project: Project; view: 'overview' | 'sites'; onViewMap: () => void }) {
  const [sites, setSites] = useState<Site[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [version, setVersion] = useState(0);
  const [drawing, setDrawing] = useState(false);
  const [draft, setDraft] = useState<Polygon | null>(null);
  const [siteDialog, setSiteDialog] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [savedMessage, setSavedMessage] = useState('');
  const [measurements, setMeasurements] = useState<Measurement[]>([]);
  const [chartLoading, setChartLoading] = useState(false);
  const [chartError, setChartError] = useState('');
  const [chartVersion, setChartVersion] = useState(0);
  const selected = sites.find((site) => site.id === selectedId);
  useEffect(() => {
    const controller = new AbortController(); setLoading(true); setError('');
    Promise.all([allPages<Site>(`/projects/${project.id}/sites`, controller.signal), api<Summary>(`/projects/${project.id}/summary`, { signal: controller.signal })])
      .then(([sites, summary]) => {
        if (controller.signal.aborted) return;
        setSites(sites); setSummary(summary); setSelectedId((id) => sites.some((s) => s.id === id) ? id : sites[0]?.id ?? null);
      }).catch((error) => { if (!controller.signal.aborted) setError(messageOf(error)); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [project.id, version]);
  useEffect(() => {
    const controller = new AbortController(); setMeasurements([]); setChartError('');
    if (!selectedId) { setChartLoading(false); return; }
    setChartLoading(true);
    api<{ site_id: string; measurements: Measurement[] }>(`/sites/${selectedId}/measurements`, { signal: controller.signal })
      .then((data) => { if (!controller.signal.aborted) setMeasurements(data.measurements); })
      .catch((error) => { if (!controller.signal.aborted) setChartError(messageOf(error)); })
      .finally(() => { if (!controller.signal.aborted) setChartLoading(false); });
    return () => controller.abort();
  }, [selectedId, chartVersion]);
  function openGeoJSON() { setDrawing(false); setDraft(null); setSaveError(''); setSiteDialog(true); }
  return <>
    <section className="project-banner"><div className="project-banner-icon"><FolderOpen size={24} /></div><div className="project-banner-copy"><div className="project-title-line"><h2>{project.name}</h2>{project.is_demo && <span className="sample-badge">Sample project</span>}</div><p>{project.description || 'Your environmental work, connected to the land.'}</p></div><button className="button secondary export-button" disabled={!sites.length || loading || !!error} onClick={() => exportSites(sites, project.name)}><ArrowDownToLine size={16} />Export sites</button></section>
    {savedMessage && <div className="success-notice" role="status">{savedMessage}</div>}
    {error ? <div className="error" role="alert">{error}<button className="text-button" onClick={() => setVersion((v) => v + 1)}>Try again</button></div> : loading ? <div className="loading-panel"><LoaderCircle className="spin" />Bringing your sites into view…</div> : <>
      <div className="metrics-grid">
        <Metric icon={<Scan size={19} />} label="Project area" value={number(summary?.area_hectares)} unit="ha" detail="Across mapped boundaries" />
        <Metric icon={<MapPin size={19} />} label="Mapped sites" value={number(summary?.site_count, 0)} detail="Connected to this project" />
        <Metric icon={<Trees size={19} />} label="Carbon stored" value={number(summary?.carbon_tonnes_co2e)} unit="tCO₂e" detail={summary?.has_mock_data ? 'Latest synthetic measurements' : 'Latest available measurements'} />
        <Metric icon={<Sprout size={19} />} label="Biodiversity" value={number(summary?.biodiversity_score)} unit="/ 100" detail={summary?.has_mock_data ? 'Illustrative average score' : 'Average of latest readings'} />
      </div>
      {view === 'overview' ? <div className="map-and-sites"><section className="panel map-panel"><header className="panel-header"><div><h2>Explore your sites</h2><p>One landscape. Many possibilities.</p></div><div className="map-header-actions"><button className="icon-button" aria-label="Add site using GeoJSON" title="Add site using GeoJSON" onClick={openGeoJSON}><CodeXml size={18} /></button><button className="button primary small-button" disabled={drawing} onClick={() => { setDrawing(true); setSavedMessage(''); }}><Plus size={15} />Draw site</button></div></header><SiteMap sites={sites} selectedId={selectedId} onSelect={setSelectedId} drawing={drawing} onCancel={() => setDrawing(false)} onBoundary={(polygon) => { setDraft(polygon); setDrawing(false); setSaveError(''); setSiteDialog(true); }} /></section>
        <aside className="panel site-list-panel"><header className="panel-header"><h2>Project sites <span className="count-badge">{sites.length}</span></h2><span className="list-caption">SELECT TO EXPLORE</span></header><div className="site-list">{sites.length ? sites.map((site, index) => <button key={site.id} className={`site-list-item ${selectedId === site.id ? 'selected' : ''}`} onClick={() => setSelectedId(site.id)}><span className="site-index">{String(index + 1).padStart(2, '0')}</span><div><strong>{site.name}</strong><small>{number(site.area_hectares)} hectares <span>·</span> Polygon site</small></div><ChevronRight size={16} /></button>) : <div className="site-list-empty"><MapPin size={23} /><p>No sites yet.</p><span>Draw your first boundary<br />to get started.</span><button className="text-button" onClick={openGeoJSON}>Add with GeoJSON <ArrowUpRight size={13} /></button></div>}</div>{selected && <div className="selected-site-note"><div className="eyebrow">SELECTED SITE</div><strong>{selected.name}</strong><span><CalendarDays size={13} />Added {shortDate(selected.created_at)}</span><p>{project.is_demo ? 'Sample boundary for exploring the workspace.' : 'Your boundary is saved to this project.'}</p></div>}<footer className="site-list-footer"><Leaf size={15} />Small places. Lasting possibilities.</footer></aside>
      </div> : <section className="panel sites-table-panel"><header className="panel-header"><div><h2>Sites in this project <span className="count-badge">{sites.length}</span></h2><p>View boundaries and select a site to see its performance.</p></div><button className="button primary small-button" onClick={() => { onViewMap(); setDrawing(true); }}><Plus size={15} />Draw site</button></header>{sites.length ? <div className="table-scroll"><table><thead><tr><th>Site name</th><th>Area</th><th>Added</th><th><span className="sr-only">Actions</span></th></tr></thead><tbody>{sites.map((site) => <tr key={site.id}><td><MapPin size={16} />{site.name}</td><td>{number(site.area_hectares)} ha</td><td>{shortDate(site.created_at)}</td><td><button className="text-button" onClick={() => { setSelectedId(site.id); onViewMap(); }}>View on map <ArrowUpRight size={14} /></button></td></tr>)}</tbody></table></div> : <div className="site-list-empty"><MapPin size={28} /><h3>Your first site starts here.</h3><p>Draw a boundary or add coordinates to start.</p><button className="button secondary" onClick={openGeoJSON}>Add with GeoJSON</button></div>}</section>}
      {chartError && <div className="error" role="alert">{chartError}<button className="text-button" onClick={() => setChartVersion((v) => v + 1)}>Retry measurements</button></div>}
      <TimelineChart site={selected} measurements={measurements} loading={chartLoading} />
    </>}
    {siteDialog && <Dialog title={draft ? 'Give this place a name.' : 'Add a site with GeoJSON'} busy={saving} onClose={() => { setSiteDialog(false); setDraft(null); }}><p className="muted">{draft ? `Your boundary has ${draft.coordinates[0].length - 1} points. Save it to ${project.name}.` : 'Paste a Polygon geometry with [longitude, latitude] coordinates.'}</p>{saveError && <div className="error" role="alert">{saveError}</div>}<form onSubmit={async (event) => {
      event.preventDefault(); if (saving) return;
      const form = new FormData(event.currentTarget); setSaving(true); setSaveError('');
      try {
        const boundary = draft ?? readPolygon(String(form.get('boundary')));
        const site = await api<Site>(`/projects/${project.id}/sites`, { method: 'POST', body: JSON.stringify({ name: form.get('name'), boundary }) });
        setSelectedId(site.id); setSiteDialog(false); setDraft(null); setSavedMessage(`${site.name} has been saved to your project.`); setVersion((v) => v + 1);
      } catch (error) { setSaveError(messageOf(error)); } finally { setSaving(false); }
    }}><label>Site name<input name="name" autoFocus required maxLength={160} placeholder="e.g. Riparian restoration site" disabled={saving} /></label>{!draft && <label>GeoJSON polygon<textarea name="boundary" className="code-input" rows={7} required disabled={saving} placeholder={'{"type":"Polygon","coordinates":[[[77,28],[77.01,28],[77.01,28.01],[77,28.01],[77,28]]]}'} /></label>}<div className="dialog-actions"><button type="button" className="button secondary" disabled={saving} onClick={() => { setSiteDialog(false); setDraft(null); }}>Cancel</button><button className="button primary" disabled={saving}>{saving ? 'Saving site…' : 'Save site'}<ArrowUpRight size={16} /></button></div></form></Dialog>}
  </>;
}

function Metric({ icon, label, value, unit, detail }: { icon: React.ReactNode; label: string; value: string; unit?: string; detail: string }) {
  return <section className="metric-card"><div className="metric-label">{label}<span>{icon}</span></div><div className="metric-value">{value}<small>{unit}</small></div><p>{detail}</p></section>;
}
