# PrintQ Shopkeeper Portal

Browser-first campus print-shop operations. **Only the Shopkeeper Portal** is implemented. Standalone mode uses deterministic fictional jobs, local document blobs and real browser persistence; no backend, `.env`, keys, accounts or paid APIs are required.

## Run

Node.js 22.12+ (or a compatible current Node release) and npm:

```sh
npm install
npm run dev
```

Open **http://127.0.0.1:5173/** for the standalone landing page. Open **http://127.0.0.1:5173/shopkeeper** to go directly to operations.

```sh
npm run typecheck
npm run test
npm run build
npm run preview
npm audit
```

`test` is a finite Vitest run. `build` runs strict TypeScript checks before creating `dist/`. `preview` serves that build, normally port 4173. Production hosting must serve `index.html` for `/shopkeeper/*` paths. No separate hosting services needed.

## Landing page

The root `/` is a five-section, shader-driven PrintQ landing page: hero, fictional queue demonstration, interactive process, feature showcase and FAQ/closing invitation. Its gradients, halftone ink, wavy text and pointer effects have static/reduced-motion fallbacks. The queue demonstration never reads or changes portal orders.

**Complete copy-paste-ready landing source: `index.html`.** All landing CSS, JavaScript and shaders are inline; no CDN, account, API or installed package is needed to open the landing directly as a file. Portal links require the hosted project: use `npm run dev` for the actual `/shopkeeper` workflow. A guarded module import loads React only on Shopkeeper paths. The older React landing was removed rather than retained as a second version.


## Operational routes

| Route under `/shopkeeper` | Purpose |
| --- | --- |
| `/` | Actual queue statistics, active printer, upcoming jobs, pickup suggestions and recent activity |
| `/queue` | Job search/filter/sort, details, documents, lifecycle, accessible reorder and urgent marking |
| `/urgent` | Pending student urgency, calculated impact, approval and rejection |
| `/optimization` | Fairness-constrained shortest-processing-time proposal with before/after comparison |
| `/simulator` | Isolated what-if snapshots, comparison and guarded application |
| `/printers` | Pause, maintenance, known/unknown downtime and resume |
| `/pickup` | Local QR camera scanning or manual ready-token verification and confirmed collection |
| `/completed` | Collected job history and printable order acknowledgments |
| `/analytics` | Stored-job analytics, demand charts and actual calculated EcoPrint metrics |
| `/settings` | Shop prices/hours, language/theme, demo job/file intake, urgency and confirmed reset |
| `/showcase` | Optional dithered WebGL paper sculpture, particles and scroll narrative |

Daily operations never require visiting the showcase. WebGL is optional and has a static/reduced-motion fallback. Camera is optional; manual tokens remain available.

## Data and algorithms

- Lifecycle: `queued → printing → ready → collected`; one active printer. Estimated time never automatically completes a job. Browser printing and job status are separate actions.
- Printed sides = pages × copies. Duration = 1 setup minute + sides × 0.4 B&W or 0.8 colour minutes.
- Waiting time includes unfinished work ahead. Ready and collected jobs do not consume remaining queue workload. Unknown recovery means an unavailable ETA, not zero waiting time.
- Prices default to ₹2 B&W / ₹10 colour **per printed side**. Duplex changes sheets, not per-side charges. Values are estimates, not payments or collected revenue.
- Duplex physical sheets = `ceil(pages / 2) × copies`; simplex = `pages × copies`. Savings count only configured duplex jobs. No unsupported carbon-equivalent claims.
- Optimizer preserves urgent order and protects normal jobs older than 60 minutes while sorting eligible normal jobs by duration. Every proposal shows disadvantages as well as calculated savings.
- Priority, optimizer and simulator apply operations require confirmation and revision validation. Stale previews cannot overwrite a newer queue.
- Jobs/documents: IndexedDB. Language/theme: localStorage. Cross-tab notifications: BroadcastChannel with storage-event fallback. Same-origin/profile only—**not cross-device sync**.

## Documents and pickup

Settings can receive fictional local print jobs, optionally with PDF, DOC, DOCX, JPG/JPEG or PNG files. Name-only jobs are valid and explicitly show “Document information available — no file attached.” PDF/images can be previewed where supported; Word files provide metadata and original download, not external conversion. File checks are advisory and do not constitute virus scanning. Use only fictional files.

The deterministic sample includes a locally generated fictional PDF. A ready pickup token is **PQ-2026-1008**. Enter it in QR Verification, or scan a QR encoding **`printq:v1:PQ-2026-1008`**, inspect the matching ready job, then confirm collection. Repeated or non-ready collection is rejected. Camera generally needs HTTPS or localhost; plain HTTP LAN browsers may block camera. Tokens are not authenticated production identity proof.

Receipts are **order acknowledgments**, never proof of payment. Use their Print action; select the browser's Save as PDF destination when available.

## Judge walkthrough

Open Settings and use **Reset Demo**, then confirm, before a fresh run. Reset is confined to the local demonstration. Full scenario details and screenshot references: [DEMO.md](DEMO.md).

