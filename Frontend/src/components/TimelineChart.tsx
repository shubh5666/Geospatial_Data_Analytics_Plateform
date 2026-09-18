import { useState } from 'react';
import { Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Filler, Legend } from 'chart.js';
import { Line } from 'react-chartjs-2';
import { ArrowUpRight, ChartNoAxesCombined } from 'lucide-react';
import type { Measurement, Site } from '../types';
import { number, shortDate } from '../geo';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Filler, Legend);

export function TimelineChart({ site, measurements, loading }: { site: Site | undefined; measurements: Measurement[]; loading: boolean }) {
  const [metric, setMetric] = useState<'carbon_tonnes_co2e' | 'biodiversity_score'>('carbon_tonnes_co2e');
  const [months, setMonths] = useState(12);
  const points = measurements.slice(-months);
  const values = points.map((m) => m[metric]);
  const first = values[0], last = values.at(-1);
  const change = first && last != null ? ((last - first) / first) * 100 : null;
  const isCarbon = metric === 'carbon_tonnes_co2e';
  const isMock = measurements.some((m) => m.is_mock);
  return <section className="panel analytics-panel"><header className="panel-header"><div><div className="eyebrow">CHANGE OVER TIME</div><h2>Site performance {isMock && <span className="sample-badge">Synthetic data</span>}</h2></div><label className="period-selector"><span className="sr-only">Chart period</span><select value={months} onChange={(e) => setMonths(Number(e.target.value))}><option value={12}>Last 12 readings</option><option value={6}>Last 6 readings</option></select></label></header>
    <div className="analytics-layout"><div className="analytics-summary"><p className="muted">{site?.name ?? 'Choose a site'}</p><div className="metric-switch" role="group" aria-label="Chart metric"><button aria-pressed={isCarbon} onClick={() => setMetric('carbon_tonnes_co2e')}>Carbon</button><button aria-pressed={!isCarbon} onClick={() => setMetric('biodiversity_score')}>Biodiversity</button></div><div className="chart-value">{loading ? '…' : number(last)}<small>{isCarbon ? 'tonnes CO₂e' : 'score / 100'}</small></div>{change != null && <span className={`change-label ${change < 0 ? 'negative' : ''}`}><ArrowUpRight size={15} />{change >= 0 ? '+' : ''}{number(change)}%<small>over selected period</small></span>}<p className="chart-explanation">{isMock ? 'Illustrative values to explore the platform. Not measured environmental outcomes.' : 'Values from recorded site measurements. New sites start without analytics.'}</p></div>
      <div className="chart-area">{loading ? <div className="chart-empty">Loading measurements…</div> : !points.length ? <div className="chart-empty"><ChartNoAxesCombined size={28} /><strong>{site ? 'A new story is taking shape.' : 'Select a site to see its story.'}</strong><span>{site ? 'No measurements have been recorded for this site yet.' : 'Your site’s timeline will appear here.'}</span></div> : <Line aria-label={`${isCarbon ? 'Carbon' : 'Biodiversity'} history for ${site?.name}`} role="img" data={{ labels: points.map((m) => shortDate(m.recorded_on)), datasets: [{ label: isCarbon ? 'Carbon (tonnes CO₂e)' : 'Biodiversity score', data: values, borderColor: '#527b46', backgroundColor: 'rgba(137, 173, 111, .13)', borderWidth: 2, pointRadius: 3, pointHoverRadius: 6, pointBackgroundColor: '#fff', pointBorderWidth: 2, tension: .32, fill: true }] }} options={{ animation: false, responsive: true, maintainAspectRatio: false, interaction: { intersect: false, mode: 'index' }, plugins: { legend: { display: false }, tooltip: { backgroundColor: '#183f32', padding: 12, displayColors: false } }, scales: { x: { grid: { display: false }, border: { display: false }, ticks: { color: '#8a9287', maxTicksLimit: 6, font: { size: 11 } } }, y: { min: 0, ...(isCarbon ? {} : { max: 100 }), border: { display: false }, grid: { color: '#eef0e9' }, ticks: { color: '#8a9287', maxTicksLimit: 5, font: { size: 11 } } } } }} />}</div>
    </div>{points.length > 0 && <footer className="chart-footer"><span><span className="tiny-dot" />{isCarbon ? 'Carbon stored' : 'Illustrative biodiversity score'}</span><span>{shortDate(points[0].recorded_on)} — {shortDate(points[points.length - 1].recorded_on)}</span></footer>}
  </section>;
}
