export function Brand({ light = false }: { light?: boolean }) {
  return <div className={`brand ${light ? 'brand-light' : ''}`}><svg width="36" height="36" viewBox="0 0 48 48" aria-hidden="true"><rect width="48" height="48" rx="13" fill="currentColor" /><g fill="none" stroke={light ? '#173e32' : '#d2ebac'} strokeWidth="2"><path d="M13 32V20l11-7 11 7v12l-11 6z" /><path d="m13 20 11 7 11-7M24 27v11M18 17l12 7" /></g></svg><span>darukaa<span className="brand-earth">.earth</span></span></div>;
}
