# Judge demonstration and screenshots

## Start

```sh
npm install
npm run dev
```

Open `http://127.0.0.1:5173/shopkeeper`. For the production build:

```sh
npm run build
npm run preview
```

Open `http://127.0.0.1:4173/shopkeeper`. Ports are separate origins and therefore separate local demonstrations. Use the same origin/profile when demonstrating persistence or multiple tabs. No `.env`, backend, authentication account or API key is needed.

Settings → Reset demo → inspect the confirmation → Reset demo data. This restores only the isolated fictional demonstration. On first load there are ten fictional jobs: six queued, one printing, one ready, two collected. One queued request is pending; one has approved urgent priority. Sample PDF job: PQ-2026-1002. Ready pickup token: PQ-2026-1008.

## Five-minute walkthrough

### 1. Receive and inspect
Dashboard → Print Queue. Search PQ-2026-1002 → View details. Show token, original filename, pages/copies, B&W/colour, duplex, A4, price, processing time, wait and pickup suggestion. Preview or download the locally generated PDF. Its two pages explicitly identify it as fictional. Metadata-only jobs are also valid and show no-file guidance.

Native PDF embedding can be blocked by a browser's sandbox/viewer policy. The portal shows fallback guidance and keeps Open file / Download original available. This is not a promise of universal inline PDF rendering. Word files are download-only. Browser printing is separate from status and does not directly control printer hardware.

To receive a real local fictional file: Settings → Document name → pages/copies/preferences → Attach an original file → Add incoming job. Supported files are PDF, DOC, DOCX, JPEG and PNG, maximum 20 MiB. Use the fictional sample or another fictional document, not student data.

### 2. Queue and lifecycle
First mark the existing active job Ready. The first queued job can now Start Printing; then Mark Ready. Inspect changed status and recalculated estimates. A later job must be reordered first if eligible; urgent blocks and fairness-protected jobs cannot be bypassed.

Move Seminar outline or Illustration portfolio using the accessible Move up / Move down controls. The entire queue changes even if search/filter is active. Positions remain consecutive and waiting estimates change. Refresh to show persistence.

### 3. Urgency and transparent trade-offs
Choose a normal queued job → Mark Urgent. The real queue is still unchanged. Show existing/proposed position, pickup, minutes saved and delayed jobs. Cancel once; reopen and Confirm urgency. Existing urgent jobs keep stable relative order. Then visit Urgent Requests to inspect the pending student request and approve with confirmation, or reject without moving the queue.

### 4. Optimization and simulation
Smart Optimization → Calculate suggested queue. Compare current/proposed average waits and the per-job disadvantages. Apply optimized queue → Confirm optimization, or discard. An unchanged/worse proposal is explicitly not presented as an improvement.

Queue Simulator → choose Change print quantity, colour, a move, urgency, a hypothetical job, downtime, resume or optimization → Run simulation. Point out **Simulation Mode — Changes Not Applied**. Inspect before/after workload and waits. Apply Changes opens a separate confirmation; Cancel preserves real jobs. Hypothetical jobs remain labelled and are not silently committed. A stale preview cannot overwrite a newer revision.

### 5. Breakdown, pickup and receipts
Printer Management → optional known downtime, or leave unknown → Pause printing / Report breakdown → Confirm availability change. New printing is blocked; unknown recovery means unavailable future estimates. Resume printing also requires confirmation and does not complete jobs automatically.

QR Verification → enter `printq:v1:PQ-2026-1008` or `PQ-2026-1008` → Verify token → inspect Ready match → Confirm collection → Mark collected. Completed Orders now contains the job. Search token → View receipt → Print receipt / save PDF. The acknowledgement explicitly says payment has not been recorded. In a normal browser choose Save as PDF when available. Unknown, non-ready and already-collected tokens cannot be collected successfully.

Camera scanning uses the bundled decoder, requests permission only on Start camera, and stops when hidden or leaving the page. Manual verification remains available without a camera. No physical-camera scan is claimed as verified in this environment.

### 6. Analytics, languages and visual experience
Analytics and EcoPrint: actual stored-job charts for daily jobs, modes, demand hours, wait, workload and paper savings. Inspect the submission-period slicer. EcoPrint counts ready/collected printed-job records and labels its basis. Printing value is estimated, not paid revenue.

