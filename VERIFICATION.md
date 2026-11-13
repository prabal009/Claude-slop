# Executed verification

## Commands

| Check | Observed result |
| --- | --- |
| `npm install` | Completed; lockfile generated. Later added Node test type declarations. |
| `npm run dev -- --port 5173` | Actual npm script launched Vite; website exercised in Chromium. |
| `npm run test` | **59 tests passed, 3 test files passed** in the final run. |
| `npm run build` | **Passed**: strict `tsc -b`, then Vite production build; 2,235 modules transformed. |
| `npm run preview -- --port 4173` | Actual npm script launched; production dashboard and file upload exercised in Chromium. |
| `npm audit` | **0 vulnerabilities** after dependency installation. Initial JSON audit also reported zero in every severity. |

Test coverage includes duration/cost/sheets, queue order and lifecycle, fairness/urgency, known/unknown printer downtime, isolated simulation and stale revisions, IndexedDB/blobs and conflicts, latest-snapshot initialization, QR verification/duplicate pickup, analytics, unsafe text/files, blocked-preview guidance and UI confirmation/cancellation.

## Browser scenarios actually observed

- Seeded dashboard: six queued, one printing, one ready, two collected; actual computed values.
- Accessible queue movement changed position and estimates.
- Urgent preview showed real before/after waits and delayed jobs. Cancel preserved position; confirmation moved the job into the stable urgent block.
- Existing active job marked Ready; first queued job started Printing and then marked Ready. A later job could not bypass queue order.
- PDF metadata/quality checks and preview controls rendered. Downloaded the **1,046-byte** original sample; extracted text confirmed its two pages contain fictional content only.
- Production Settings accepted that actual PDF via the file input, persisted the job/blob and reopened validated file metadata.
- Unknown-duration pause produced unknown estimates; confirmed resume restored operational availability without automatically completing jobs.
- Versioned manual pickup payload matched PQ-2026-1008; explicit confirmation collected the record; Completed Orders and acknowledgment displayed it.
- Receipt print action invoked actual native printing. An attempted additional `printToPDF` call was rejected as “Page is already being printed,” confirming print state; **no physical print or saved receipt PDF is claimed**.
- Optimizer showed actual improvements/disadvantages and applied only after confirmation.
- Quantity simulation showed added workload and longer waits; cancellation/discard left real configuration unchanged.
- Analytics charts rendered from stored records.
- Hindi and Kannada switching, dark mode, and 390×844 mobile settings/queue were visually inspected. `scrollWidth === innerWidth === 390`; closed mobile navigation is inert and absent from accessible navigation.
- Custom dithered WebGL paper/particles rendered; Pause changed to Resume. Screenshots captured.
- Production same-origin second tab observed a printing→ready update; reloading preserved the change.
- Confirmed demo reset restored the original ten fictional jobs.
- Read-only workflow review reported no blocking findings.

## Environment-specific findings and honest limits

- Managed Chromium blocked embedded native PDF blob viewing (`ERR_BLOCKED_BY_CLIENT`). Safe sandbox restrictions remain. Always-visible fallback guidance plus Open/Download are supplied; direct download succeeded. Native PDF rendering varies by browser. The preview-error regression is tested.
- Node 26 emitted its experimental unavailable-native-localStorage warning. Test setup supplies the Storage contract only where the DOM test environment has none, and uses native Blob/File for fake-indexeddb structured cloning. Final tests passed without suppressing warnings.
- Supervised shell services attempted unavailable Windows WSL; native Windows npm processes were used instead. Both dev and preview scripts were executed, not merely inferred.
- During development, timestamp validation rejected an earlier in-flight fictional seed. The seed was corrected, and only that task-created browser database was explicitly cleared. No automatic corrupt-data overwrite or destructive fallback was introduced.
- No physical camera, printer hardware, Firefox installation or real Android device was supplied. Camera decoder/UI/error handling are covered by tests; manual pickup was exercised in Chromium. Mobile checks used an actual Chromium viewport, not a physical phone.
- No Student Portal/shared integration service was supplied. No Student↔Shopkeeper, cross-device synchronization, payment, authenticated role protection, universal PDF rendering or measured 60fps claim is made.

