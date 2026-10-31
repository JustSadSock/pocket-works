# Pocket Cloud — account-owned sync for FOLIO, ЗАМАЗКА and РОЗКЛАД ТРОЯНД

Pocket Cloud is an optional, account-owned sync service in the existing Cloudflare
Worker. No separate R2 bucket, D1 database, subscription or OAuth scope is required.
It uses **SQLite-backed Durable Objects**, one independent object per verified
Pocket ID account (`POCKET_CLOUD`, migration `pocket-cloud-sqlite-v1`).

## Currently synced

- **FOLIO 1.5**: full editable multi-layer JSON documents, tool strokes, page
  metadata and previews. Save continues to local IndexedDB first, then cloud
  is updated in the background. A paper-style status/action strip in the
  album allows manual sync. Opening FOLIO on a second signed-in device
  downloads missing pages automatically.
- **РОЗКЛАД ТРОЯНД 1.2**: separate account-owned documents per episode (`episode-N`) and profile settings/nicknames (`profile`), with CAS revision checks, local-first autosave, account-scoped local data, and recoverable copies of same-episode conflicts. Both panel layout and offline/guest ratings remain available without sign-in.
- **ЗАМАЗКА 1.11**: local restoration archive (including saved brush strokes,
  selected artwork/variation and creation time) and separately the hand-drawn
  personal seal (editable strokes and raster preview). The archive merges
  entries from both devices, up to 96 displayed/restored entries. If the
  personal seal differs, the user explicitly selects a version; the replaced
  version is saved as a **locally recoverable backup**, accessible from the
  personal seal editor.

Current limitations: other games, PocketNet room canvases, FOLIO undo history,
and in-progress ЗАМАЗКА training drafts are not cloud-synced. These are not
promised as part of this release.

## Privacy and safety

- **No guest cloud uploads**. Offline/guest games and artwork still work locally.
- Every `/pocket-cloud/*` request passes the HttpOnly Pocket ID session check
  in the trusted Worker **before** routing to an account-specific Durable Object.
  Caller-supplied `x-pw-*` headers are discarded.
- Mutating requests require a matching Origin and JSON Content-Type (CSRF guard).
- A server-generated per-item revision and an expected `baseRevision` on writes
  and deletions prevent silent lost updates (`409 revision_conflict`).
- FOLIO keeps local versions as separate editable works when the cloud and local
  copy were changed independently. Item deletions create tombstones so another
  device cannot silently resurrect removed files.
- Local files remain in IndexedDB/localStorage when an upload fails, even
  if storage quotas, network connectivity or session validation fail.
- FOLIO does not automatically copy documents associated with a different
  Pocket ID into another account. A deliberate import confirmation is required.

## Initial quota / operational constraints

Per account: **16 MB** (16,000,000 bytes) of uploaded Base64-encoded payload; per item: **1 MB**
and 160 active item slots (deleted tombstones do not count against usage). Text JSON is compressed using
browser-native gzip when available, or Base64-encoded unchanged otherwise.
This is a first-stage small-artwork quota for an inexpensive deployment, not
large-file or professional media storage. A larger R2 object-store pipeline
can be added later without changing the public user identity.

## API

- `GET /pocket-cloud/usage`: authenticated, cross-app per-account usage including used/free/total bytes, active item slots, per-app totals and individual item titles/sizes (no payloads). Used by the Pocket ID profile meter.
- `GET /pocket-cloud/list?app=folio|zamazka|rose-ranking-15`: metadata, revisions,
  tombstones, size usage and quota. No content is exposed until a signed-in user
  calls `GET /pocket-cloud/item?app=...&id=...`.
- `POST /pocket-cloud/item?app=...&id=...`: conditional create/update with
  `{baseRevision,title,updatedAt,encoding,payload}`.
- `DELETE /pocket-cloud/item?app=...&id=...`: conditional delete
  `{baseRevision}` that retains a tombstone.

Transport/codec: `shared/capabilities/cloud.js`. App integrations live in
`apps/folio/cloud-sync.js`, `apps/zamazka/cloud-sync.js` and `apps/rose-ranking-15/cloud-sync.js`.
The cloud stores compressed editable projects, **not only PNG thumbnails**.

## Verification

Run in Wrangler local dev:

```sh
npx wrangler dev --local --port 8787
node pocket-cloud/test/edge.mjs
node shared/capabilities/cloud.test.mjs
```

These are also in the `PocketNet Edge` CI matrix, which tests storage isolation
between different Pocket ID accounts and between the two apps, stale-write
conflicts, tombstones, rejection of spoofed headers and CSRF.
