import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { usePortal } from '../PortalContext';
import type { PaperScene } from './paperScene';
import './showcase.css';

function PaperFallback() {
  return (
    <svg className="pq-showcase__paper" viewBox="0 0 600 680" fill="none" aria-hidden="true" focusable="false">
      <defs>
        <pattern id="pq-paper-dither" width="6" height="6" patternUnits="userSpaceOnUse">
          <circle cx="1" cy="1" r=".8" fill="currentColor" opacity=".28" />
          <circle cx="4" cy="4" r=".6" fill="currentColor" opacity=".16" />
        </pattern>
      </defs>
      <path d="M106 183 389 114 502 498 219 566Z" fill="#e9e8f5" stroke="#c8c6df" />
      <path d="m135 151 289-34 46 395-289 34Z" fill="#f1f0f9" stroke="#c8c6df" />
      <path d="m178 120 290 24-33 397-290-24Z" fill="#fbfbfe" stroke="#c8c6df" />
      <path d="M178 120c104 7 186 36 290 24l-33 397c-104 12-186-17-290-24z" fill="url(#pq-paper-dither)" />
      <g stroke="currentColor" transform="rotate(5 300 300)">
        <path d="M209 212h156M209 226h113" strokeWidth="9" />
        <path d="M209 257h195" opacity=".45" />
        <path d="M209 288h195m-195 15h176m-176 15h190m-190 15h153m-153 15h181m-181 15h190m-190 15h169m-169 15h189m-189 15h142" strokeWidth="3" opacity=".32" />
        <path d="M359 459h44" strokeWidth="12" />
      </g>
      <g stroke="currentColor" opacity=".35">
        <path d="M98 95v20m-10-10h20M493 556v20m-10-10h20" />
        <path d="M112 587h350" strokeDasharray="1 8" />
      </g>
    </svg>
  );
}

