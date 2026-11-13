import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { usePortal } from '../PortalContext';
import { minutes } from '../components/ui';
import type { OperationsScene } from './operationsScene';

type DeviceConnection = EventTarget & { saveData?: boolean };

export default function OperationsHero() {
  const { snapshot, t } = usePortal();
  const root = useRef<HTMLElement>(null);
  const host = useRef<HTMLDivElement>(null);
  const scene = useRef<OperationsScene | null>(null);
  const [enhanced, setEnhanced] = useState(false);
  const [paused, setPaused] = useState(false);
  const pausedRef = useRef(paused);
  const available = snapshot.printer.state === 'operational';
  const availableRef = useRef(available);
  availableRef.current = available;
  pausedRef.current = paused;
  const synchronizeRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (!window.matchMedia || !window.IntersectionObserver || !window.ResizeObserver
      || (typeof WebGLRenderingContext === 'undefined' && typeof WebGL2RenderingContext === 'undefined')) return;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
    const constrained = window.matchMedia('(pointer: coarse), (max-width: 900px)');
    const device = navigator as Navigator & { deviceMemory?: number; connection?: DeviceConnection };
    let cancelled = false;
    let generation = 0;
    let failed = false;
    let requested = false;
    let cleanup: (() => void) | undefined;
    const reset = () => {
      cleanup?.();
      cleanup = undefined;
      synchronizeRef.current = null;
      scene.current?.dispose();
      scene.current = null;
      if (!cancelled) setEnhanced(false);
    };
    const fallback = () => { failed = true; ++generation; reset(); };
    const configure = async () => {
      const eligible = !failed && !reduced.matches && !constrained.matches
        && !(device.deviceMemory !== undefined && device.deviceMemory <= 4)
        && !(device.hardwareConcurrency > 0 && device.hardwareConcurrency <= 2)
        && !device.connection?.saveData;
      if (!eligible) {
        requested = false;
        ++generation;
        reset();
        return;
      }
      if (requested || document.hidden) return;
      requested = true;
      const current = ++generation;
      try {
        // Heavy graphics packages never enter the constrained/static device path.
        const [{ createOperationsScene }, { gsap }] = await Promise.all([import('./operationsScene'), import('gsap')]);
        if (cancelled || current !== generation || !host.current || !root.current) return;
        const element = root.current;
        const visual = createOperationsScene(host.current, fallback);
        scene.current = visual;
        visual.setAvailable(availableRef.current);
        visual.setPaused(pausedRef.current);
        const pointer = { x: 0, y: 0, progress: 0 };
        let visible = false;
        const active = () => visible && !document.hidden && !pausedRef.current;
        const moveX = gsap.quickTo(pointer, 'x', { duration: .35, ease: 'power2.out', onUpdate: () => visual.setPointer(pointer.x, pointer.y) });
        const moveY = gsap.quickTo(pointer, 'y', { duration: .35, ease: 'power2.out', onUpdate: () => visual.setPointer(pointer.x, pointer.y) });
        const progress = gsap.quickTo(pointer, 'progress', { duration: .3, ease: 'power2.out', onUpdate: () => visual.setProgress(pointer.progress) });
        const scroll = () => {
          if (!active()) return;
          const bounds = element.getBoundingClientRect();
          progress(Math.max(0, Math.min(1, -bounds.top / Math.max(1, bounds.height))));
        };
        const synchronize = () => {
          const running = active();
          visual.setPaused(!running);
          for (const tween of [moveX.tween, moveY.tween, progress.tween]) tween.paused(!running);
          if (running) scroll();
        };
        synchronizeRef.current = synchronize;
        const observer = new IntersectionObserver(entries => { visible = entries[0]?.isIntersecting ?? false; synchronize(); });
        observer.observe(element);
        const move = (event: PointerEvent) => {
          if (!active()) return;
          const bounds = element.getBoundingClientRect();
          moveX(Math.max(-1, Math.min(1, (event.clientX - bounds.left) / Math.max(1, bounds.width) * 2 - 1)));
          moveY(Math.max(-1, Math.min(1, (event.clientY - bounds.top) / Math.max(1, bounds.height) * 2 - 1)));
        };
        const leave = () => { if (active()) { moveX(0); moveY(0); } };
        element.addEventListener('pointermove', move, { passive: true });
        element.addEventListener('pointerleave', leave);
        window.addEventListener('scroll', scroll, { passive: true, capture: true });
        document.addEventListener('visibilitychange', synchronize);
        cleanup = () => {
          observer.disconnect();
          moveX.tween.kill();
          moveY.tween.kill();
          progress.tween.kill();
          element.removeEventListener('pointermove', move);
          element.removeEventListener('pointerleave', leave);
          window.removeEventListener('scroll', scroll, true);
          document.removeEventListener('visibilitychange', synchronize);
        };
        setEnhanced(true);
      } catch {
        if (!cancelled && current === generation) fallback();
      }
    };
    const reconfigure = () => { void configure(); };
    reconfigure();
    reduced.addEventListener('change', reconfigure);
    constrained.addEventListener('change', reconfigure);
    device.connection?.addEventListener('change', reconfigure);
    window.addEventListener('resize', reconfigure, { passive: true });
    document.addEventListener('visibilitychange', reconfigure);
    return () => {
      cancelled = true;
      ++generation;
      reduced.removeEventListener('change', reconfigure);
      constrained.removeEventListener('change', reconfigure);
      device.connection?.removeEventListener('change', reconfigure);
      window.removeEventListener('resize', reconfigure);
      document.removeEventListener('visibilitychange', reconfigure);
      reset();
    };
  }, []);

  useEffect(() => { scene.current?.setAvailable(available); }, [available]);
  useEffect(() => { synchronizeRef.current?.(); }, [paused]);

  return <section ref={root} className="ops-hero" data-enhanced={enhanced}>
    <div className="ops-hero-copy">
      <h1>{t('Shop overview')}</h1>
      <p>{t('A live view of the print counter, queue, and next pickups.')}</p>
      <div className="row wrap" role="status">
        <strong>{t('Printer')}: {t(snapshot.printer.state)}</strong>
        <span>{available ? t('Ready to process the next eligible job.') : snapshot.printer.downtimeMinutes === null
          ? t('Printing is unavailable. Pickup estimates are unknown until downtime is recorded or the printer resumes.')
          : <>{t('Recorded interruption')}: {minutes(snapshot.printer.downtimeMinutes)}</>}</span>
      </div>
      <div className="row wrap">
        <Link className="button primary" to="/shopkeeper/queue">{t('Open print queue')}</Link>
        <Link className="button secondary" to="/shopkeeper/pickup">{t('Verify pickup')}</Link>
        <Link to="/shopkeeper/printers">{t('Manage printer')}</Link>
      </div>
    </div>
    <div className="ops-hero-visual" aria-hidden="true">
      <div ref={host} className="ops-hero-canvas" hidden={!enhanced} />
      <svg className="ops-hero-fallback" style={{ display: enhanced ? 'none' : undefined }} viewBox="0 0 360 240" fill="none" focusable="false">
        <path d="M96 24h160v192H96z" fill="#eef3fc" />
        <g stroke="#394379"><path d="M118 56h97m-97 9h71" strokeWidth="5" /><path d="M118 88h116m-116 12h105m-105 12h112m-112 12h92m-92 12h116m-116 12h103m-103 12h110" strokeWidth="2" opacity=".55" /><path d="M198 188h36" strokeWidth="8" /></g>
        <path d="M84 24h-9v12m190 180h10v-12" stroke="#8fc7c7" />
      </svg>
    </div>
    <div className="ops-hero-controls">
      {enhanced ? <button type="button" className="button ghost" aria-pressed={paused} onClick={() => setPaused(value => !value)}>{t(paused ? 'Resume visual motion' : 'Pause visual motion')}</button> : <span>{t('Static illustration')}</span>}
    </div>
  </section>;
}
