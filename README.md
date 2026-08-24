# D1 + R2 starter for ChatGPT Sites

Start with a working D1 + R2 feature you can understand, run, and reshape.

This TypeScript starter pairs queryable metadata in [Cloudflare D1](https://developers.cloudflare.com/d1/) with binary file content in [Cloudflare R2](https://developers.cloudflare.com/r2/). Its document library is a thin but real example: upload, search, download, and delete files through one tested feature boundary, then keep it or replace it with your own data model. Built with [Vinext](https://github.com/cloudflare/vinext) for [ChatGPT Sites](https://learn.chatgpt.com/docs/sites).

The platform shell is data-model-neutral. `features/documents/` is the deliberately concrete example that shows how D1 and R2 work together.

Prefer a direct Cloudflare Worker managed with Wrangler? The [Wrangler + Hono edition](https://github.com/j-256/d1-r2-starter-wrangler) is maintained as a first-class peer with the same application core.

> **Keep deployed Sites access-controlled.** This edition delegates authorization to the Sites audience policy. Making a Site public also exposes its document API until you add application-level authorization. See [Authorization](#authorization).

## What you get

- **A useful vertical slice.** D1 stores searchable document metadata while R2 stores the original binary bytes and content type.
- **A replaceable feature, not a prescribed schema.** Routes and persistence live behind `DocumentService`, `DocumentRepository`, and `ObjectStore` contracts. The [Change the data model](#change-the-data-model) section maps the intended seams.
- **Two first-class runtime editions.** This Sites/Vinext interface and the Wrangler/Hono interface use the same feature, validation, persistence, HTTP semantics, migrations, and tests. Only runtime composition, routing glue, authorization policy, and UI are edition-specific.
- **Explicit cross-store behavior.** Upload and delete order, cleanup, missing-object handling, limits, and error responses are visible in one small service instead of being hidden in framework code.
- **Buildless core tests.** The shared suite runs with Node's built-in test runner and SQLite support, without a framework build.

## Quickstart

This edition is wired for ChatGPT Sites. For local iteration:

```bash
npm ci
npm run dev
```

Run the shared feature tests at any time:

```bash
npm test
```

When a milestone is ready, ask ChatGPT to save a reviewable Site version. Deploy that saved version only when it is ready for the selected audience. Sites associates a local source version with the Git commit used for its build, and the packaged D1 migration is applied before the new version receives traffic.

## Document API

All endpoints share the same request and response semantics in both editions:

| Method | Path | Behavior |
| --- | --- | --- |
| `GET` | `/api/documents?q=<name>` | List recent documents, optionally filtering by filename |
| `POST` | `/api/documents` | Upload multipart field `file` with optional text field `description` |
| `GET` | `/api/documents/:id` | Download the original binary content |
| `DELETE` | `/api/documents/:id` | Delete the object and metadata; repeated deletes still succeed |

Uploads are bounded by the example's named limits in `features/documents/contracts.ts`. Adjust those limits as part of adapting the feature to your product.

## Architecture

```text
Sites + Vinext route
        |
        v
shared Web Request/Response handlers
        |
        v
DocumentService
   |             |
   v             v
D1 metadata    ObjectStore -> R2 bytes
```

- `features/documents/` owns the document contracts, validation, HTTP behavior, D1 repository, schema, and coordination service.
- `platform/` owns the narrow runtime-facing contracts for Cloudflare bindings, object storage, authorization, and request context.
- `app-context.ts` and `app-services.ts` carry app-specific request state and compose the example feature with D1 and R2, leaving the lower-level platform modules independent of the document model.
- `app/api/documents/` contains thin Vinext route delegates. The Wrangler edition mounts the same handlers through Hono.
- `worker/index.ts` supplies Sites-specific bindings and authorization policy while preserving Vinext's asset and image handling.
- `db/schema.ts` exports feature schemas, and `drizzle/` contains the migration history applied before application code depends on it.
- `test/` exercises the shared feature against fakes and an in-memory SQLite database, including binary data that is not valid UTF-8.

The shared handlers use standard `Request` and `Response` objects, so feature behavior is not coupled to Next.js route helpers or Hono context objects.

## Cross-store consistency

D1 and R2 do not share a transaction, so `DefaultDocumentService` makes the policy explicit:

- Create writes the R2 object first, then inserts D1 metadata. If the D1 insert fails, it attempts to remove the new object.
- Delete removes the R2 object first, then deletes D1 metadata. If the metadata delete fails, retrying repeats the object deletion and attempts the remaining metadata cleanup again.
- Download treats D1 metadata whose R2 object is missing as a consistency error, not a successful empty file.

These choices fit this small example. Revisit them if your product needs background repair, versioning, large streaming uploads, audit history, or a stronger delivery guarantee.

## Change the data model

You do not need to reshape your product into `DocumentMetadata`. Treat the document library as a worked feature module:

1. Add or replace a directory under `features/` with your domain types, service, validation, persistence, and shared HTTP handlers.
2. Export its Drizzle tables from `db/schema.ts`, then run `npm run db:generate -- --name <descriptive-name>` and inspect the SQL.
3. Compose the feature's repository and storage dependencies in `app-services.ts`.
4. Keep each runtime route thin by delegating standard `Request` objects to the shared handlers.
5. Build an interface native to each edition while keeping the feature contracts and behavior shared.

If the document model fits but the provider does not, implement `DocumentRepository` or `ObjectStore` and change only the composition in `app-services.ts`. If your app needs several domain features, add them beside `features/documents/` and expose each service through `AppServices`.

## Authorization

Every document handler calls an injected `Authorizer` before parsing a request or touching storage. The feature supplies no default authorization policy; each runtime composition root must choose one.

This Sites edition injects `platformTrustAuthorizer` in `worker/index.ts`. It allows every request that reaches the Worker because the Site's audience setting is expected to gate access upstream.

Keep the Site limited to its intended audience while using that policy. A public Site is accessible without ChatGPT workspace access, and Sign in with ChatGPT establishes identity rather than granting application permissions. Before publishing publicly, replace `platformTrustAuthorizer` with a fail-closed server-side policy such as an authenticated-email allowlist. The Wrangler edition demonstrates a fail-closed bearer-secret authorizer at the same seam.

## D1 migrations

`drizzle/0000_create-documents.sql` creates the document metadata table and indexes. Treat committed migrations as immutable history. Change a feature schema, generate a descriptively named migration, inspect its SQL, and add explicit backfills when a schema change requires them.

The production build packages migrations under `dist/.openai/drizzle/`. Sites applies the packaged history before the new version receives traffic. If you adapt this project for direct Wrangler deployment, apply its migration history to that D1 database before the application first uses the schema.

## ChatGPT Sites workflow

Sites publishing has two stages: save a reviewable version, then deploy an approved version to its production URL. A local source version is associated with the Git commit used for its build. The build can happen in Sites or the workflow can supply an already validated artifact.

The reusable template's `.openai/hosting.json` declares `DB` and `BUCKET` without a `project_id`. Sites adds the project ID after it provisions the hosted project.

`install:ci` is the Linux Sites-build installer. It performs one bounded `npm ci` and refuses a concurrent install for the same project. When `SITES_NPM_CACHE_SEED` points to a matching seeded cache, it restores that cache and retains registry fallback. Local development does not need that specialized installer; use `npm ci` on macOS or Linux.

`build` runs a bounded Vinext build and validates the Worker entry point, hosting manifest, and packaged migration. It works on macOS and Linux when GNU `timeout` is available. The Linux-only `install:ci` additionally uses `flock`, `curl`, `sha256sum`, and `/proc`. The `SITES_INSTALL_TIMEOUT`, `SITES_INSTALL_KILL_AFTER`, `SITES_BUILD_TIMEOUT`, and `SITES_BUILD_KILL_AFTER` variables configure the repository scripts, not the Sites platform.

## Optional Sites-managed Sign in with ChatGPT

`app/chatgpt-auth.ts` provides helpers for optional or required identity-aware experiences:

- `getChatGPTUser()` reads an optional signed-in visitor.
- `requireChatGPTUser(returnTo)` redirects an anonymous visitor through Sign in with ChatGPT.
- `chatGPTSignInPath(returnTo)` and `chatGPTSignOutPath(returnTo)` create browser destinations.

Sites owns `/signin-with-chatgpt`, `/signout-with-chatgpt`, `/callback`, the OAuth cookies, and identity header injection. After sign-in, server-side code receives `oai-authenticated-user-email` and may receive `oai-authenticated-user-full-name`. Treat the full name as optional and fall back to email.

Use the Site's audience controls for workspace restrictions, or enforce an explicit server-side membership or allowlist check. Do not treat sign-in alone as authorization.

## Commands

- `npm run install:ci`: perform the Linux-only bounded lockfile install used by Sites builds
- `npm run dev`: start the Vite/Vinext development server
- `npm run build`: typecheck, build, and validate the Sites artifact
- `npm run start`: start the built Vinext application
- `npm test`: run the shared buildless feature suite
- `npm run typecheck`: check project TypeScript without emitting files
- `npm run lint`: run ESLint
- `npm run test:build`: run the full Sites build and artifact validation
- `npm run validate:artifact`: validate an existing Worker artifact, hosting manifest, and packaged migration
- `npm run db:generate`: generate Drizzle migrations after schema changes

## Prerequisites

- Node.js `>=22.13.0`
- GNU `timeout` for the bounded verified build; on macOS it is available from GNU coreutils
- Linux with `flock`, `curl`, `sha256sum`, and `/proc` only when running the Sites `install:ci` helper outside its build environment

## License

MIT. See `LICENSE`.

## Learn more

- [ChatGPT Sites documentation](https://learn.chatgpt.com/docs/sites)
- [Vinext](https://github.com/cloudflare/vinext)
- [Cloudflare D1](https://developers.cloudflare.com/d1/)
- [Cloudflare R2](https://developers.cloudflare.com/r2/)
- [Drizzle D1 guide](https://orm.drizzle.team/docs/get-started/d1-new)
