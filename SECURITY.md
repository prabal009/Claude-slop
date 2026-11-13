# PrintQ security

## Scope
Browser-local hackathon demonstration, not a production access-control or payment system. All bundled shop, job, document and history records are fictional. No authentication, credentials, `.env`, backend, external conversion API, remote AI, cloud database, payment gateway, service worker or install manifest.

## Controls
- React text rendering escapes document names and instructions. No untrusted HTML injection or document execution.
- The local service validates persisted snapshots and mutations. The portal also validates snapshots supplied by an injected integration adapter. Invalid records produce an error rather than silent success or a destructive automatic reset.
- Job lifecycle is queued → printing → ready → collected. A single active printing job is supported. Pickup requires a matching ready token and explicit confirmation. Invalid transitions, repeated pickup and stale revisions are rejected.
- Priority, optimization, simulation and printer changes use confirmation. IndexedDB transaction revision checks prevent stale writes; tab messages only request a fresh persistent read.
- Files are browser-local IndexedDB blobs, not publicly exposed static uploads. Supported formats are PDF, DOC, DOCX, JPG/JPEG and PNG. Size/type/signature and quality checks are advisory, not antivirus. Word files offer metadata/download, not an invented conversion preview. Object URLs are temporary and cleaned up.
- Camera scanning uses a locally installed QR decoder. Permission denial and unsupported cameras leave manual lookup available. QR contains a version and token, not document contents or personal information.
- Numeric ranges, identifiers, job settings and stored data are validated. Preference access failures are reported; storage failures do not masquerade as persisted success.
- No runtime CDN JavaScript or required external services. Lockfile included. `npm audit --json` initially reported zero vulnerabilities; this is time-specific, not a guarantee of future safety.

## Remaining risks
1. **No authorization.** Anyone able to open the origin/profile can open `/shopkeeper` and use its controls. Frontend routes are not a security boundary.
2. **Local storage is not encrypted or tamper-proof.** Same-origin scripts, browser extensions, malware and device users may read or modify data. Validation does not authenticate authorship. Use fictional documents only.
3. **Tokens are bearer references, not signed proof of identity.** Demo tokens are deliberately predictable for judging. Production requires unpredictable, server-verified, expiring credentials and atomic redemption. Do not treat possession of a demo token as identity.
4. **File inspection is limited.** Valid headers cannot establish safety, renderability or absence of embedded threats. Browser PDF/image rendering depends on the browser. Password/encryption detection is advisory where feasible. DOC/DOCX are never executed by the application.
5. **Browser persistence may be cleared or evicted.** Private mode, browser policy, disk limits and user actions can destroy local data. This demo has no remote backup, cross-device sync or recovery service.
6. **Camera needs a secure context.** Use localhost or HTTPS. Plain HTTP LAN access may disable camera; manual token lookup still works.
7. **Integration is not verified against a Student Portal.** No Student Portal or authoritative shared implementation was supplied. The typed adapter boundary must be connected and tested by the integration owner.

## Deployment guidance
Configure SPA fallback for `/shopkeeper/*`; serve locally bundled assets over HTTPS. Use server-side authentication/authorization before handling real orders. Enforce request/file limits, authorization per document, malware scanning, signed pickup tokens, audit trails, backups and authoritative transaction ownership on the server. Do not claim this frontend supplies those protections.

Suggested production HTTP headers (adapt to the chosen document renderer):

```text
Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data:; font-src 'self'; connect-src 'self'; media-src 'self' blob:; frame-src 'self' blob:; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'
Permissions-Policy: camera=(self), microphone=(), geolocation=()
Referrer-Policy: no-referrer
X-Content-Type-Options: nosniff
```

`unsafe-inline` styles accommodate React chart layout and animation transforms. The policy above is a portal baseline, not a ready-to-copy policy for the new single-file landing: its inline scripts require exact content hashes or a server-generated nonce, and embedded font data (if present) requires `font-src data:`. Generate hashes from the final deployed HTML after Vite transformations; changing script bytes changes the hash. Do not broadly allow inline scripts just to bypass a policy failure. Some native PDF viewers need adjusted frame/object policies: test the chosen browser rather than weakening every policy. Development Vite HMR requires its local WebSocket connection; the header above targets production.

## Reporting
Do not put real documents, student records, QR contents or secrets in bug reports. Report the failing operation, browser version and a fictional reproduction. Review `npm audit` and upgrade affected dependencies without force-installing incompatible versions.
