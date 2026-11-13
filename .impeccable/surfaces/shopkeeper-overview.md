# Shopkeeper overview refinement

Target: `src/features/shopkeeper/pages/Dashboard.tsx`, `/shopkeeper`. Mode: Operate. Existing queue, status, persistence, documents, urgency, localization and confirmation behavior are binding. The user explicitly asks for richer shader/dither/particle/gradient motion and Impeccable installation. Root single-file landing is out of scope.

## Direction contract

**THESIS:** A composed printing floor, not eight identical boxes. The current printer and next queue actions lead; workload and history support them. Spectacle is one bounded overview treatment, never an overlay on operational text.

**OWN-WORLD:** Retain indigo/teal/paper. Deep ink-indigo sidebar, clear pale working surface, quiet bordered panels, clean system UI type, and a bounded indigo-to-teal shader band. Semantic amber/red/green remain reserved for job/printer states. No decorative glass, fake charts or invented deltas.

**STORY:** Identify the shop and printer state, enter the queue or pickup, scan four primary real counts, inspect running/next work and review genuine pickup/activity records.

**FIRST VIEWPORT:** 240px sidebar and compact top bar. A230–270px overview band has a legible heading, description and direct queue/pickup actions on the left; a dithered print-sheet artifact occupies the right. Four compact metrics and a slim secondary-data strip precede a usable live-printer/upcoming-queue workspace. No fullscreen gate or choreographed load delay.

**FORM:** Refinement inside an established operational world; no new-world concept round. The user-pinned shader vocabulary is expressed only in the bounded overview. Existing exported contracts and actions stay unchanged. Fixed rem-scale interface typography and fast state transitions. All new strings translate locally.

**FINISH:** unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance.

## Motion thesis

Focal moment: procedural printed paper whose energy reflects printer availability without suggesting actual hardware control. Continuity: route and component-state transitions at150–220ms, no staggered reveal hiding content. Feedback: conventional hover/pressed/focus; confirmed status changes remain authoritative. Budget: lazy Three.js/GSAP in the overview only, bounded canvas, DPR≤1.5, pause offscreen/hidden/paused, static mobile/reduced-motion/noGPU fallback, complete listener/tween/GPU cleanup. Content never waits for the renderer.

## Shared markup and ownership

Dashboard owner: `pages/Dashboard.tsx`, `dashboard/OperationsHero.tsx`, `dashboard/operationsScene.ts` only. Hero uses `.ops-hero`, `.ops-hero-copy`, `.ops-hero-visual`, `.ops-hero-canvas`, `.ops-hero-fallback`, `.ops-hero-controls`; no new CSS file. Hero heading actual t('Shop overview') or existing product phrase; body copy existing localized strings if possible; direct queue/pickup actions. Renderer decorative aria-hidden. DOM text never becomes shader-only. Export default OperationsHero; it consumes usePortal. Its pause button t('Pause visual motion')/t('Resume visual motion') existing dictionary keys; static label t('Static illustration') if new report it.

Dashboard layout: `.dashboard-page` with `.ops-metrics` containing4Stat active/queued/printing/ready; `.ops-secondary-metrics` contains `.ops-secondary-item` label/value for pending urgent/completed/workload/queued value. `.ops-floor-grid`: first panel `.ops-printer-panel`, second `.ops-queue-panel`; queue rows `.ops-queue-item` with `.ops-position`, `.ops-queue-content`, `.ops-queue-estimate` and `.ops-queue-track`/`.ops-queue-fill` duration-relative bars (aria-hidden, actual data). Active empty panel provides direct queue route; no huge blank panel. `.ops-lower-grid` pickup and activity panels, `.ops-pickup-list`, `.ops-event-list`. Preserve original labels/actions/timestamps and JobDetails interactions. No dummy lists. Use semantic ol/li and actual stable IDs. Busy existing status path unchanged. All panel headers common `.panel-header`.

Skin/shell owner: `styles.css` and `ShopkeeperPortal.tsx` only. Refine existing shared token/layout/control system, not a second CSS convention; preserve all required classes and mobile table/print/modal behavior. Format existing CSS maintainably as needed, no duplicate override pile. Supply all ops classes above. Sidebar dark ink with accessible nav; hide/inert on mobile, keyboard focus trapped only if navigation becomes true modal; preserve Escape/collapse. Light/dark and expanded Hindi/Kannada labels fit. Header route identity, clear printer pill, language/theme preserved. Include working home link to `/` as ordinary anchor. Set portal document title appropriately and restore on unmount. Never modify shared service or root index.html.

Parent owns dictionaries/tests/docs/installed tool commands. Agents skip all build/test/lint/format midflight. Parent runs checks once after integration and invokes the installed Impeccable detector. New text labels must be reported for complete Hindi/Kannada coverage.