1. Dashboard → Print Queue: inspect token, preferences, cost, waiting time and suggested pickup.
2. Open the active printing job; mark it Ready. Open an eligible queued job; Start Printing, then Mark Ready. Observe status and ETA changes.
3. Move an eligible normal waiting job up/down; observe consecutive positions and changed estimates.
4. Mark another queued job urgent: inspect calculated impact, cancel once (no change), reopen and confirm. Approve or reject the seeded pending student request from Urgent Requests.
5. Smart Optimization: calculate, compare averages and per-job delays, cancel or confirm. No-improvement results remain honest.
6. Queue Simulator: change position/quantity/colour or downtime; inspect before/after without touching the real queue. Try a hypothetical job. Only eligible confirmed changes can be applied.
7. Printer Management: confirm pause/maintenance with unknown or known downtime. New printing is blocked; observe unknown/delayed estimates. Confirm resume; no job is falsely completed.
8. QR Verification: enter the ready token above, verify and confirm collection. Observe Completed Orders and view/print its acknowledgment.
9. Analytics and EcoPrint: inspect charts derived from local records; change filters where available. Settings: switch हिन्दी/ಕನ್ನಡ and light/dark, add a fictional file-backed job, refresh to demonstrate persistence.
10. Optional Entry showcase: inspect shader/particles and scroll transitions, then return directly to Print Queue. Reduced-motion/mobile paths retain the same navigation.

## Folder structure

```text
index.html                         complete standalone landing and guarded portal bootstrap
src/
  main.tsx                         standalone router entry
  testSetup.ts                     RTL, jsdom and IndexedDB test setup
  features/shopkeeper/
    index.ts, types.ts              reusable entry and typed adapter contract
    ShopkeeperPortal.tsx           shell, responsive navigation and routes
    PortalContext.tsx              service state, errors and preferences
    components/                    accessible UI primitives
    services/                      local persistence, validation and queue engine
    pages/, jobs/, queue/, urgent/  operations and settings
    optimization/, simulation/     deterministic planning views
    printers/, documents/, qr/      printer/files/pickup
    receipts/, analytics/          history, receipts and EcoPrint charts
    i18n/, showcase/, tests/        translations, optional WebGL and tests
```

See [INTEGRATION.md](INTEGRATION.md) for the injected `ShopkeeperService` interface, [SECURITY.md](SECURITY.md) for controls and risks, [DESIGN.md](DESIGN.md) for the nine-part visual handoff, and [VERIFICATION.md](VERIFICATION.md) for executed check evidence.

## Impeccable design tooling

Official Impeccable **4.9.0** is installed for this project under `.agents/skills/impeccable/`, with the Windows engine **0.1.23** and Codex hooks in `.codex/hooks.json`. Installation used the official npm package whose repository is `pbakaus/impeccable`:

```sh
npx --yes impeccable@4.9.0 install --providers=codex --scope=project
```

The engine's `context --target src/features/shopkeeper/pages/Dashboard.tsx` command was run against the existing product/design records. The operational refinement brief is `.impeccable/surfaces/shopkeeper-overview.md`. Codex may require a tool reload and hook approval before automatically invoking project hooks; the installer does not prove this session's hook integration is active. Direct detector results and actual browser checks are recorded in VERIFICATION.md, not inferred from installation.

The `/shopkeeper` refinement preserves the React/shared-service boundary. Its expressive visual is bounded to the overview; queue/status/urgency/printer/pickup operations remain functional rather than being replaced by a static single-file mockup. Root `index.html` remains the separate standalone landing deliverable.

## Browser requirements and recovery

Use a current Chrome/Chromium, Firefox or Android Chromium browser with IndexedDB. The local service uses modern Promise APIs (`Promise.withResolvers`: Chrome/Edge 119+, Firefox 121+, Safari 17.4+). Camera needs permission and a secure context. Native PDF printing/viewing depends on the browser. No external fonts or CDN scripts are needed at runtime.

If storage is blocked, enable site storage and Retry. A quota error is not reported as a successful save. Corrupt records are rejected rather than silently reset; preserve any required data before explicitly clearing browser site storage. Demo reset is destructive **only to fictional demo data** and requires confirmation. If a queue changes in another tab while a dialog is open, cancel and recalculate. If camera fails, use the manual token field. If a document has no attached blob, its metadata-only job still works. A popup blocker can prevent document print windows; allow the local site's popup and retry.

## Compliance and boundaries

1. Normal browser, local calculations, no mandatory backend/API/account/database setup.
2. No `.env`, credentials or paid service configuration.
3. Functional job status journey and **confirmation-before-urgent-change** workflow with visible persistence/errors.
4. Only fictional bundled records/documents/prices.
5. Source, README, integration/security/design documents, screenshots and demo/recording instructions delivered in this folder.

No Student Portal, Android app, PWA, service worker, installation manifest or backend is created. Locked constraints and the Minute 40 Twist are unknown and are not invented. Student integration must be connected and verified against the actual shared service by the integration owner; this standalone demo does not claim that integration already works. Frontend navigation is not secure role authorization.