export default function Showcase() {
  const { t, theme } = usePortal();
  const root = useRef<HTMLDivElement>(null);
  const story = useRef<HTMLDivElement>(null);
  const canvasHost = useRef<HTMLDivElement>(null);
  const scene = useRef<PaperScene | null>(null);
  const [enhanced, setEnhanced] = useState(false);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (typeof window.matchMedia !== 'function'
      || (typeof WebGLRenderingContext === 'undefined' && typeof WebGL2RenderingContext === 'undefined')) return;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
    const constrained = window.matchMedia('(pointer: coarse), (max-width: 900px)');
    const device = navigator as Navigator & { deviceMemory?: number; connection?: { saveData?: boolean } };
    let cancelled = false;
    let cleanupAnimation: (() => void) | undefined;
    let generation = 0;
    let failed = false;

    const fallBack = () => {
      failed = true;
      scene.current?.dispose();
      scene.current = null;
      cleanupAnimation?.();
      cleanupAnimation = undefined;
      if (!cancelled) setEnhanced(false);
    };

    const configure = async () => {
      const current = ++generation;
      scene.current?.dispose();
      scene.current = null;
      cleanupAnimation?.();
      cleanupAnimation = undefined;
      setEnhanced(false);
      const lowPower = (device.deviceMemory !== undefined && device.deviceMemory <= 4)
        || (device.hardwareConcurrency > 0 && device.hardwareConcurrency <= 2)
        || Boolean(device.connection?.saveData);
      if (failed || reduced.matches || constrained.matches || lowPower) return;
      try {
        // These packages are never loaded by the static/mobile experience.
        const [{ createPaperScene }, { gsap }, { ScrollTrigger }] = await Promise.all([
          import('./paperScene'), import('gsap'), import('gsap/ScrollTrigger'),
        ]);
        if (cancelled || current !== generation || !canvasHost.current || !story.current || !root.current) return;
        const visual = createPaperScene(canvasHost.current, fallBack);
        scene.current = visual;
        gsap.registerPlugin(ScrollTrigger);
        const state = { progress: 0 };
        const context = gsap.context(() => {
          gsap.fromTo('.pq-showcase__intro', { opacity: 0, y: 12 }, {
            opacity: 1, y: 0, duration: .7, ease: 'power2.out', clearProps: 'opacity,transform',
          });
          gsap.to(state, {
            progress: 1,
            ease: 'none',
            onUpdate: () => visual.setProgress(state.progress),
            scrollTrigger: {
              trigger: story.current,
              start: 'top top',
              end: 'bottom bottom',
              scrub: .65,
              invalidateOnRefresh: true,
            },
          });
        }, root.current);
        const pointer = { x: 0, y: 0 };
        const moveX = gsap.quickTo(pointer, 'x', {
          duration: .45, ease: 'power2.out',
          onUpdate: () => visual.setPointer(pointer.x, pointer.y),
        });
        const moveY = gsap.quickTo(pointer, 'y', {
          duration: .45, ease: 'power2.out',
          onUpdate: () => visual.setPointer(pointer.x, pointer.y),
        });
        const move = (event: PointerEvent) => {
          const bounds = root.current?.getBoundingClientRect();
          if (!bounds) return;
          moveX(Math.max(-1, Math.min(1, (event.clientX - bounds.left) / bounds.width * 2 - 1)));
          moveY(Math.max(-1, Math.min(1, event.clientY / window.innerHeight * 2 - 1)));
        };
        const resetPointer = () => { moveX(0); moveY(0); };
        const element = root.current;
        element.addEventListener('pointermove', move, { passive: true });
        element.addEventListener('pointerleave', resetPointer);
        cleanupAnimation = () => {
          context.revert();
          moveX.tween.kill();
          moveY.tween.kill();
          element.removeEventListener('pointermove', move);
          element.removeEventListener('pointerleave', resetPointer);
        };
        setEnhanced(true);
      } catch {
        if (!cancelled && current === generation) fallBack();
      }
    };

    void configure();
    reduced.addEventListener('change', configure);
    constrained.addEventListener('change', configure);
    return () => {
      cancelled = true;
      generation += 1;
      reduced.removeEventListener('change', configure);
      constrained.removeEventListener('change', configure);
      cleanupAnimation?.();
      scene.current?.dispose();
      scene.current = null;
    };
  }, []);

  useEffect(() => { scene.current?.setPaused(paused); }, [paused, enhanced]);

  return (
    <div ref={root} className={`pq-showcase${enhanced ? ' pq-showcase--live' : ''}${theme === 'dark' ? ' pq-showcase--dark' : ''}`}>
      <a className="pq-showcase__skip" href="#pq-showcase-entry">{t('Skip to dashboard links')}</a>
      <header className="pq-showcase__header">
        <Link className="pq-showcase__brand" to="/shopkeeper" aria-label={t('PrintQ dashboard')}>
          <svg width="28" height="30" viewBox="0 0 28 30" aria-hidden="true"><path d="M5 2h16v21H5zM8 6h16v21H8z" fill="none" stroke="currentColor" strokeWidth="1.5" /><path d="M12 12h8m-8 4h8m-8 4h5" stroke="currentColor" strokeWidth="1.5" /></svg>
          <span>PrintQ</span>
        </Link>
        <span className="pq-showcase__header-note">{t('The campus print room, in order.')}</span>
        <nav aria-label={t('Direct portal access')}>
          {enhanced && (
            <button type="button" className="pq-showcase__motion-button" aria-pressed={paused} onClick={() => setPaused(!paused)}>
              {t(paused ? 'Resume visual motion' : 'Pause visual motion')}
            </button>
          )}
          <Link className="pq-showcase__text-link" to="/shopkeeper/queue">{t('Print Queue')}</Link>
          <Link className="pq-showcase__button pq-showcase__button--small" to="/shopkeeper">{t('Open dashboard')}</Link>
        </nav>
      </header>

      <div className="pq-showcase__story" ref={story}>
        <section className="pq-showcase__chapter pq-showcase__hero" aria-labelledby="pq-showcase-title">
          <div className="pq-showcase__intro">
            <p className="pq-showcase__kicker">{t('Less sorting. More printing.')}</p>
            <h1 id="pq-showcase-title">{t('A clear path from file to pickup.')}</h1>
            <p className="pq-showcase__lede">{t('One workspace for the jobs coming in, the printers running and the students ready to collect.')}</p>
            <div className="pq-showcase__actions" id="pq-showcase-entry">
              <Link className="pq-showcase__button" to="/shopkeeper">{t('Open dashboard')}</Link>
              <Link className="pq-showcase__button pq-showcase__button--secondary" to="/shopkeeper/queue">{t('View print queue')}</Link>
            </div>
            <a className="pq-showcase__continue" href="#pq-showcase-order">{t('Follow a page through PrintQ')}<span aria-hidden="true">↓</span></a>
          </div>
        </section>

        <section className="pq-showcase__chapter" id="pq-showcase-order" aria-labelledby="pq-showcase-order-title">
          <div className="pq-showcase__copy">
            <p className="pq-showcase__step">{t('At the queue')}</p>
            <h2 id="pq-showcase-order-title">{t('Urgent work. Fair turns.')}</h2>
            <p>{t('See the files, print settings and queue positions together. Review an urgent request or compare an optimized order before changing the plan.')}</p>
            <p className="pq-showcase__aside">{t('Explicit rules, not AI. Clear decisions you can review.')}</p>
            <Link className="pq-showcase__text-link" to="/shopkeeper/optimization">{t('Explore queue optimization')}</Link>
          </div>
        </section>

        <section className="pq-showcase__chapter" id="pq-showcase-pickup" aria-labelledby="pq-showcase-pickup-title">
          <div className="pq-showcase__copy">
            <p className="pq-showcase__step">{t('At the counter')}</p>
            <h2 id="pq-showcase-pickup-title">{t('The right pages. The right person.')}</h2>
            <p>{t('Track a job from printing to ready for pickup. Verify the collection code, hand over the pages and keep a receipt of the completed order.')}</p>
            <Link className="pq-showcase__text-link" to="/shopkeeper/pickup">{t('Open pickup verification')}</Link>
            <div className="pq-showcase__closing">
              <p>{t('Your next print job is waiting.')}</p>
              <Link className="pq-showcase__button" to="/shopkeeper/queue">{t('Go to Print Queue')}</Link>
            </div>
          </div>
        </section>

        <div className="pq-showcase__visual-column" aria-hidden="true">
          <div className="pq-showcase__visual">
            <div className="pq-showcase__registration pq-showcase__registration--top" />
            <PaperFallback />
            <div className="pq-showcase__canvas" ref={canvasHost} />
            <div className="pq-showcase__registration pq-showcase__registration--bottom" />
            <span className="pq-showcase__visual-caption">{t('Every page has a place.')}</span>
          </div>
        </div>
      </div>

      <footer className="pq-showcase__footer">
        <p>{t('Built for the rhythm of a campus print room.')}</p>
        <div className="pq-showcase__motion">
          {enhanced ? (
            <button type="button" className="pq-showcase__motion-button" aria-pressed={paused} onClick={() => setPaused(!paused)}>
              <span aria-hidden="true">{paused ? '▷' : 'Ⅱ'}</span>{t(paused ? 'Resume visual motion' : 'Pause visual motion')}
            </button>
          ) : <span>{t('Static visual. Same workspace.')}</span>}
          <Link className="pq-showcase__text-link" to="/shopkeeper">{t('Dashboard')}</Link>
        </div>
      </footer>
    </div>
  );
}
