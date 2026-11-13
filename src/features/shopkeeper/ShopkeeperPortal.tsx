import { Component, Suspense, lazy, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { NavLink, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { Activity, ArrowUpRight, BarChart3, CheckCheck, ChevronRight, FlaskConical, GraduationCap, Home, LayoutDashboard, LogOut, Menu, Moon, Printer, QrCode, Settings, ShieldCheck, Sparkles, Sun, WifiOff, Workflow, X, Zap } from 'lucide-react';
import type { ShopkeeperService } from './types';
import { PortalProvider, usePortal } from './PortalContext';
import { useOptionalAuth } from '../auth/AuthContext';
import { translate } from './i18n/dictionary';
import './styles.css';
const Dashboard=lazy(()=>import('./pages/Dashboard'));
const Queue=lazy(()=>import('./jobs/QueuePage'));
const Urgent=lazy(()=>import('./urgent/UrgentPage'));
const Optimization=lazy(()=>import('./optimization/OptimizationPage'));
const Simulator=lazy(()=>import('./simulation/SimulatorPage'));
const Printers=lazy(()=>import('./printers/PrintersPage'));
const Pickup=lazy(()=>import('./qr/PickupPage'));
const Completed=lazy(()=>import('./receipts/CompletedPage'));
const Analytics=lazy(()=>import('./analytics/AnalyticsPage'));
const SettingsPage=lazy(()=>import('./pages/SettingsPage'));
const Showcase=lazy(()=>import('./showcase/Showcase'));
const navigation=[{path:'',label:'Dashboard',icon:LayoutDashboard},{path:'queue',label:'Print Queue',icon:Workflow},{path:'urgent',label:'Urgent Requests',icon:Zap},{path:'optimization',label:'Smart Optimization',icon:Sparkles},{path:'simulator',label:'Queue Simulator',icon:FlaskConical},{path:'printers',label:'Printer Management',icon:Printer},{path:'pickup',label:'QR Verification',icon:QrCode},{path:'completed',label:'Completed Orders',icon:CheckCheck},{path:'analytics',label:'Analytics and EcoPrint',icon:BarChart3},{path:'settings',label:'Settings',icon:Settings}];
class PortalErrorBoundary extends Component<{children:ReactNode},{failed:boolean}> {
 state={failed:false};
 static getDerivedStateFromError(){return {failed:true};}
 render(){
  if(!this.state.failed)return this.props.children;
  const lang=document.documentElement.lang;
  const language=lang==='hi'||lang==='kn'?lang:'en';
  return <main className="startup"><h1>PrintQ</h1><p role="alert">{translate('Unexpected application error',language)}</p><button className="button primary" onClick={()=>window.location.reload()}>{translate('Reload page',language)}</button></main>;
 }
}
function Shell() {
 const { snapshot, connectionError, t, language, setLanguage, theme, setTheme } = usePortal();
 const auth = useOptionalAuth();
 const [open, setOpen] = useState(false);
 const [narrow, setNarrow] = useState(() => window.matchMedia('(max-width: 800px)').matches);
 const menuRef = useRef<HTMLButtonElement>(null);
 const sidebarRef = useRef<HTMLElement>(null);
 const location = useLocation();
 const urgent = snapshot.jobs.filter(job => job.urgentRequestStatus === 'pending' && job.status === 'queued').length;
 const queued = snapshot.jobs.filter(job => job.status === 'queued').length;
 const active = navigation.find(item => location.pathname.replace(/\/$/, '') === `/shopkeeper${item.path ? `/${item.path}` : ''}`);
 const routeName = t(active?.label ?? 'Entry showcase');
 const mobileOpen = narrow && open;

 useEffect(() => {
  const previousTitle = document.title;
  return () => { document.title = previousTitle; };
 }, []);
 useEffect(() => { document.title = `PrintQ Shopkeeper · ${routeName}`; }, [routeName]);
 useEffect(() => {
  setOpen(false);
  window.scrollTo(0, 0);
  document.getElementById('main-content')?.focus({ preventScroll: true });
 }, [location.pathname]);
 useEffect(() => {
  const query = window.matchMedia('(max-width: 800px)');
  const change = () => { setNarrow(query.matches); setOpen(false); };
  query.addEventListener('change', change);
  return () => query.removeEventListener('change', change);
 }, []);
 useEffect(() => {
  if (!mobileOpen) return;
  const sidebar = sidebarRef.current;
  const previousOverflow = document.body.style.overflow;
  document.body.style.overflow = 'hidden';
  sidebar?.querySelector<HTMLButtonElement>('.mobile-close')?.focus();
  const handleKey = (event: KeyboardEvent) => {
   if (event.key === 'Escape') {
    event.preventDefault();
    setOpen(false);
   }
   if (event.key !== 'Tab' || !sidebar) return;
   const controls = sidebar.querySelectorAll<HTMLElement>('a[href], button:not([disabled])');
   const first = controls[0];
   const last = controls[controls.length - 1];
   if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last?.focus();
   } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first?.focus();
   }
  };
  window.addEventListener('keydown', handleKey);
  return () => {
   window.removeEventListener('keydown', handleKey);
   document.body.style.overflow = previousOverflow;
   menuRef.current?.focus();
  };
 }, [mobileOpen]);

 return <div className="portal-layout">
  <a href="#main-content" className="skip-link">{t('Skip to content')}</a>
  {mobileOpen && <button className="nav-backdrop" tabIndex={-1} aria-label={t('Close navigation')} onClick={() => setOpen(false)} />}
  <aside ref={sidebarRef} id="portal-navigation" className={`sidebar ${mobileOpen ? 'is-open' : ''}`} inert={narrow && !open} aria-hidden={narrow && !open} role={mobileOpen ? 'dialog' : undefined} aria-modal={mobileOpen ? true : undefined} aria-label={t('Operations')}>
   <NavLink to="/shopkeeper" className="brand" onClick={() => setOpen(false)}>
    <span className="brand-mark"><Printer size={23} aria-hidden="true" /></span>
    <span>PrintQ<span className="brand-subtitle">{t('Shopkeeper')}</span></span>
   </NavLink>
   <button className="icon-button mobile-close" aria-label={t('Close navigation')} onClick={() => setOpen(false)}><X size={20} /></button>
   <div className="shop-identity">
    <div className="shop-avatar" aria-hidden="true">{snapshot.settings.shopName.slice(0, 1)}</div>
    <div><strong>{snapshot.settings.shopName}</strong><span>{t(snapshot.mode === 'demo' ? 'Local demonstration' : 'Workspace')}</span></div>
   </div>
   <nav aria-label={t('Operations')} className="main-nav">
    {navigation.map(({ path, label, icon: Icon }, index) => <NavLink key={path} to={`/shopkeeper${path ? `/${path}` : ''}`} end={path === ''} className={({ isActive }) => `nav-item ${isActive ? 'active' : ''} ${index === 5 ? 'nav-break' : ''}`}>
     <Icon size={19} aria-hidden="true" /><span>{t(label)}</span>
     {path === 'queue' && <span className="nav-count">{queued}</span>}
     {path === 'urgent' && urgent > 0 && <span className="nav-count urgent-count">{urgent}</span>}
    </NavLink>)}
   </nav>
   <div className="sidebar-bottom">
    <a href="/" className="showcase-link"><Home size={17} aria-hidden="true" /><span>{t('PrintQ home')}</span></a>
    <a href="/student" className="showcase-link"><GraduationCap size={17} aria-hidden="true" /><span>Student Portal</span></a>
    <NavLink to="/shopkeeper/showcase" className="showcase-link"><span>{t('Entry showcase')}</span><ArrowUpRight size={17} aria-hidden="true" /></NavLink>
    {auth ? (
     <div className="local-note" style={{ flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
       <ShieldCheck size={16} aria-hidden="true" />
       <span>{auth.runtime?.mode === 'demo' ? 'Demo · Shopkeeper' : (auth.session?.user.name ?? auth.session?.user.email ?? 'Signed in')}</span>
      </div>
      <button
       type="button"
       className="showcase-link"
       style={{ background: 'none', border: 0, padding: 0, width: '100%', textAlign: 'left', color: '#fff', fontWeight: 600 }}
       onClick={() => void auth.signOut()}
      >
       <LogOut size={16} aria-hidden="true" />
       <span>Sign out</span>
      </button>
     </div>
    ) : (
     <div className="local-note"><ShieldCheck size={16} aria-hidden="true" /><span>{t('Same browser only. No cross-device sync.')}</span></div>
    )}
   </div>
  </aside>
  <div className="main-layout" inert={mobileOpen}>
   <header className="topbar">
    <div className="row header-route">
     <button ref={menuRef} className="icon-button mobile-menu" aria-label={t('Open navigation')} aria-expanded={mobileOpen} aria-controls="portal-navigation" onClick={() => setOpen(true)}><Menu size={23} /></button>
     <span className="muted breadcrumb-root">{t('Workspace')}</span><ChevronRight className="breadcrumb-root" size={15} aria-hidden="true" />
     <strong className="breadcrumb-current">{routeName}</strong>
    </div>
    <div className="row header-tools">
     <span className={`printer-indicator state-${snapshot.printer.state}`}><Printer size={15} aria-hidden="true" /><i aria-hidden="true" />{t(snapshot.printer.state)}</span>
     <label className="sr-only" htmlFor="header-language">{t('Language')}</label>
     <select id="header-language" aria-label={t('Language')} value={language} onChange={event => setLanguage(event.target.value as 'en' | 'hi' | 'kn')}>
      <option value="en">English</option><option value="hi">हिन्दी</option><option value="kn">ಕನ್ನಡ</option>
     </select>
     <button className="icon-button" aria-label={t(theme === 'light' ? 'Dark theme' : 'Light theme')} onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}>{theme === 'light' ? <Moon size={19} /> : <Sun size={19} />}</button>
    </div>
   </header>
   <div className="demo-ribbon"><span><span className="demo-dot" />{t(snapshot.mode === 'demo' ? 'Demo Mode' : 'Workspace')}</span><span>{t('Fictional data · no payments processed')}</span><Activity size={15} aria-hidden="true" /></div>
   {connectionError && <div className="printer-banner" role="alert"><WifiOff size={19} aria-hidden="true" /><div><strong>Workspace connection</strong><span>{connectionError}</span></div></div>}
   {snapshot.printer.state !== 'operational' && <div className="printer-banner" role="status"><Printer size={19} aria-hidden="true" /><div><strong>{t('Printer unavailable')}</strong><span>{t('New printing is blocked. Pickup estimates may be delayed.')}</span></div><NavLink to="/shopkeeper/printers">{t('Printer Management')}</NavLink></div>}
   <main id="main-content" className="workspace" tabIndex={-1}>
    <Suspense fallback={<div className="empty" role="status">{t('Loading your workspace…')}</div>}>
     <Routes><Route index element={<Dashboard />} /><Route path="queue" element={<Queue />} /><Route path="urgent" element={<Urgent />} /><Route path="optimization" element={<Optimization />} /><Route path="simulator" element={<Simulator />} /><Route path="printers" element={<Printers />} /><Route path="pickup" element={<Pickup />} /><Route path="completed" element={<Completed />} /><Route path="analytics" element={<Analytics />} /><Route path="settings" element={<SettingsPage />} /><Route path="showcase" element={<Showcase />} /><Route path="*" element={<Navigate to="/shopkeeper" replace />} /></Routes>
    </Suspense>
   </main>
   <footer className="workspace-footer"><span>PrintQ</span><span>{t('Your printing floor, in order.')}</span><span>v1.0</span></footer>
  </div>
 </div>;
}
export function ShopkeeperPortal({service}:{service?:ShopkeeperService}){return <PortalErrorBoundary><PortalProvider service={service}><Shell/></PortalProvider></PortalErrorBoundary>;}
