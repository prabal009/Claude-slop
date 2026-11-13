# PrintQ visual system

## 1. Aesthetic Foundation

PrintQ is a campus print-room tool, not an AI product. Its optional entry experience uses the material it manages: four printed sheets, registration marks, ink dots and a clearly ordered file-to-pickup narrative. The paper sculpture is the one expressive element; navigation and copy remain quiet and practical. There are no decorative gradients, blurred lights, artificial metrics or marketing-card grids.

The implemented palette is ink `#202638`, muted text `#667085`, indigo `#5145cd`, teal `#087e85`, paper `#ffffff`, surface `#f5f6fa` and rule `#dde1eb`. Indigo identifies access and queue decisions; teal identifies the transition toward collection. Dark mode uses surface `#171c2a`, paper `#212838`, text `#edf0f8`, muted `#acb5ca`, rule `#354055`, indigo `#aca5ff` and teal `#68c9c4`. Operational green/amber/red remain status colors, not decoration on the landing page.

Locally available Trebuchet MS, with Segoe UI fallback, gives headings a compact, humanist print-room character. Segoe UI/Arial carries body copy. No font or image request goes to an external host. Desktop headline size is 48–88px, body copy 17px/1.75, and supporting navigation 12–14px. Copy measures approximately 38 characters. Text is left-aligned, never justified.

## 2. Hero Section Design

`/shopkeeper/showcase` is an optional route. It does not replace the dashboard or intercept daily workflows. Its header links directly to the dashboard and Print Queue; the same destinations are available in the hero before any scrolling or animation completes.

The hero reads “A clear path from file to pickup.” A 44%-width text column faces a 56%-width paper stage. The stage occupies 92svh and stays sticky while the three chapters scroll. Four organically bent sheets, rather than an unrelated abstract object, carry the visual identity. Registration corners establish the printing context. The illustrative paper contains no real document content.

An SVG paper stack renders immediately and remains the complete fallback. The WebGL canvas replaces it only after scene creation succeeds. A single GSAP introduction moves the hero copy 12px and reveals it over 700ms with `power2.out`; copy is never permanently dependent on animation to be visible. There is no loading gate or delayed call to action.

## 3. Scroll Narrative

The sequence is a real job journey:

- **Receive:** the hero introduces files, running printers and collection in one workspace. The paper begins indigo, loosely layered and gently flexing.
- **Sequence:** “Urgent work. Fair turns.” explains explicit queue rules and reviewable optimization. A working link opens optimization. As scroll progress increases, the sheets turn toward the viewer and their edge bend increases.
- **Release:** “The right pages. The right person.” explains collection-code verification and completed-order receipts. Links open pickup verification and Print Queue. The shader reaches teal, retaining the same recognizable paper object.

GSAP ScrollTrigger maps the story’s `top top` to `bottom bottom`, with linear progress and a 650ms scrub. Page rotation shifts from approximately −0.27 to +0.05 radians on the Y axis and −0.11 to +0.06 on Z. The shader transitions ink between scroll progress 0.28 and 0.92. Text enters naturally through scrolling rather than being repeatedly hidden behind reveal effects; the single hero entrance is the only timed copy reveal. There is no scroll hijacking, snapping or pinned input surface.

## 4. Component Specifications

Primary links are solid `#5145cd`, white text, 6px corners and a minimum 48px height; compact header access is 44px. Hover darkens to `#4236b3`; active darkens to `#362c96` and moves down 1px. Secondary access is transparent with a crisp border, becoming paper-colored on hover. Text links acquire a visible underline and teal hover color. The brand is a working dashboard link, not a decorative control.

All actions use semantic anchors or buttons. Focus is a 3px teal outline offset by 5px. Motion toggles expose `aria-pressed`, have a minimum 44px target, and change their accessible label between pause and resume. No operational destination is disabled. Disabled styling is defined for applicable controls at 45% opacity with a not-allowed cursor; it is not used to simulate functionality. The static mode displays a truthful status instead of a nonfunctional motion button.

Operational tables, panels, status badges and modals use the portal’s shared system. The showcase deliberately introduces no second operational component library. Its selectors and variables are scoped under `pq-showcase` and do not style the dashboard.

## 5. Shader Behaviors

`paperScene.ts` contains custom vertex and fragment shaders. Vertex displacement combines two slow sine fields, a quadratic right-edge curl, per-layer phase offsets and small pointer-controlled bends. The page remains a recognizable sheet. Breathing frequencies are 0.48 and 0.32 radians per second. Increasing story progress increases the curl from 0.20 to 0.56 scene units.

