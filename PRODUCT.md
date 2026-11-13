# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Campus print-shop staff receiving, sequencing, printing and handing over student document orders. Hackathon judges evaluate the independent browser-local demonstration. Student Portal development belongs to another teammate and is outside this implementation.

## Product Purpose

PrintQ makes print-job state, queue order, urgency trade-offs and pickup readiness visible in one Shopkeeper Portal. The official workflow is to open a job, update its valid lifecycle state, then explicitly confirm a queued job's urgent priority change and observe recalculated estimates.

## Positioning

The implemented mechanism is deterministic queue management with transparent before/after previews, not a remote AI service. Operators can compare alternative orders without mutating the live queue and cannot overwrite a newer revision with a stale proposal.

## Operating Context

A standard desktop or Android browser; one active printer in the standalone demonstration. Data is fictional and browser-local. People may need to inspect an original PDF/image, download Word documents, pause a printer, verify a pickup token, or record handover. Native document viewing, camera permission and physical printing depend on the browser/device.

## Capabilities and Constraints

React, strict TypeScript, Vite, Tailwind, React Router and local npm dependencies. Queue lifecycle: queued → printing → ready → collected. IndexedDB stores demo jobs/documents; localStorage holds light preferences. BroadcastChannel notifies same-origin tabs. No mandatory backend, credentials, API keys, external runtime assets, paid services, PWA or service worker. No production authentication, actual payment processing or cross-device synchronization. Integration must use the agreed future shared adapter, not a second authoritative data model.

## Brand Commitments

PrintQ name; indigo/violet and teal with white/soft-grey surfaces and semantic operational statuses from `3.txt`. Professional, legible and responsive operations. The landing request in `2.txt` explicitly asks for Three.js/WebGL custom dithering, organic displacement, particles and GSAP scroll choreography, with accessible graceful degradation. Landing style must not mislabel deterministic rules as AI.

## Evidence on Hand

Working source under `src/features/shopkeeper/`; fictional seeded jobs and locally generated sample PDF; actual workflow captures in `screenshots/`; executed checks in `VERIFICATION.md`. No customer testimonials, commercial adoption numbers, production-service benchmarks or physical-printer measurements have been supplied; do not invent them.

## Product Principles

- Changes must produce truthful, visible results and actionable errors.
- Preview and confirmation precede consequential priority changes.
- Preserve data identity, queue fairness and stale-revision protection.
- Keep the complete demonstration usable without external infrastructure.
- Visual spectacle is optional; direct operational routes must stay usable.

## Accessibility & Inclusion

Keyboard-accessible controls and modal focus management; readable contrast; no narrow-screen overflow; reduced-motion support. The portal supports English, Hindi and Kannada. The standalone landing has an English marketing narrative and must not alter portal language/theme preferences.
