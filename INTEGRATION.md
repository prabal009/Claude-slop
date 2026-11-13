# Shopkeeper integration contract

## Ownership and mount
No Student Portal, shared types, engine or existing application configuration was present in the supplied folder. This is a **provisional, explicit adapter contract**, not a claim that a teammate has agreed to it. Reuse the authoritative shared model when it is supplied; map at the adapter boundary, do not run a second authoritative engine.

```tsx
import { ShopkeeperPortal } from './features/shopkeeper';
// Within the host application's existing React Router:
<Route path="/shopkeeper/*" element={<ShopkeeperPortal service={sharedShopkeeperAdapter} />} />
```

The component does not create another router. Root `index.html` owns the standalone landing page, with all landing CSS/JavaScript inline. Its guarded bootstrap imports `src/main.tsx` only for `/shopkeeper` paths; that entry supplies BrowserRouter and the lazy-loaded Shopkeeper routes. No Student Portal route is implemented. The optional operational entry showcase remains `/shopkeeper/showcase`; daily operations open directly at `/shopkeeper`. The landing does not initialize job storage and can run as a local file; real portal workflows require the Vite/hosted application.

Without an injected service, the component uses isolated fictional browser-local data. The integration adapter must implement `ShopkeeperService` from `src/features/shopkeeper/types.ts`, return `mode: 'integrated'`, and own all shared persistence, queue calculations, document lookup, concurrency and notifications. Local demo reset must never touch integrated jobs. Do not point two incompatible stores at the same data.

## Units and model
Authoritative TypeScript shapes: `src/features/shopkeeper/types.ts`.

`Job` includes identity (`id`, `token`), document metadata (`documentName`, nullable `documentId`, `originalFileName`, `mimeType`, `fileSize` in bytes), preferences (`pageCount`, `copies`, `colorMode`, `duplex`, `paperSize`, `instructions`), lifecycle, urgency, queue position, estimated cost/duration/wait/pickup, and timestamps. Unknown fields use explicit null, never zero as an unknown ETA. All timestamps are ISO 8601 strings. Durations, waits, downtime and buffers are **minutes**; costs are **INR**.

Statuses: `queued | printing | ready | collected`. Colour: `bw | colour`. Priority: `normal | urgent`. Urgent request: `none | pending | approved | rejected`. Printer state: `operational | paused | maintenance`. Paper: `A4 | A3`.

Queue positions are consecutive 1-based integers **only for queued jobs**. Printing/ready/collected jobs have null positions. There is at most one printing job. Approved urgent jobs form a stable front block of the waiting queue; they never interrupt the active printer. Reordering must include every eligible queued ID exactly once and preserve the urgent block. No duplicate IDs or tokens.

The job model also records `printingStartedAt`, `readyAt`, `collectedAt`, `remainingMinutes`, `urgentRequestedAt` and `pickupWindowEnd`. `hypothetical` marks simulation-only jobs. `Snapshot` groups a revision, jobs, printer state, shop settings, recent genuine activity and data mode.

## Tokens and pickup
Fictional seeded tokens use `PQ-2026-1001` style values. Ready demonstration token: **PQ-2026-1008**. Camera payload: **`printq:v1:<token>`**, for example `printq:v1:PQ-2026-1008`. Manual entry accepts a supported token or versioned payload. No personal data/document bytes in QR. Agree the exact token grammar with the Student Portal owner before integration; adapt explicitly rather than silently accepting arbitrary payloads.

The standalone grammar is `^PQ-\d{4}-\d{4,12}$`. It is provisional, not an assertion of an existing Student contract. Successful verification authorizes a local handover attempt for five minutes; collection still rechecks ready status and revision. Reverify after expiry or a conflicting update.

Pickup lookup must validate format, existence and ready status. Confirmation invokes `markCollected` with the snapshot revision. Repeated collection and non-ready pickup fail. These are not authenticated or signed production pickup credentials.

## Lifecycle and estimates
`queued → printing → ready → collected`, with no implicit transition when estimated time elapses. Starting requires an operational printer and free capacity. Browser print actions do not change job state. Readiness and collection record timestamps. Printer recovery does not complete a job.

```text
printedSides = pageCount × copies
jobDurationMinutes = 1 + printedSides × (bw ? 0.4 : 0.8)
estimatedCostINR = printedSides × (bw ? bwPrice : colourPrice)
```