The fragment shader constructs printed title bars, shortened body lines, a divider and a lower-page stamp from UV coordinates. A 4×4 ordered threshold function quantizes fold shading into seven tonal steps, evaluated at a 1.35-pixel scale. This is actual shader dithering rather than an image overlay. Ink interpolates from indigo to teal as the narrative advances; paper remains quiet and near-white.

The particle pass contains 180 deterministic, low-discrepancy ink flecks, not a randomized object allocation each frame. Flecks use 1.4–2.7px sizes before device-pixel scaling, 18–38% opacity and low-amplitude sinusoidal drift. They frame the page without occluding text. All illustration surfaces are hidden from assistive technology.

## 6. Interaction Patterns

| Interaction | Implemented timing and response |
| --- | --- |
| Initial enhanced hero | 700ms, `power2.out`, 12px vertical travel |
| Scroll to paper state | 650ms GSAP scrub, linear narrative progress |
| Pointer to paper tilt | GSAP `quickTo`, 450ms `power2.out`, followed by frame-rate-independent smoothing at 5.5/s |
| Link/button hover | 160ms `ease`, color and border only |
| Primary pressed state | 120ms `ease`, 1px travel |
| Pause/resume | Immediate render-loop cancellation/restart; the current page remains visible |
| Reduced-motion preference change | Disposes enhanced rendering and returns to the static illustration |

Pointer movement is normalized and clamped to −1…1, never captured. Two reusable GSAP `quickTo` tweens ease the mouse coordinates without creating a tween per event; the renderer smooths the final tilt with an approximately 180ms time constant. Leaving the showcase resets its target to neutral. Scroll and keyboard input remain native. Motion toggles are available in both the header and footer. Inactive tabs and offscreen stages stop rendering rather than merely becoming transparent.

## 7. Responsive Strategy

At 900px and below, the text, static paper illustration and remaining chapters form one reading column. Headline size becomes 43–76px; smaller chapter headings become 37–58px. The hero calls to action precede the illustration. At 420px and below, the header wraps, primary actions span the available width, and the illustration is 320px tall instead of 380px. No required content is clipped or horizontally scrolled.

WebGL/GSAP are not imported when reduced motion is requested, the pointer is coarse, the viewport is at most 900px, reported device memory is at most 4GB, reported hardware concurrency is at most two, or data saving is enabled. Missing matchMedia/WebGL APIs also retain the static view, including ordinary DOM test environments. Preference and viewport changes are observed. Missing WebGL support, renderer initialization errors, context loss, shader failure or sustained poor frame performance return to SVG without removing navigation or content.

The poor-performance cutoff is more than 80 slow frames in a 120-frame observation window, where slow means over 40ms. This is graceful degradation, not a claim that all supported hardware achieves a fixed frame rate. Reduced-motion CSS also removes local transitions and transforms. Touch users never need hover or mouse tracking.

## 8. Technical Architecture

- `src/features/shopkeeper/showcase/Showcase.tsx`: default route export, semantic content, direct React Router links, portal translations/theme, capability gates, lazy imports and scoped GSAP lifecycle.
- `src/features/shopkeeper/showcase/paperScene.ts`: isolated Three.js renderer, GLSL, particle buffers, visibility/intersection pause and resource disposal.
- `src/features/shopkeeper/showcase/showcase.css`: isolated layout, visual tokens, responsive behavior, focus and motion-preference states.

The route consumes the existing React/TypeScript/Vite portal. Three.js and GSAP/ScrollTrigger are bundled npm dependencies, dynamically imported only for eligible devices. It needs no API key, backend, network asset, runtime CDN script or remote font. The renderer has no service access and cannot mutate queue state.

Rendering budgets are five draw calls, 7,844 page vertices, 14,976 page triangles and 180 particles. Four pages share a single plane geometry. Pixel ratio is capped at 1.5, antialiasing is off, there are no post-processing passes, textures or frame-loop buffer allocations, and animation deltas are capped at 100ms. The desktop target is a 16.7ms frame (60fps), not a measured guarantee. The initial route remains readable before shader chunks finish downloading; optional shader loading has no interaction-blocking deadline.

Cleanup removes pointer, resize, media and visibility listeners; disconnects observers; reverts the route’s GSAP context and its ScrollTrigger; cancels animation frames; disposes geometry, materials and renderer; releases the context; and removes its canvas. Async initialization is generation-guarded for route changes and StrictMode. The static fallback is the only server-rendered output. All real content stays in the DOM, with heading hierarchy, navigation names, a skip link and native keyboard controls.

