# PrintQ Agent Guide

## Constraints and Architecture

- **Product scope**: Combined campus printing operations app with public landing (`/`), open-signup Student Portal (`/student/*`), invite-gated Shopkeeper Portal (`/shopkeeper/*`), and same-origin auth (`/login`, `/signup`, `/shopkeeper/access`). No LLM inference workload, payment processing, or physical printer control exists.
- **Authoritative scheduling**: `src/features/shopkeeper/services/engine.ts` (`Asia/Kolkata` in integrated mode) is the single source of truth for pricing, printed sides, queue order, urgency placement, and ETA windows. Never duplicate or override server ETAs in Student clients.
- **Token and QR contract**: `src/shared/printq/pickupCodec.ts` (`printq:v1:<token>`, `PQ-YYYY-NNNN` fixtures + `PQ-<UUIDv4>` connected tokens, 160-char bound). Camera scanning requires `printq:v1:`; manual entry accepts either.
- **Security and privacy**: First-party HttpOnly mapped Better Auth cookies (`server/auth/proxy.ts`), DB-backed role authority (`printq.users`), single-use SHA-256 Shopkeeper invites (`scripts/create-shopkeeper-invite.ts`), private S3 presigned uploads validated server-side at commit, and HMAC opaque queue aliases for other students' jobs. Never expose `.env`, secrets, document blobs to non-owners, or Student local PII across accounts.
- **Mode separation**: Complete cloud variables select `cloud` mode (`Postgres` + `S3` + `Neon Auth`); all cloud variables absent in local dev select explicit `demo` mode (`printq-integrated-demo-v1` IndexedDB); partial cloud configuration or missing production variables fail fast at startup. Disconnected cloud never silently switches to local demo.

## Authoritative File Map

| Area | Path | Purpose |
| --- | --- | --- |
| Entry & Landing | `index.html`, `src/main.tsx` | Inline 5-section landing + route bootstrap, React router & role guards |
| Auth UI & Context | `src/features/auth/` | Session provider, `/login`, `/signup`, `/shopkeeper/access`, `printq.auth.v1` tab sync |
| Shared Domain | `src/shared/printq/` | `policy.ts`, `pickupCodec.ts`, `mutations.ts`, `workspace.ts` projection |
| Workspace Adapters | `src/shared/workspace/` | `CloudWorkspace.ts` (HTTP/SSE) and `DemoWorkspace.ts` (integrated IDB) |
| Context Export | `src/shared/context/export.ts`, `scripts/export-context.ts` | Allowlisted snapshot projection + TOON (`@toon-format/toon`) & `o200k_base` token CLI |
| Student Portal | `src/features/student/` | Student workflow UI, `SharedServiceAdapter`, `LocalDemoAdapter`, standalone tests |
| Shopkeeper Portal | `src/features/shopkeeper/` | Shopkeeper UI, `engine.ts`, `validation.ts`, `localService.ts`, standalone tests |
| Express Server | `server/` | `index.ts`, `app.ts`, `config.ts`, `auth/`, `db/`, `storage/`, `workspace/`, `routes/` |

## Commands

```sh
npm run dev                  # Concurrent Express API + Vite dev server
npm run typecheck            # Browser (tsc -b) + server/scripts (tsconfig.server.json)
npm run test                 # Finite Vitest unit & component suite (no live infra)
npm run test:integration     # Real Postgres + S3 integration gate (vitest.integration.config.ts)
npm run build                # Typechecks + Vite dist/ + esbuild dist-server/index.js
npm start                    # Production Express server (--production, PORT on 0.0.0.0)
npm run preview              # Production server check on port 4173
npm run invite:shopkeeper -- --out <private-absolute-path>
npm run context:export -- --input <snapshot.json> --format toon|json --output <path>
```

## Detailed References

- Operational overview, routes, and walkthrough: `README.md`, `DEMO.md`
- Portal service contracts and state invariants: `INTEGRATION.md`
- Security controls, headers, and residual risks: `SECURITY.md`
- Visual system and landing design: `DESIGN.md`, `SHOPKEEPER-DESIGN.md`, `LANDING-DESIGN.md`
- Executed verification evidence: `VERIFICATION.md`
- Original supplied task specifications (preserved): `1.txt`, `2.txt`, `3.txt`