Screenshots and reproducible judge/recording steps: [DEMO.md](DEMO.md).

## Standalone landing verification

- `npm run build`: passed strict TypeScript and Vite after adding `/`; 2,242 modules transformed, with independently lazy-loaded landing and portal chunks.
- `npm run test`: **59 tests passed across 3 files** after landing integration.
- Actual Chromium production preview at `http://127.0.0.1:4173/` rendered the live paper shader and self-hosted fonts without browser errors.
- Desktop 1440×1000, mobile 390×844 and narrow 320×780 inspected. Narrow checks returned `scrollWidth === innerWidth`, with 320px and 390px widths respectively.
- Queue demo: preview moved Lab submission first; calculated 16.4 minutes less waiting and two 4.2-minute delays. Explicit Apply changed the fictional simulation only; Before comparison and Reset worked. Choosing the already-first job correctly reported no other delay.
- Pause/Resume changed the motion state. Reduced-motion removed the canvas and displayed Static paper view. Mobile uses the same usable static path.
- FAQ opened with click and closed with the Space key. Navigation anchors and real Open portal route worked.
- Entering a Kannada/dark portal, then returning to `/`, preserved `printq.language`/`printq.theme` preferences while rendering the English landing with white text on indigo. Client-side back navigation retained correct landing typography, zero body margin and no overflow after operational CSS loaded.
- Final desktop/full-page/mobile/queue-section captures saved as `screenshots/14-landing-desktop.png` through `17-landing-queue-demo.png`. These are screenshots of the running implementation, not generated assets.
- Impeccable was not installed locally. Official upstream skill and reference guidance were followed; launcher, automated detector and specialized Impeccable review binaries are not claimed as executed. A separate read-only finish review is recorded in LANDING-DESIGN.md.

## Current single-file shader landing

The previous React landing evidence above is historical. Current authoritative source is root `index.html`; all landing CSS, scripts, shaders and graphics are inline. The React portal is imported only on hosted `/shopkeeper` paths.

- Final `npm run build`: **passed**, strict TypeScript plus Vite, 2,238 modules. Built HTML is54.81kB (16.19kB gzip). The separate portal still has its own bundled assets.
- `npm run test` after the single-file cutover: **59 tests passed in3files**. Subsequent changes were limited to landing responsive capability handling and mobile paper clearance; the final build passed after those changes.
- Opened source HTML directly with `file://`: landing and urgent queue demo worked. The browser resource tree reported **zero subresources**; no browser errors. Offline portal clicks displayed the instructions to run the hosted project.
- Actual desktop WebGL produced shader-enhanced text, paper geometry and particles. Pause/Resume and OS reduced-motion worked. Forced `WEBGL_lose_context` exposed the semantic/static fallback.
- Queue preview correctly reported a19.6-minute reduction for Lab handout and3.4-minute delays for both other jobs. Confirmation, Before comparison, reset and already-first rejection were exercised.
- Workflow End-key selected Collect, updated its explanation and destination. Native FAQ disclosure opened correctly.
- Resizing switches WebGL off below the mobile threshold;320px and390px checks showed no horizontal overflow. The corrected390px layout placed the caption bottom at592.16px and paper scene top at750.30px, so the visual no longer covers copy.
- Production Open Shopkeeper Portal reached a working dashboard with `data-surface=portal`, landing hidden and root visible. Back navigation restored `data-surface=landing`. No browser errors were reported.
- Captures: `screenshots/18-single-file-hero.png`, `19-single-file-full.png`, and corrected `20-single-file-mobile.webp`. All were visually inspected. The older20PNG was replaced after the copy-clearance fix.
- The full copy-paste HTML was provided through the generated `out://printq-single-file.md` source document as well as the actual `index.html` file.