## 9. Developer Handoff

Keep the showcase optional and lazy-routed. Never move the canvas into the portal shell or make shader completion a prerequisite to entering the dashboard. Preserve `/shopkeeper` and `/shopkeeper/queue` direct links. All user-facing static copy passes through the portal’s `t()` function; PrintQ is the product name. Theme changes affect scoped tokens without recreating the renderer.

Quality targets: maintain the five-draw-call/1.5-DPR ceiling, keep the first actionable content in the initial DOM, avoid external asset requests and retain a useful static experience for every capability gate. Animation and palette values above are implemented constants, not proposed future work. Browser load time and actual frame rate depend on the production bundle and hardware; no unmeasured load-time result is asserted here.

Integration verification should run TypeScript and the production Vite build, then inspect the optional route at desktop, 900px, 420px and narrow Android widths. Exercise keyboard-only navigation, both motion toggles, OS reduced-motion changes, theme changes, WebGL failure/context loss, background-tab pause, unmount/remount and direct dashboard/queue access. Confirm the operational routes never initialize the showcase renderer. Checks were intentionally left to the integration owner rather than run mid-flight.

## Standalone landing extension

The current root `/` is the complete **single-file `index.html`** implementation, superseding the earlier React landing. Its five sections are shader hero, fictional priority simulation, interactive workflow, operational feature showcase and FAQ/closing invitation. The actual portal remains directly accessible at `/shopkeeper`.

The updated visual system uses ink-like indigo/blue/teal gradients, paper-white surfaces, pink printer-ink accents, procedural halftone and warped paper. Its semantic headline is rendered into a Canvas2D mask and enhanced by native WebGL, with an authored HTML/CSS fallback. Local Trebuchet MS/Arial typography keeps the standalone file free of font downloads.

Controls and visuals are inline HTML/CSS/JavaScript; no runtime libraries or external assets are needed by the landing. A conditional module import loads the separately bundled React portal only on Shopkeeper paths. No saved jobs are read or modified by the landing simulation. The old React landing files and unused font packages were removed.

Motion has one capped-buffer rAF scheduler, visibility/offscreen suspension, reduced-motion handling and narrow/coarse-pointer/data-saving fallbacks, including resize-mode changes. Five-section details, shader behavior and copy-paste instructions are in [LANDING-DESIGN.md](LANDING-DESIGN.md). Earlier captures14–17 document the previous landing; new captures18 onward document the current single-file version.

## Shopkeeper operational refinement

`/shopkeeper` now uses a 240px ink navigation rail (`#181e3d`), pale workspace (`#f3f5f9`), white panels, indigo actions (`#4a46bd`) and teal focus/secondary accent (`#087b80`). Dark mode uses workspace `#141923`, surface `#1d2432` and accent `#b6adff`. Panels use a consistent 12px radius; operational data stays in a fixed-scale system sans with tabular numerals.

The overview has one bounded shader treatment: semantic heading/actions/state on the left, organic dithered printed paper and40 ink flecks on the right. Four primary job counts and a slim secondary-metric strip replace eight equal-priority boxes. Actual printing, the next five jobs with duration-relative bars, pickup suggestions and genuine activity remain actionable. No estimates or trend deltas are invented.

`dashboard/OperationsHero.tsx` lazily loads Three.js/GSAP only on eligible devices; `dashboard/operationsScene.ts` owns geometry, shaders and disposal. Rendering targets a60fps ceiling within720×320CSS pixels and DPR≤1.5. Reduced-motion, mobile/coarse-pointer, constrained devices, context loss and shader failure use a static illustration. Pause preserves a visible frame. Hero motion never changes jobs or printer hardware.

Navigation preserves existing routes, improves mobile focus trapping/restoration, resets scroll/focus on route arrival, and sets localized document titles. The normal `/` home link returns to the unchanged single-file landing. Queue job headings now use h2 below the page h1. Hindi/Kannada controls and both themes remain supported.

Official Impeccable4.9.0 and Windows engine0.1.23 are installed under `.agents/skills/impeccable`; the context loader and targeted source/rendered detectors were actually executed. The source detector returned no findings. Rendered warnings for11px helper copy and a skipped queue heading were corrected, rather than globally ignored. Actual detector/check evidence is in VERIFICATION.md; the nine-part handoff is [SHOPKEEPER-DESIGN.md](SHOPKEEPER-DESIGN.md).
