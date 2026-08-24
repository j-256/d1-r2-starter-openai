# Cloudflare D1 + R2 starter for OpenAI Sites

Start building with a database and file storage already wired up.

This TypeScript starter for OpenAI Sites connects [D1](https://developers.cloudflare.com/d1/) and [R2](https://developers.cloudflare.com/r2/) behind a small, consistent API and includes an interactive storage console, schema migrations, tests, and deployment setup. Keep the included storage backends or swap either one without rewriting your routes or UI. Built with [Vinext](https://github.com/cloudflare/vinext).

> **Keep deployed Sites access-controlled.** This variant delegates authorization to the Sites access policy. Making a deployed Site public exposes its storage API until you add application-level authorization. See [Authorization](#authorization).

## Why start here

- **Swappable storage core.** Your routes talk to one provider-neutral `TextStore` contract, never to D1 or R2 directly. Swap adapters at a single seam (`storage/create-services.ts`) to target another SQLite-compatible database or object store, and the API and UI stay the same.
- **One explicit auth seam.** Every request passes an injected `Authorizer` before touching storage. This hosted variant injects `platformTrustAuthorizer`, which allows every request that reaches the Worker and delegates the real gate to the Sites access policy in front of it. That is safe only while the Site is access-controlled: making the Site public exposes the storage API. Harden by replacing the authorizer at that one seam (see [Authorization](#authorization)).
- **Schema truth lives in migrations.** Drizzle owns the schema; the adapters never `CREATE TABLE` at runtime, so the database can't drift from the code. A worked migration (`0001`) shows how to evolve it with a backwards-compatible column.
- **Tests run with zero install.** The core suite is buildless: no `node_modules`, no build step, so you can verify the storage contract before you deploy anything.

## Quickstart

This starter is already wired for OpenAI Sites. Edit the source under `app/`, then use ChatGPT Sites to save a reviewable version when a milestone is ready and deploy the approved version only when it is ready for its selected audience. For a local source project, Sites associates the saved version with the Git commit used for its build. Depending on the workflow, that build can happen in Sites or the workflow can supply an already validated artifact. The packaged migrations are applied before the new version receives traffic, so the hosted path has no manual migrate step.

For local iteration:

```bash
npm run dev          # start the Vite/Vinext dev server
npm test             # run the buildless core suite (no node_modules needed)
```

## Architecture

The core application depends on the provider-neutral `TextStore` interface in
`storage/contracts.ts`, not on Cloudflare bindings:

```text
HTTP route -> TextStore -> D1 or R2 adapter -> runtime binding
```

- `routes/text-store-route.ts` owns request parsing, validation, the
  authorization gate, and the stable HTTP response shape used by both resources.
  `app/api/d1/route.ts` and `app/api/r2/route.ts` are thin delegators that
  re-export it.
- `storage/contracts.ts` also defines an optional `contentType` on stored items;
  both adapters persist and return it (D1 in a column, R2 in object HTTP
  metadata), defaulting to `text/plain; charset=utf-8`.
- `storage/adapters/` contains the only D1- and R2-specific persistence logic.
- `storage/create-services.ts` is the composition seam. Swap the adapters here
  to target another SQLite-compatible database or object store without changing
  the API routes or UI.
- `storage/authorizer.ts` defines the provider-neutral `Authorizer` boundary
  (see Authorization below).
- `runtime/storage-context.ts` isolates the request-context bridge that passes
  the storage services and the request authorizer into Vinext route handlers.
- `worker/index.ts` is the platform composition root; application and storage
  contract modules do not import Cloudflare runtime APIs.
- `db/schema.ts` is the sole schema source of truth. The adapters do NOT create
  tables at runtime; the generated migrations under `drizzle/` own the schema and
  must be applied before first use (see D1 migrations).
- `.openai/hosting.json` declares the logical D1 and R2 binding names managed by Sites. The reusable template omits `project_id`; Sites adds it after provisioning the hosted project.

The core under `storage/`, `db/`, and `drizzle/` imports no platform APIs, so
the same product logic runs unchanged on another runtime; this repository wires
it to the hosted OpenAI Sites platform.

## Authorization

Every storage route calls an injected `Authorizer` (`storage/authorizer.ts`)
before touching D1 or R2. The provider-neutral core ships no default authorizer;
the composition root must supply one, so the decision is made in exactly one
place per variant.

This hosted variant injects `platformTrustAuthorizer` in `worker/index.ts`. It
returns `{ ok: true }` for every request and delegates the actual access
decision to the Sites access policy in front of the Worker.

> **Invariant: keep the Site access-controlled.** `platformTrustAuthorizer` is
> an allow-all authorizer at the application layer. It is safe only because the
> Sites access policy gates who reaches the Worker. If you set the Site to
> public, this variant becomes an open D1/R2 API: anyone can list, read, write,
> and delete stored data. Sign in with ChatGPT does not fix this on its own,
> because it establishes identity, not workspace membership or an allowlist.

To make the variant safe on a public Site, replace `platformTrustAuthorizer`
with a fail-closed check at the same seam (for example an authorizer that reads
`oai-authenticated-user-email` and checks it against an allowlist, denying when
the header is absent). The self-hosted Wrangler variant does exactly this with a
shared-secret authorizer.

## D1 migrations

The checked-in migration history intentionally includes one minimal evolution
example:

- `0000_complex_thena.sql` creates `d1_values`.
- `0001_add-content-type-demo.sql` adds a non-null `content_type` column with a
  backwards-compatible default, then inserts one idempotent `demo:migration`
  row so the applied migration is visible in the D1 explorer. The `content_type`
  column is real: it is part of the `TextStore` contract and is stored and
  returned by both adapters.

Timestamps are stored as ISO-8601 UTC (`strftime('%Y-%m-%dT%H:%M:%fZ','now')` as
the column default, matching the adapter's `new Date().toISOString()`), so
lexical ordering of `updated_at` equals chronological ordering.

Treat committed migration files as immutable history. Change `db/schema.ts`, run `npm run db:generate -- --name <descriptive-name>`, inspect the generated SQL, and add explicit data backfills only when the schema change requires them. The production build packages the full migration history under `dist/.openai/drizzle/`. Sites applies those migrations before the new version receives traffic.

If you self-host instead of using Sites, apply the migrations to your own D1
database before the first run so the `d1_values` table exists:

```bash
wrangler d1 migrations apply <DATABASE>
```

The compiler enables strict mode plus unchecked-index, exact-optional-property,
unused-code, implicit-return, fallthrough, and casing checks. Library declaration
files remain skipped because Vinext, Next.js, and Cloudflare own those external
types; all project TypeScript is still checked.

## Prerequisites

- Node.js `>=22.13.0`
- Linux with `flock`, `curl`, and GNU `timeout` (for the Sites build helpers)

## ChatGPT Sites workflow

Sites publishing has two stages: save a reviewable version, then deploy only the version approved for the intended audience. A saved version for a local source project is associated with the Git commit used for its build. Depending on the workflow, that build can happen in Sites or the workflow can supply an already validated artifact; do not assume every saved version runs `npm run build` remotely.

This starter does not use `wrangler.jsonc`.

`install:ci` is intentionally a single, non-retrying `npm ci`. It refuses a concurrent install for the same project. When `SITES_NPM_CACHE_SEED` points to a matching seeded cache, the script restores it and uses `--prefer-offline` while retaining registry fallback. Without a matching seed, it downloads and verifies the complete Vinext tarball recorded in `package-lock.json`. The script limits npm to one socket and terminates a stalled install. `build` applies a short timeout and then validates the Sites artifact. These helpers target Linux and use GNU `timeout`; they are not native macOS scripts.

Scripts that need writable project-scoped home, npm, XDG, and temporary paths use `scripts/sites-env.sh`. The `dev` and `start` scripts honor the caller's runtime environment and keep Wrangler logs inside the checkout. The generated `.sites-runtime/` directory is disposable and ignored by Git.

## Sites identity headers

Workspace-restricted Sites use ChatGPT identity to enforce their audience settings. After a visitor signs in, Sites forwards the authenticated email address to server-side code in `oai-authenticated-user-email`.

Sites may also provide `oai-authenticated-user-full-name` when the visitor's Sign in with ChatGPT profile has a non-empty name. The full-name value is percent-encoded UTF-8 and is accompanied by `oai-authenticated-user-full-name-encoding: percent-encoded-utf-8`.

Treat the full name as optional and fall back to email when it is absent:

```tsx
import { headers } from "next/headers";

export default async function Home() {
  const requestHeaders = await headers();
  const email = requestHeaders.get("oai-authenticated-user-email");
  const encodedFullName = requestHeaders.get("oai-authenticated-user-full-name");
  const fullName =
    encodedFullName &&
    requestHeaders.get("oai-authenticated-user-full-name-encoding") ===
      "percent-encoded-utf-8"
      ? decodeURIComponent(encodedFullName)
      : null;

  const displayName = fullName ?? email;
  // ...
}
```

## Optional Sites-managed Sign in with ChatGPT

Import the ready-to-use helpers from `app/chatgpt-auth.ts` when the Site needs optional or required Sign in with ChatGPT:

- Use `getChatGPTUser()` for optional signed-in UI.
- Use `requireChatGPTUser(returnTo)` for server-rendered pages that should send
  anonymous visitors through Sign in with ChatGPT.
- Use `chatGPTSignInPath(returnTo)` and `chatGPTSignOutPath(returnTo)` for
  browser links or actions.
- Pass a same-origin relative `returnTo` path for the destination after sign-in
  or sign-out. The helper validates and safely encodes it.
- Mark protected pages with `export const dynamic = "force-dynamic"` because
  they depend on per-request identity headers.

Sites owns `/signin-with-chatgpt`, `/signout-with-chatgpt`, `/callback`, the OAuth cookies, and identity header injection. Do not implement app routes for those reserved paths. Routes that do not import and call the helper remain anonymous-compatible.

Sign in with ChatGPT establishes identity only; it does not prove workspace membership. Use the Site's audience controls for workspace restrictions, or enforce explicit server-side membership or allowlist checks.

Use Sign in with ChatGPT for account pages, user-specific dashboards, saved records, and write actions tied to the current ChatGPT user. Leave public content anonymous.

## Diagnostic Commands

- `npm run install:ci`: perform the one bounded lockfile install
- `npm run dev`: start the Vite/Vinext development server
- `npm run build`: type-check, build, and validate the deployable Sites artifact
- `npm run start`: start the built Vinext application
- `npm run typecheck`: run the strict TypeScript compiler without emitting files
- `npm test`: run the buildless core test suite (storage adapters, migrations, and the route authorization gate) with no build step
- `npm run test:build`: run the full Sites build and artifact validation (Linux only; needs GNU `timeout`)
- `npm run validate:artifact`: recheck an existing artifact's manifest, packaged migration history, and ESM `default.fetch` export
- `npm run db:generate`: generate Drizzle migrations after schema changes

Run build and validation commands when you need local release evidence or are diagnosing a failed Sites version; they are not required after every edit.

`SITES_INSTALL_TIMEOUT`, `SITES_INSTALL_KILL_AFTER`, `SITES_BUILD_TIMEOUT`, and `SITES_BUILD_KILL_AFTER` are inputs to this repository's shell helpers; they do not configure Sites. Set them when invoking the helpers for a controlled canary. A timeout fails the command, and the helpers never retry an unchanged install or build.

## Learn More

- [OpenAI Sites documentation](https://learn.chatgpt.com/docs/sites)
- [vinext Documentation](https://github.com/cloudflare/vinext)
- [Drizzle D1 Guide](https://orm.drizzle.team/docs/get-started/d1-new)
