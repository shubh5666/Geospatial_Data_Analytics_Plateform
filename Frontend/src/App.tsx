import { useEffect, useState } from 'react';
import { ArrowDownToLine, ArrowRight, BookOpen, ChevronRight, CircleHelp, FolderClosed, LayoutDashboard, Leaf, LoaderCircle, LogOut, Map, Menu, Plus, Search, Sparkles, X } from 'lucide-react';
import { allPages, api, messageOf, session } from './api';
import type { Project, User } from './types';
import { AuthScreen } from './components/AuthScreen';
import { Brand } from './components/Brand';
import { Dialog } from './components/Dialog';
import { ProjectDashboard } from './components/ProjectDashboard';

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [booting, setBooting] = useState(!!session.get());
  const [notice, setNotice] = useState('');
  useEffect(() => {
    const controller = new AbortController();
    if (session.get()) api<User>('/auth/me', { signal: controller.signal }).then(setUser).catch((error) => {
      if (!controller.signal.aborted) { session.clear(); setNotice(messageOf(error)); }
    }).finally(() => { if (!controller.signal.aborted) setBooting(false); });
    const expired = () => { setUser(null); setNotice('Your session has expired. Sign in to continue.'); };
    window.addEventListener('session-expired', expired);
    return () => { controller.abort(); window.removeEventListener('session-expired', expired); };
  }, []);
  if (booting) return <div className="boot-screen"><Brand /><LoaderCircle className="spin" aria-label="Opening workspace" /></div>;
  if (!user) return <AuthScreen notice={notice} onAuth={(user) => { setNotice(''); setUser(user); }} />;
  return <Workspace key={user.id} user={user} onSignOut={() => { session.clear(); setUser(null); setNotice(''); }} />;
}

