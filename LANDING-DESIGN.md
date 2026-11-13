# PrintQ single-file landing

Authoritative source: **`index.html`**. Replaces the older React landing. The root page has inline CSS, classic JavaScript, WebGL shaders and all visual assets. It works when opened directly as a file; no fonts, libraries, images or APIs are fetched. The existing `/shopkeeper/*` React portal remains a separate hosted workflow loaded by a guarded inline module bootstrap.

## 1. Aesthetic Foundation

Campus printing, rendered as ink and folded paper. Indigo/deep blue, teal, soft paper and restrained pink are the surface roles. Layered gradients, procedural halftone, printed lines and wavy paper replace the old restrained flat hero. Typography uses an intentional local Trebuchet MS/Arial stack to avoid a single external dependency. No invented clients, testimonials, AI claims or commercial performance metrics.

## 2. Hero Section Design

“Campus printing. Without the chaos.” stays a semantic two-line h1. A temporary Canvas2D text mask is uploaded to WebGL; the fragment shader gives the actual lettering subtle fluid displacement and an ink-color blend. The DOM headline becomes visually transparent only after successful GPU rendering. An organic folded-paper SDF scene, registration marks and procedural particles occupy the lower hero. Both portal and queue-demo actions remain normal HTML links.

## 3. Scroll Narrative

Five sections: hero; independent urgent-priority queue simulation; interactive four-stage printing workflow; asymmetric operational-feature showcase; combined FAQ/closing invitation/footer. Queue controls show real arithmetic. Workflow tabs change both explanation and sample ticket state. Feature disclosures and pointer response expose real portal tools. FAQ disclosures answer limitations instead of adding fabricated social proof. Navigation remains native; no scroll hijacking.

## 4. Component Specifications

Normal links and buttons, explicit disabled states, minimum touch targets, visible focus, native details/summary, and roving-tabindex workflow tabs. Queue controls include Preview urgent move, Before/After, Confirm in simulation and Reset demo. The Apply operation changes only component-memory demonstration records. An offline portal link displays actionable instructions instead of attempting a nonexistent file route.

## 5. Shader Behaviors

One full-screen triangle renders the hero. A Canvas2D alpha texture carries the headline. The GLSL fragment shader mixes indigo/teal ink fields, sinusoidal interference, three warped rounded-box paper ribbons, printed-line patterns, registration rings, 24 procedural flecks, and pixel-scale dithering. Pointer input shifts paper and waves gently. The fallback is fully authored HTML/CSS gradient paper, not a missing black canvas.

## 6. Interaction Patterns

Queue duration: `1 + pages × copies × (bw ? 0.4 : 0.8)` minutes. In the original example, moving Lab handout first saves it 19.6 minutes and delays Thesis draft/Studio portfolio by 3.4 minutes each; total workload stays 23.0 minutes. The already-first case reports no change and disables confirmation. Workflow arrows/Home/End select stages; FAQ uses native keyboard behavior. Global Pause/Resume affects decorative effects for the current visit only.

## 7. Responsive Strategy

At narrow widths, coarse-pointer devices, low-core hardware or data-saving connections, WebGL gives way to static paper geometry while controls remain usable. Resizing and capability changes re-evaluate the rendering mode. Desktop buffer is capped at 1.5 device-pixel ratio and 1800×1300; mobile fallback needs no GPU draw loop. Reduced-motion leaves visuals still, keeps semantic content and preserves the entire journey. No horizontal overflow was observed at 320px or 390px.

## 8. Technical Architecture

The classic inline startup script exits immediately on `/shopkeeper` paths after hiding `#landing` and revealing `#root`. The inline module then imports `src/main.tsx`, which contains only the operational router. The landing has no React, IndexedDB, localStorage, third-party script or runtime font dependency. Vite transforms the conditional portal bootstrap for hosted builds; the source HTML itself is the standalone copy-paste deliverable.

One rAF scheduler renders only when visible, in view, unpaused and allowed by reduced-motion. Resize creates a text texture outside the frame loop; no new frame buffers/objects are allocated per tick. WebGL compile/link errors, context loss and unsupported devices reveal the normal headline and static scene. GPU resources/observers are released on pagehide and restored for bfcache navigation. The target is smooth motion, not an unmeasured 60fps guarantee.

## 9. Developer Handoff

Copy all of `index.html` into a new `.html` file and open it for the complete landing demonstration. To use actual jobs, run `npm install`, `npm run dev` and follow a Shopkeeper link. A direct file-mode portal click tells the visitor to serve the project. All five sections and their scripts have source comments. The older `src/features/landing/` implementation and its no-longer-used font packages were removed; no second landing convention remains.

Production CSP must hash/nonce the final inline scripts; see SECURITY.md. Hosted portal features still need their bundled React assets; they are intentionally not claimed as a one-file portal. All landing illustrations are code-generated, with no raster provenance or network assets required.

## Verification

Current implementation: successful initial strict TypeScript/Vite build and all 59 portal regression tests passed. Actual browser checks covered offline file operation with zero subresources, queue preview/confirmation/reset/comparison, the no-change case, keyboard workflow navigation, FAQ disclosure, pause, reduced-motion, 320/390px layout, live WebGL desktop and forced context-loss fallback. Final hosted-portal cutover and screenshots are recorded in VERIFICATION.md after production verification.
