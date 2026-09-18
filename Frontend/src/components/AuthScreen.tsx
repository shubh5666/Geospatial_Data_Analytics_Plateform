import { useState, type FormEvent } from 'react';
import { ArrowUpRight, ArrowRight, Eye, EyeOff, Leaf, ShieldCheck, LoaderCircle } from 'lucide-react';
import { api, messageOf, session } from '../api';
import type { Token, User } from '../types';
import { Brand } from './Brand';

export function AuthScreen({ onAuth, notice }: { onAuth: (user: User) => void; notice: string }) {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (busy) return;
    const fields = new FormData(event.currentTarget);
    const email = String(fields.get('email')), password = String(fields.get('password'));
    setBusy(true); setError('');
    let registered = false;
    try {
      if (mode === 'register') {
        await api('/auth/register', { method: 'POST', body: JSON.stringify({ email, password, full_name: fields.get('full_name') }) });
        registered = true;
      }
      const token = await api<Token>('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) });
      session.set(token.access_token);
      onAuth(await api<User>('/auth/me'));
    } catch (error) {
      session.clear();
      if (registered) { setMode('login'); setError('Your account was created. Please sign in to continue.'); }
      else setError(messageOf(error));
    } finally { setBusy(false); }
  }
  return <main className="auth-layout">
    <section className="auth-story"><Brand light /><div className="auth-story-copy"><div className="eyebrow light"><span className="tiny-dot" /> INTELLIGENCE FOR A LIVING PLANET</div><h1>Your impact.<br />In perspective.</h1><p>Connect your projects to the land.<br />See the change you’re making, one site at a time.</p><div className="story-tags"><span><Leaf size={15} /> Carbon & biodiversity</span><span><ArrowUpRight size={15} /> Geospatial insights</span></div></div><div className="terrain-art" aria-hidden="true"><svg viewBox="0 0 700 500" preserveAspectRatio="xMidYMid slice"><defs><pattern id="terrain-grid" width="32" height="32" patternUnits="userSpaceOnUse"><path d="M32 0H0V32" fill="none" stroke="#bbd3af" strokeOpacity=".09" /></pattern></defs><rect width="700" height="500" fill="url(#terrain-grid)" />{Array.from({ length: 13 }, (_, i) => <path key={i} d={`M-60 ${460-i*22} C100 ${340-i*19},90 ${520-i*34},260 ${330-i*15} S440 ${190-i*13},770 ${300-i*22}`} fill="none" stroke="#cae4b3" strokeWidth="1" opacity={.1 + i * .018} />)}<path d="m204 245 125-66 115 44 32 94-130 71-126-52z" fill="#bad999" fillOpacity=".12" stroke="#c5e1a6" strokeWidth="1.7" /><path d="m204 245 142 53 98-75M346 298v90" fill="none" stroke="#c5e1a6" strokeOpacity=".6" strokeDasharray="5 5" /><circle cx="346" cy="298" r="7" fill="#d3ebae" /><circle cx="346" cy="298" r="17" fill="none" stroke="#d3ebae" strokeOpacity=".35" /></svg><span className="terrain-coordinate">11°36′ N &nbsp; 76°07′ E</span></div><footer>Built for people restoring our planet.<span>EST. 2026</span></footer></section>
    <section className="auth-form-side"><div className="auth-mobile-brand"><Brand /></div><div className="auth-form-content"><div className="eyebrow">YOUR FIELD OF POSSIBILITY</div><h2>{mode === 'login' ? 'Welcome back.' : 'Make room for impact.'}</h2><p className="muted">{mode === 'login' ? 'Sign in to your environmental workspace.' : 'Create your account. Start with a project.'}</p><div className="auth-tabs" role="tablist" aria-label="Account access"><button role="tab" aria-selected={mode === 'login'} disabled={busy} onClick={() => { setMode('login'); setError(''); }}>Sign in</button><button role="tab" aria-selected={mode === 'register'} disabled={busy} onClick={() => { setMode('register'); setError(''); }}>Create account</button></div>
      {notice && !error && <div className="notice" role="status">{notice}</div>}{error && <div className="error" role="alert">{error}</div>}
      <form onSubmit={submit}>
        {mode === 'register' && <label>Full name<input name="full_name" autoComplete="name" placeholder="Your full name" maxLength={100} required disabled={busy} /></label>}
        <label>Email address<input name="email" type="email" autoComplete="email" placeholder="you@organization.com" maxLength={254} required disabled={busy} /></label>
        <label>Password<div className="password-field"><input name="password" type={showPassword ? 'text' : 'password'} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} placeholder={mode === 'register' ? 'At least 8 characters' : 'Enter your password'} minLength={mode === 'register' ? 8 : 1} maxLength={128} required disabled={busy} /><button type="button" aria-label={showPassword ? 'Hide password' : 'Show password'} onClick={() => setShowPassword(!showPassword)}>{showPassword ? <EyeOff size={18} /> : <Eye size={18} />}</button></div></label>
        <button className="button primary auth-submit" disabled={busy}>{busy ? <><LoaderCircle size={18} className="spin" /> Please wait</> : <>{mode === 'login' ? 'Sign in to workspace' : 'Create your account'}<ArrowRight size={18} /></>}</button>
      </form><div className="auth-security"><ShieldCheck size={16} /><span>Your projects are private to your account.</span></div></div><footer className="auth-footer">Darukaa.Earth <span>See the land. Understand the change.</span></footer></section>
  </main>;
}