function Workspace({ user, onSignOut }: { user: User; onSignOut: () => void }) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [view, setView] = useState<'overview' | 'sites'>('overview');
  const [loading, setLoading] = useState(true);
  const [loadVersion, setLoadVersion] = useState(0);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [newProject, setNewProject] = useState(false);
  const [showGuide, setShowGuide] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [saveError, setSaveError] = useState('');
  const activeProject = projects.find((project) => project.id === activeId);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError('');
    allPages<Project>('/projects', controller.signal).then((items) => {
      setProjects(items); setActiveId((id) => items.some((p) => p.id === id) ? id : items[0]?.id ?? null);
    }).catch((error) => { if (!controller.signal.aborted) setError(messageOf(error)); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [loadVersion]);
  function select(project: Project) { setActiveId(project.id); setMenuOpen(false); setView('overview'); }
  async function demo() {
    const existing = projects.find((p) => p.is_demo);
    if (existing) { select(existing); return; }
    setBusy(true); setError('');
    try {
      const project = await api<Project>('/projects/demo', { method: 'POST' });
      setProjects((items) => [...items.filter((p) => p.id !== project.id), project]); select(project);
    } catch (error) { setError(messageOf(error)); } finally { setBusy(false); }
  }
  const initials = user.full_name.split(/\s+/).map((word) => word[0]).slice(0, 2).join('').toUpperCase();
  return <div className="app-shell">
    {menuOpen && <button className="sidebar-scrim" aria-label="Close navigation" onClick={() => setMenuOpen(false)} />}
    <aside className={`sidebar ${menuOpen ? 'sidebar-open' : ''}`}><div className="sidebar-brand"><Brand /><button className="icon-button mobile-only" aria-label="Close navigation" onClick={() => setMenuOpen(false)}><X size={20} /></button></div><div className="workspace-label"><span className="workspace-avatar"><Leaf size={17} /></span><div>Environmental workspace<small>Personal workspace</small></div></div>
      <div className="nav-heading">WORKSPACE</div><nav aria-label="Main navigation"><button className={`nav-item ${view === 'overview' ? 'active' : ''}`} onClick={() => { setView('overview'); setMenuOpen(false); }}><LayoutDashboard size={18} />Overview</button><button className={`nav-item ${view === 'sites' ? 'active' : ''}`} onClick={() => { setView('sites'); setMenuOpen(false); }}><Map size={18} />Project sites</button></nav>
      <div className="nav-heading project-heading">YOUR PROJECTS <span>{projects.length}</span><button className="icon-button" aria-label="Create project" onClick={() => { setSaveError(''); setNewProject(true); }}><Plus size={16} /></button></div>
      {projects.length > 4 && <div className="project-search"><Search size={15} /><input aria-label="Search projects" placeholder="Find a project" value={query} onChange={(event) => setQuery(event.target.value)} /></div>}
      <div className="project-nav">{projects.filter((project) => project.name.toLowerCase().includes(query.toLowerCase())).map((project) => <button key={project.id} title={project.name} className={`project-nav-item ${activeId === project.id ? 'selected' : ''}`} onClick={() => select(project)}><span className="project-dot" /><span>{project.name}</span>{project.is_demo && <span className="mini-sample">SAMPLE</span>}</button>)}{!loading && !projects.length && <p className="sidebar-empty">Your next chapter starts<br />with a new project.</p>}{query && !projects.some((p) => p.name.toLowerCase().includes(query.toLowerCase())) && <p className="sidebar-empty">No matching projects.</p>}</div>
      <div className="sidebar-bottom"><div className="sample-card"><Sparkles size={19} /><h3>See what’s possible.</h3><p>Explore a sample restoration project and its insights.</p><button onClick={demo} disabled={busy || loading}>{busy ? 'Preparing sample…' : 'Explore sample workspace'}<ArrowRight size={15} /></button></div><button className="nav-item" onClick={() => setShowGuide(true)}><CircleHelp size={18} />Workspace guide</button><div className="account-row"><span className="avatar">{initials}</span><div><strong>{user.full_name}</strong><small title={user.email}>{user.email}</small></div><button className="icon-button" aria-label="Sign out" title="Sign out" onClick={onSignOut}><LogOut size={17} /></button></div></div>
    </aside>
    <div className="main-shell"><header className="topbar"><div className="breadcrumbs"><button className="icon-button mobile-only" aria-label="Open navigation" onClick={() => setMenuOpen(true)}><Menu size={22} /></button><span>Workspace</span><ChevronRight size={14} /><strong>{view === 'overview' ? 'Overview' : 'Project sites'}</strong></div><div className="topbar-right"><span className="private-label"><span className="tiny-dot" />Private workspace</span><span className="avatar small">{initials}</span></div></header>
      <main className="main-content"><div className="page-heading"><div><div className="eyebrow">THE BIG PICTURE</div><h1>{view === 'overview' ? 'Project overview' : 'Your project sites'}<span className="heading-dot">.</span></h1><p>A closer connection to your land. A clearer view of your impact.</p></div><button className="button primary" onClick={() => { setSaveError(''); setNewProject(true); }}><Plus size={17} />New project</button></div>
        {error && <div className="error" role="alert">{error}<button className="text-button" onClick={() => setLoadVersion((v) => v + 1)}>Try again</button></div>}
        {loading ? <div className="loading-panel"><LoaderCircle className="spin" />Loading your projects…</div> : activeProject ? <ProjectDashboard key={activeProject.id} project={activeProject} view={view} onViewMap={() => setView('overview')} /> : !error && <section className="empty-workspace"><div className="empty-orbit"><FolderClosed size={36} /></div><div className="eyebrow">A FRESH START</div><h2>Good things start with a place.</h2><p>Create your first project to map your sites and bring<br className="desktop-only" /> your environmental work into focus.</p><div className="empty-actions"><button className="button primary" onClick={() => { setSaveError(''); setNewProject(true); }}><Plus size={17} />Create your first project</button><button className="button secondary" disabled={busy} onClick={demo}><Sparkles size={17} />{busy ? 'Preparing sample…' : 'Explore sample data'}</button></div><div className="empty-steps"><span><span>01</span>Create a project</span><ChevronRight size={14} /><span><span>02</span>Map your sites</span><ChevronRight size={14} /><span><span>03</span>Explore your impact</span></div></section>}
        <footer className="workspace-footer"><span><Leaf size={14} />Every site tells a story.</span><span>Darukaa.Earth · Environmental intelligence</span></footer>
      </main>
    </div>
    {newProject && <Dialog title="Create a project" onClose={() => setNewProject(false)} busy={busy}><p className="muted">Give your environmental work a home. You can add sites next.</p>{saveError && <div className="error" role="alert">{saveError}</div>}<form onSubmit={async (event) => {
      event.preventDefault(); if (busy) return;
      const form = new FormData(event.currentTarget); setBusy(true); setSaveError('');
      try { const project = await api<Project>('/projects', { method: 'POST', body: JSON.stringify({ name: form.get('name'), description: form.get('description') }) }); setProjects((items) => [...items, project]); select(project); setNewProject(false); }
      catch (error) { setSaveError(messageOf(error)); } finally { setBusy(false); }
    }}><label>Project name<input name="name" placeholder="e.g. Western Ghats restoration" required maxLength={160} disabled={busy} autoFocus /></label><label>Description <span className="optional">optional</span><textarea name="description" placeholder="What are you working towards?" rows={3} maxLength={10000} disabled={busy} /></label><div className="dialog-actions"><button type="button" className="button secondary" disabled={busy} onClick={() => setNewProject(false)}>Cancel</button><button className="button primary" disabled={busy}>{busy ? 'Creating…' : 'Create project'}<ArrowRight size={16} /></button></div></form></Dialog>}
    {showGuide && <Dialog title="A little guidance. A lot of possibility." onClose={() => setShowGuide(false)}><div className="guide-step"><FolderClosed /><div><h3>Start with a project</h3><p>Group your restoration work into a project. Your account has exclusive access.</p></div></div><div className="guide-step"><Map /><div><h3>Put your sites on the map</h3><p>Choose Draw site and mark at least three points. Finish the boundary, give it a name, and save. You can also paste a GeoJSON polygon.</p></div></div><div className="guide-step"><BookOpen /><div><h3>Follow the change</h3><p>Select a site to explore its measurements. Sample workspace charts use clearly labeled synthetic data; new sites start without measurements.</p></div></div><div className="guide-step"><ArrowDownToLine /><div><h3>Take your boundaries with you</h3><p>Use Export sites to download your project’s boundaries as a GeoJSON file.</p></div></div></Dialog>}
  </div>;
}