Default per-side prices: ₹2 B&W, ₹10 colour. Duplex does not halve per-side pricing. Queued wait includes remaining active work and unfinished jobs ahead. Own duration is separate; pickup readiness includes both. Unknown downtime yields null future estimates rather than fabricated recovery. Known downtime delays workload. Pickup windows are suggestions, include a configurable buffer, and respect configured shop operating hours. Demo defaults can be changed through Settings.

```text
simplexSheets = pageCount × copies
duplexSheets = ceil(pageCount / 2) × copies
sheetsSaved = duplex ? simplexSheets - duplexSheets : 0
```

Analytics and EcoPrint are based on stored fictional job records and explicitly label estimated values rather than paid revenue.

## Optimization and simulation
Deterministic shortest-processing-time ordering for eligible normal jobs. Approved urgent order is stable. Normal jobs older than 60 minutes are fairness-protected in their positions. Deterministic queue/submission tie-breaking avoids random ordering. Preview reports real before/after waits and disadvantages; no improvement is claimed unless calculated average wait improves. Every apply requires confirmation and matching revision.

Simulation clones a snapshot and supports moves, urgent priority, hypothetical new jobs, quantity/colour changes, downtime, resume and optimization. Hypothetical jobs are labelled and cannot be mistaken for incoming orders. Only applicable scenarios may be committed; stale previews are rejected. The real queue is untouched until a confirmed supported apply.

## Service methods
`ShopkeeperService` has typed asynchronous methods:

- Reads: `initialize`, `getJobs`, `getJobById`, `getQueueSnapshot`, `getPrinterStatus`, `getDocument`, `getUrgentRequests`, `getAnalytics`.
- Lifecycle/order: `updateJobStatus(id,status,revision)`, `reorderQueue(ids,revision)`.
- Urgency: `getUrgentImpactPreview(id)`, `approveUrgentRequest(id,revision)`, `rejectUrgentRequest(id,revision)`, `markJobUrgent(id,revision)`.
- Planning: `getOptimizationPreview`, `applyOptimizedQueue(revision)`, `getSimulationResult(scenario)`, `applySimulation(scenario,revision)`.
- Shop: `updatePrinterStatus(state,downtime,revision)`, `updateSettings(settings,revision)`.
- Pickup: `verifyPickupToken(token)`, `markCollected(id,revision)`.
- Demo only: `addDemoJob(input)`, `requestDemoUrgency(id,revision)`, `resetDemo(revision)`; integrated adapters must reject these without touching real data.
- Notifications: `subscribeToJobUpdates(callback)` returns unsubscribe; `dispose` releases owned resources. The portal disposes its own local service, not an externally injected service.

Mutations return the complete committed Snapshot. Errors reject with a safe actionable message. No invented HTTP endpoints. Validate service responses before rendering; notifications trigger a fresh read rather than carrying authoritative mutable objects.

## Persistence and conflicts

Standalone database: **`printq-shopkeeper-v1`**, IndexedDB version **1**.

| Store | Key | Value |
| --- | --- | --- |
| `state` | `current` | Validated complete `Snapshot`, including revision |
| `documents` | keyPath `id` | `StoredDocument`: id, original name, MIME type and Blob |

Notification channel/storage key: `printq-shopkeeper-updates-v1`. Focus refresh and three-second revision polling provide additional notification fallback. These names belong to the isolated demo adapter; the integration owner must supply the authoritative shared layer rather than blindly reuse a conflicting database.

Local jobs and document blobs use IndexedDB. Lightweight language/theme preferences use localStorage. IndexedDB mutations use a read/write transaction and compare the requested revision with current persisted revision before commit. BroadcastChannel (with storage-event fallback) only signals changes; it is not locking or persistence. Queue changes while a confirmation is open invalidate its revision and require a new preview. Multiple tabs read the same origin/profile database; different origins, devices and profiles do not synchronize.

Never automatically clear malformed storage or silently replace it with successful sample results. Browser quota/permission problems are visible. Explicit demo reset requires confirmation and is isolated to the demo store.

## Required integration verification
1. Agree shared schema, token grammar, QR version, storage schema, document IDs and authoritative engine owner.
2. Implement the injected service over that shared layer; keep one engine and one mutation authority.
3. Same origin/profile: create a fictional job in Student Portal, observe Shopkeeper receive it, update status, observe Student refresh through the shared notification layer.
4. Verify shared price/ETA output, document blob access, pending urgency, stale revision rejection and pickup collection across both portals/tabs.
5. Verify unavailable shared data produces an error, not an unannounced fallback to fictional records.

**Not yet claimed:** Student↔Shopkeeper integration, cross-device synchronization, direct hardware printing, actual payments or production role protection. Those systems were not supplied.