No claim is made that the complete React portal works as a single offline HTML file, nor that a physical printer/camera or a fixed60fps rate was measured. Only the landing is self-contained. A browser capture-worker timeout prevented an additional queue screenshot; the actual queue confirmation result was observed successfully.

## Installed Impeccable and Shopkeeper refinement

### Actual tooling

- `npm view impeccable name version repository.url bin --json`: package4.9.0 reports repository `git+https://github.com/pbakaus/impeccable.git`.
- `DO_NOT_TRACK=1 npx --yes impeccable@4.9.0 install --providers=codex --scope=project`: completed. Installed skill under `.agents/skills/impeccable`, Windows engine0.1.23, hooks `.codex/hooks.json`.
- Installed engine `context --target src/features/shopkeeper/pages/Dashboard.tsx`: completed and loaded the existing product/design context. Its Operate, Animate, Polish and craft-floor guidance was read.
- Targeted source detector over the shell, styles, dashboard and new hero/scene files returned `[]`.
- Rendered detector attached to the existing browser with `--cdp 63834 --target http://127.0.0.1:5173/shopkeeper`. During the operational workflow pass it observed the queue surface and reported three warnings: 11px local note, 11px demo-ribbon copy and an h1→h3 queue heading skip. Both text sizes were changed to 12px, verified via computed styles; queue titles became h2. Findings were fixed, not hidden with ignore rules. No second detector pass or unobserved zero-warning rendered result is claimed.
- Automatic hook activation may need Codex reload/approval. Direct detector execution above is verified; automatic hook activation is not inferred.

### Build and functional checks

- Final strict TypeScript/Vite production build: passed,2,240 modules transformed.
- Regression run: **60 tests passed in4files**, including the new real-IndexedDB dashboard Mark Ready/no-WebGL regression. A later route-arrival focus/scroll correction was separately exercised in the browser and the production build rerun successfully.
- Actual production `/shopkeeper` rendered the new overview, correct localized title and real metrics with no browser errors.
- Browser Mark Ready completed the active job; the first queued job started printing and then became ready. Urgency Cancel preserved state; confirmation promoted Seminar outline to position1 and recalculated its wait.
- Shader pause/resume worked. Paused paper stayed visible after preserving/redrawing the bounded buffer. OS reduced-motion removed the scene canvas, and forced WebGL context loss selected the static illustration.
- Hindi desktop and Kannada390px dark-mode surfaces were inspected. Mobile returned `scrollWidth === innerWidth ===390`; closed navigation is inert, Escape restores focus to its opener. Route changes now reset scroll to0 and focus the operational main content.
- Helper-copy computed sizes are12px. Desktop-only navigation controls no longer appear at desktop widths.
- Confirmed reset restored the fictional demo for captures; no integrated data or root landing source was changed.

### Captures and boundaries

Current captures: `screenshots/22-shopkeeper-dashboard.png` (full desktop), `23-shopkeeper-dark.png`, `24-shopkeeper-mobile.png` (settled Kannada390px). All were opened. The first mobile capture caught a navigation transition; it was replaced after waiting for the closed sidebar to be inert and entirely offscreen.

New Three.js/GSAP code is a progressive enhancement within the operational route, not a fullscreen marketing gate.60fps is a bounded desktop target, not a measured guarantee across devices. No physical-phone/GPU benchmark, hardware-printer test, new backend or Student integration is claimed. The separate single-file root landing remains in `index.html`; the working React portal has not been misrepresented as an offline one-file application.

Final installed-instruction finish review returned **`disposition: ship`**, with no material fixes, for the supplied source and validated desktop/dark/mobile evidence. The review preserved the distinction between a bounded visual overview and the functional printing workspace. No unperformed full-device/performance audit is implied by that verdict.
