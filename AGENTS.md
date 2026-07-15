# AGENTS.md — Pocket Works

Pocket Works is a collection of installable, offline-first mobile web applications. Every app is a real product and every application task must remain isolated from concurrent work.

## 1. Concurrency and ownership

These rules are mandatory.

- Every app lives entirely in `apps/<slug>/` and remains independently runnable.
- An application PR may modify only one non-template directory: `apps/<slug>/**`.
- Do not modify another app.
- Do not modify root, `shared/`, `scripts/`, `.github/`, templates, dependencies or shell files in an application PR.
- If an app requires a platform capability, create a separate platform PR first. The app PR consumes the capability after it exists.
- Platform changes must carry the `platform-change` label. CI rejects mixed app/core changes without it.
- Never wait for another application PR merely to rebuild metadata. Independent app branches must remain mergeable in any order.
- Do not rebase repeatedly while waiting. Finish the app, push the branch, open a Draft PR early, pass available checks, mark it ready and use auto-merge.

## 2. Production hosting

Cloudflare Workers Builds is the only production hosting path.

- Production branch: `main`.
- Build command: `npm run deploy:site`.
- Deploy command: `npx wrangler deploy --assets ./dist-site/`.
- Worker configuration: `wrangler.jsonc`.
- Worker name: `pocket-works`.
- Production source of truth: the latest successful Cloudflare deployment from `main`.
- Application agents must not add, configure, reference or depend on alternative hosting providers.
- Hosting changes are platform work and must not be bundled into an application PR.

## 3. Self-registration contract

`apps/<slug>/app.config.json` is the only source of launcher metadata for an application.

- Do not create, edit or commit root `apps.json`.
- `apps.json` is generated into `dist-site/` during `npm run prepare:site`.
- `npm run registry:check` validates all manifests in memory and does not mutate the repository.
- `npm run new:app -- <slug> ...` creates only `apps/<slug>/`.
- The launcher path is derived as `./apps/<slug>/`.
- `slug`, `cacheName` and `storageNamespace` must be globally unique.
- `slug` must match the application directory.
- Sorting collisions in `order` are allowed; name provides the deterministic tie-breaker.

A visible app requires a valid `app.config.json` with:

- identity and copy: `slug`, `name`, `shortName`, `description`;
- release metadata: `version`, `releaseDate`, `releaseDateTime`, `changelog`;
- launcher metadata: `status`, `preset`, `accent`, `tags`, `order`;
- PWA metadata: `backgroundColor`, `themeColor`, `orientation`;
- isolation metadata: `cacheName`, `storageNamespace`;
- runtime metadata: `runtime`.

## 4. Branch and PR workflow

For a new app:

1. Start from the latest `main` in a dedicated branch or worktree.
2. Reserve a unique lowercase kebab-case slug.
3. Open a Draft PR early so ownership is visible.
4. Work only in `apps/<slug>/`.
5. Run app-specific tests and broader checks when practical.
6. Push the completed branch. Do not edit shared registry or hosting files.
7. Mark the PR ready after available checks pass.
8. Enable auto-merge or squash-merge the ready PR.
9. Resolve a conflict only when Git reports a real conflict.

For platform work:

1. Use a dedicated `infra/`, `platform/` or `shell/` branch.
2. Do not bundle a new app with the platform change unless unavoidable.
3. Add the `platform-change` label.
4. Preserve compatibility with existing applications.
5. Document the capability contract before app branches depend on it.

## 5. Repository boundaries

- App-specific CSS, assets, storage, cache logic and dependencies stay inside the app directory.
- Shared code belongs in `shared/` only when at least two real apps use it and the abstraction is stable.
- Prefer duplicating a tiny helper over creating a premature shared framework.
- The root launcher is a catalog, not an application framework.
- Never silently rename, move or delete an existing app.
- Never reuse another app's manifest ID, Service Worker scope, cache name, storage namespace or IndexedDB database.
- Never add a root dependency for one app without an explicit platform decision.

## 6. Required app structure

A typical Quick app:

```text
apps/<slug>/
├── app.config.json
├── index.html
├── styles.css
├── app.js
├── manifest.webmanifest
├── sw.js
├── README.md
├── icons/
└── assets/
```

Enhanced apps keep their source/build structure inside the same app directory. Empty directories are not required.

## 7. Product standard

A finished app includes:

- a clear primary purpose;
- a complete interaction loop;
- working controls with immediate visible feedback;
- loading, empty, error and completion states where relevant;
- local persistence for user-created state;
- installable PWA metadata;
- reliable offline loading after the first successful visit;
- touch-friendly controls and safe-area support;
- no placeholder copy, dead controls, fake settings or console errors.

Every visible control must work or be removed.

## 8. Design doctrine

Do not default to generic AI-generated interface patterns. Avoid unless the concept specifically requires them:

- dark purple/blue gradients with neon accents;
- glassmorphism as a default material;
- endless rounded cards and pills;
- giant decorative headings;
- fake charts and meaningless numbers;
- random red horizontal accents;
- black-and-gold premium styling;
- emoji as the primary icon system;
- identical geometry, navigation and palette across recent apps.

Before coding, define internally:

1. visual premise;
2. dominant geometry;
3. one memorable interaction or transition;
4. one deliberate visual constraint.

Each app must have its own visual language without sacrificing usability.

## 9. Interaction, motion and mobile ergonomics

- Design mobile-first with `100dvh`, `viewport-fit=cover` and safe-area insets.
- Keep critical targets approximately 44×44 CSS pixels or larger.
- Provide immediate pressed, dragged, success, failure and invalid-action feedback.
- Prefer direct manipulation where appropriate.
- Do not require hover.
- Do not hide essential controls behind undocumented gestures.
- Respect `prefers-reduced-motion`.
- Use motion to explain cause, consequence and spatial continuity.
- Do not delay functional actions for animation.
- Pause expensive loops while hidden or idle.

## 10. PWA and offline isolation

Every app owns its own:

- `manifest.webmanifest`;
- `sw.js`;
- install icon;
- manifest `id`, `start_url` and `scope` inside its directory;
- versioned cache namespace;
- local storage namespace;
- offline fallback strategy.

Cache only app-owned files and explicitly required shared files. Cache cleanup must be prefix-scoped and must never delete another app's data.

## 11. Engineering quality

- Prefer plain HTML, CSS and JavaScript for small apps.
- Use an Enhanced runtime only when the app genuinely benefits from it.
- Keep modules focused and names explicit.
- Separate state, rendering and input when complexity warrants it.
- Feature-detect optional browser APIs and provide usable fallbacks.
- Validate stored/imported data and fail safely.
- Remove abandoned experiments and debug UI before completion.
- Keep app-specific documentation in `apps/<slug>/README.md`.

## 12. Definition of done

An app is done only when:

- its main scenario works from first launch to completion;
- every visible control functions;
- its design is distinct and intentional;
- touch, safe areas and narrow screens work;
- refresh preserves expected state;
- offline reload works after one online load;
- manifest, cache and storage identifiers are unique;
- it does not modify or break neighboring apps;
- `app.config.json` passes validation;
- the app README is current;
- the PR changes only `apps/<slug>/**` unless explicitly labeled as platform work.

When forced to choose, ship one excellent mechanic rather than a broad pile of shallow features.