Switch English → हिन्दी → ಕನ್ನಡ in the header; toggle theme. Resize to 390px to show a usable single-column layout and collapsible navigation. Entry showcase is optional: the paper sculpture uses actual dithered/displaced WebGL with particles; Pause visual motion works. Mobile/reduced-motion devices receive the static illustration and direct dashboard/queue access.

### 7. Same-browser update demonstration
Open two Shopkeeper tabs on exactly the same origin. Change a job from printing to ready in one tab; observe the other update. Refresh to show persistence. This was verified for the standalone portal. Do **not** call it cross-device sync or Student Portal integration. Student↔Shopkeeper must be tested after the shared adapter exists; see INTEGRATION.md.

## Captured screenshots

These are screenshots of the running implementation, not mockups. Some show queue state after earlier demonstration actions.

| File | Observed surface |
| --- | --- |
| [01-dashboard.png](screenshots/01-dashboard.png) | Actual seeded operational dashboard |
| [02-urgent-preview.png](screenshots/02-urgent-preview.png) | Calculated urgency impact before confirmation |
| [03-document-and-status.png](screenshots/03-document-and-status.png) | File metadata and preview controls |
| [04-printer-paused.png](screenshots/04-printer-paused.png) | Confirmed pause and unknown recovery |
| [05-pickup-verification.png](screenshots/05-pickup-verification.png) | Actual ready record matched to token |
| [06-order-acknowledgement.png](screenshots/06-order-acknowledgement.png) | Collected order acknowledgement; no payment claim |
| [07-optimization.png](screenshots/07-optimization.png) | Real before/after optimization comparison |
| [08-simulation.png](screenshots/08-simulation.png) | Quantity what-if without real mutation |
| [09-analytics.png](screenshots/09-analytics.png) | Actual-data charts and EcoPrint, full-page capture |
| [10-webgl-showcase.png](screenshots/10-webgl-showcase.png) | Running custom shader and paper scene |
| [11-mobile-kannada-dark.png](screenshots/11-mobile-kannada-dark.png) | 390px Kannada dark-mode settings |
| [12-mobile-queue.png](screenshots/12-mobile-queue.png) | 390px dark-mode queue without horizontal overflow |
| [13-production-upload.png](screenshots/13-production-upload.png) | Production build receiving and checking a real fictional PDF upload |

## Recording when live preview cannot be shared

1. Run the production preview locally and open the browser. Reset demo through its confirmation.
2. On Windows 11, use Snipping Tool screen recording (`Win+Shift+R` where supported), select the browser region, then Start. Alternatively use the operating system's browser-window recording tool. No hosted recording service is required.
3. Record the workflow above: queue/status, urgency cancel/confirm, optimizer, simulation, breakdown/resume, verified pickup/receipt and analytics. Finish with language/mobile/showcase.
4. Show confirmations and actual changed values; do not cut from an unconfirmed action to an unrelated success state. Do not record real documents, personal data, accounts or other tabs.
5. Stop and save MP4 locally. Include README, the three main documents, DESIGN.md, VERIFICATION.md and screenshots with the source submission. A recording is evidence, not a replacement for the runnable website.

## Five visible rules
Browser-first local execution; no `.env`/credentials; functional confirmed job/urgent workflow; fictional data only; source/documentation/screenshots/demo instructions delivered. Locked rules and Minute 40 Twist are unknown and not fabricated.

## Standalone single-file landing walkthrough

Open `/` through Vite, or open root `index.html` directly from disk. All five landing sections, styles, JavaScript, shader text and queue-demo arithmetic are inside that file. WebGL enhances the hero; reduced-motion/mobile paths retain semantic text and authored static paper visuals.

Use Take the queue for a spin, then Preview urgent move. Lab handout's wait drops by 19.6 minutes; Thesis draft and Studio portfolio each wait 3.4 minutes longer. Confirm in simulation applies only to this isolated example. Before/After and Reset demo work independently of stored portal orders. Choosing the already-first job reports no change and does not enable confirmation.

Workflow tabs support arrow keys, Home and End; their explanation, route link and sample ticket state update together. Feature disclosures open real portal tools. The FAQ explains browser-local limitations and no-AI/physical-printing boundaries. Offline portal clicks show instructions to run `npm run dev`; no broken standalone file route is attempted.

Global Pause/Resume is memory-only; OS reduced-motion keeps effects still. Mobile/capability changes use the static scene rather than squeezing desktop shader text. The complete code is `index.html`; design and source handoff are in LANDING-DESIGN.md. Screenshots18 onward show this version; captures14–17 show its predecessor.
