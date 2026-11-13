# PrintQ Shopkeeper refinement

Target `/shopkeeper`, not the standalone root landing. Official Impeccable4.9.0 was installed project-locally using the verified `pbakaus/impeccable` npm package, including Windows engine0.1.23 and Codex hooks. Its context loader read PRODUCT.md/DESIGN.md, and its Operate, Animate and craft-floor guidance govern this refinement. Direction contract: `.impeccable/surfaces/shopkeeper-overview.md`.

## 1. Aesthetic Foundation

The implemented palette retains PrintQ's indigo/teal family: action indigo `#4a46bd`, teal `#087b80`, navigation ink `#181e3d`, workspace `#f3f5f9` and white paper panels. Dark workspace is `#141923` with surface `#1d2432` and accent `#b6adff`. The overview uses indigo/blue fields around its paper artifact rather than placing effects over jobs. System sans is intentional for dense, multilingual operations; tabular numerals align durations, positions and values. No invented trend lines, revenue claims or AI labels.

## 2. Hero Section Design

The dashboard starts with a compact overview band, not a fullscreen gate. Heading, printer availability, queue/pickup actions and management link are normal DOM content. A custom Three.js printed-sheet scene occupies its own right-side visual area. The page is actionable before the renderer loads. Pause/Resume controls decorative motion; a labelled static illustration preserves the composition without WebGL.

## 3. Scroll Narrative

Five operational regions: overview; four primary job-state counts; secondary workload/value/urgency/completion strip; live printer and upcoming queue; pickup suggestions and genuine activity. Scroll only influences the sheet's shallow pose progression; operational content is never hidden behind entrance animations. Direct navigation to queue, urgency, printers, documents, pickup and analytics remains intact.

## 4. Component Specifications

Existing shared Button, Stat, Status, Modal and Confirm contracts are reused. Four primary metrics are actual active/queued/printing/ready counts; secondary values are actual pending urgency, collected jobs, remaining workload and estimated queued value. Upcoming-job duration bars use real relative durations and are decorative, not fabricated forecasts. Mark Ready retains its busy/mutation guard. Empty active work shows a useful direct queue action. Navigation has hover/current/focus states, mobile collapse and Escape handling; modal and receipt-print behavior remain shared.

## 5. Shader Behaviors

One organic sheet uses a36×44 segmented plane and true three-dimensional value-noise displacement. Printed UV marks and ordered dithering provide material, while40 restrained ink particles complete the scene. Printer availability changes its visual energy without controlling hardware or implying print completion. DOM text, metadata and state are never encoded solely in shader pixels.

## 6. Interaction Patterns

GSAP quickTo handles pointer and scroll relationships with350ms/300ms `power2.out` easing. Standard operational hover/focus/pressed transitions stay short and interruptible; no orchestrated route-load sequence. Explicit urgency/optimization/simulation/collection confirmations remain unchanged. Motion pause is separate from printer pause and cannot mutate queue state.

## 7. Responsive Strategy

At900px/coarse-pointer, reduced-motion, saveData,≤4GB reported memory,≤2 reported CPU threads or missing required graphics APIs, the overview uses a static illustration without importing heavy scene code. Dynamic media/connection/resize changes re-evaluate eligibility. Narrow layouts keep real data, local-language labels and controls readable. The scene is unnecessary for operating the portal.

## 8. Technical Architecture

The existing React/TypeScript/Vite portal stays modular. `pages/Dashboard.tsx` owns snapshot-derived composition, `dashboard/OperationsHero.tsx` owns scene eligibility/control/lifecycle, and `dashboard/operationsScene.ts` owns Three.js GPU resources. `styles.css` remains the single shared operational style convention. No backend, data-schema change, new runtime CDN, external API or additional rendering library is introduced.

Eligible desktop target: requestAnimationFrame with a60fps ceiling, DPR≤1.5 and720×320CSS-pixel bounds. Offscreen/background/user pause stops the renderer and associated tweens. Sustained low performance, shader errors or context loss select the static fallback. Async generation checks, listener/tween cancellation, observer disconnection and GPU disposal prevent stale route rendering. Target60fps is a budget, not an unmeasured hardware guarantee.

## 9. Developer Handoff

Run `npm run dev` and open `/shopkeeper`; `npm run build` compiles the production app. Run `npm run test` for domain/workflow/document/pickup/dashboard regressions. Root `index.html` remains the separate single-file landing; the portal is not falsely presented as a one-file offline application.

New labels are locally translated into Hindi and Kannada. Verify desktop/mobile, light/dark, new heading/actions, Mark Ready, queue urgency cancellation/confirmation, keyboard navigation, shader pause/reduced-motion/context-loss and real data consistency. Installed Impeccable detector output, actual executed checks and final screenshots are recorded in VERIFICATION.md after integration.

Codex may need reload/hook approval for automatic hooks. This session explicitly invokes the installed engine; installation alone is not reported as an automatic-hook pass. The engine sends no product/job data through the local detector command; telemetry was disabled for installation/context calls.

## Finish disposition

**ship.** Independent read-only finish review followed the installed Impeccable reviewer instructions for this established Operate surface. It reviewed the primary source, product/direction records and validated desktop/dark/mobile captures; it reported no material fixes in that scope. No comp-led or new-world approval is claimed.

Executed checks: final production build passed; 60 regression tests passed across four files. Installed source detector returned no findings; three rendered warnings were corrected and the affected font sizes/heading markup verified. Production `/shopkeeper`, status/urgency workflows, Hindi/Kannada themes, mobile focus restoration, reduced-motion and context-loss fallback were exercised. Captures: `screenshots/22-shopkeeper-dashboard.png`, `23-shopkeeper-dark.png`, `24-shopkeeper-mobile.png`.
