# BlueMoon Fee Management System

Apartment-building fee management: React 19 + Vite frontend (`frontend/`), Spring Boot 4 / Java 21 backend (`backend/`), PostgreSQL with Flyway migrations. The API shape, DB column mapping and permission catalog are all derived at runtime from one checked-in OpenAPI file.

## Commands

Backend (run from `backend/`; `<repo>/backend/mvnw -f backend/pom.xml ...` also works):

```bash
./mvnw spring-boot:run                 # needs a reachable PostgreSQL and .env
./mvnw test                            # full suite on in-memory H2
./mvnw test -Dtest=SprintOneTests      # one test class
./mvnw test -Dtest=SprintOneTests#exactlyFiveRolesAndAuthorityCannotReadFinanceOrWriteResidence
./mvnw test -Dtest=FiveRoleMigrationTests,HealthServiceTests
```

`PostgresSprintOneTests` extends `SprintOneTests` and is skipped unless `TEST_POSTGRES_URL` is set; it creates and drops a throwaway schema:

```bash
TEST_POSTGRES_URL=jdbc:postgresql://localhost:5432/bluemoon_db \
TEST_POSTGRES_USER=postgres TEST_POSTGRES_PASSWORD=secret \
./mvnw test -Dtest=PostgresSprintOneTests
```

Frontend (inside `frontend/`): `npm ci`, `npm run dev`, `npm run build`, `npm run lint` (oxlint, config in `.oxlintrc.json`), `npm test` (`node --test src/utils/*.test.js` — validation helpers only, no component tests).

Database utility (repository root, Python 3, needs `pg_dump`/`pg_restore`/`psql` on PATH or `--pg-bin`):

```bash
python3 tools/backup_restore.py list
python3 tools/backup_restore.py backup
python3 tools/backup_restore.py restore <backup-file>
```

The controller generators (`tools/sync_sprint1_contract.py`, `tools/sync_model_diagrams.py`) are **not present** in this checkout. Controllers are still marked as generated and their headers name the missing script, so preserve the thin binding pattern and fix the generator before assuming regeneration is available.

## Configuration

`backend/src/main/resources/application.properties` imports `optional:file:./.env` and `optional:file:../.env`, so the backend works from either the repo root or `backend/`. `.env` uses **Java properties syntax** (no quotes, escape `\` as `\\`), not dotenv syntax. OS environment variables win over the file. `frontend/.env` holds `VITE_API_BASE_URL=/api` and `BACKEND_URL` (Vite proxy target). Vite serves on port 5173 with `strictPort`.

## Request pipeline (backend)

1. `SecurityConfig` registers a bearer filter that skips `/api/auth/login`, `/api/health`, `/api/hello`, resolves the `actor` request attribute from the `access_session` token hash, and writes `ApiErrors` JSON on failure. Sessions are stateless; CSRF is off.
2. `api/*Controller.java` (e.g. `api/FeesController.java`) are generated thin bindings that only call `SprintApi.execute("METHOD /path", ...)`. Treat them as generated output: keep the pattern, and prefer regenerating over hand-editing once the generator is restored.
3. `api/SprintApi` is the single boundary: it normalizes and validates the body, validates path/query/header parameters, enforces `x-permission`, wraps everything in a transaction, serializes mutations on the `business_lock` row, applies idempotency (`command_result`), writes `audit_log`, and formats `201 + Location` / PDF responses.
4. Reads are served generically by `service/ResourceViews` from `repository/DomainStore`; writes and business rules dispatch to the first matching `FeatureHandler` (`AccountHandler` owns `auth|users|roles`, `ResidenceHandler`, `BillingHandler`, `PaymentHandler`, `MaintenanceHandler`, and `ResidenceChangeService` itself), which delegates to a feature service. Adding a resource under a new first path segment means adding a handler in `service/` that returns `true` from `supports`, otherwise requests fall through to 404.

## Contract-first changes (most important convention)

`docs/api/openapi.json` is the source of truth for:

- routes, `x-permission`, status codes and request schemas — loaded at startup by `api/ContractMetadata` (mirrored into the classpath as `contract/openapi.json` by the `pom.xml` resource block pointing at `../docs/api`);
- request validation, implemented by `api/Contract.validate` (hand-rolled JSON-Schema subset: `$ref`, `oneOf`, `enum`, `not`, formats, length/bounds, `additionalProperties`). `spring-boot-starter-validation` is on the classpath but no `jakarta.validation` annotations are used — adding a DTO with `@Valid` would bypass this pipeline;
- table and column names — `ContractMetadata` snake-cases each schema and infers SQL types, and `DomainStore` builds all SQL from that allowlist. A field name in OpenAPI is therefore a column name requirement; `SprintOneTests#everyApiStorageFieldExistsInMigratedDatabase` fails if they diverge;
- the permission catalog seeded by `security/Bootstrap` from every distinct `x-permission` value.

So a new endpoint or field means: edit `docs/api/openapi.json` → add the controller binding by hand (the generator is missing) → add a **new** Flyway migration → implement/extend the handler+service → update `docs/api/endpoints.md`, `docs/api/design.md`, `docs/api/data-dictionary.md`. Never edit an already-applied migration (`V1`–`V4`); `V3__five_system_roles.sql` deliberately fails the upgrade if legacy roles such as `STAFF` still exist, and `V4` grants MANAGER the `user.read`/`user.write`/`user.manage` permissions.

`x-implemented` marks shipped operations (currently 94 of 146). The flag was previously maintained by the missing generator, so set it by hand alongside new bindings. Unimplemented operations still exist in OpenAPI and fall through to 404.

## Domain conventions

- The project is Vietnamese-facing: user-visible messages, README and most docs are Vietnamese; code identifiers and commit subjects are English. Keep new `ApiException` messages in Vietnamese.
- Errors always go through `ApiException(status, code, message)` and `GlobalExceptionHandler`; codes are stable (`PERMISSION_DENIED`, `INVALID_STATE`, `IDEMPOTENCY_CONFLICT`, `INSUFFICIENT_OUTSTANDING_BALANCE`, `BUSINESS_RULE_VIOLATION`, `DEPENDENCY_UNAVAILABLE`, …). Business-rule failures use 422 via `ApiException.rule`, illegal state transitions 409 via `ApiException.state`.
- Money, areas, quantities and dates travel as **strings** (`"150000.00"`, `"80.00"`, `"2026-11-06"`); use `Values.decimal`/`Values.money`/`Values.amount` with `BigDecimal`, never floating point. Business dates use `Values.today()` (Asia/Ho_Chi_Minh); timestamps are RFC 3339 UTC.
- Write request fields are normalized by `Contract.normalize` (trim, lowercase UUIDs, `*Id`/`*Ids` canonicalized). PATCH semantics: absent keeps, explicit null clears when allowed, empty body is 400.
- Optimistic concurrency: invoice line mutations require `If-Match: "<version>"` (missing → 400, stale → 409) and bump `invoice.version`. Record-mode payments require `Idempotency-Key`, stored with a SHA-256 fingerprint of actor + method + path + canonical body; replaying returns the stored status/body, a different fingerprint returns 409.
- Household scoping lives in `security/Actor.scoped()` + `ResourceViews.visible`: ADMIN/MANAGER/ACCOUNTANT/AUTHORITY are unscoped, RESIDENT data is limited to their active household memberships, and out-of-scope reads return 404 (not 403). `identityNo` is redacted unless the caller holds `resident.identity.read` or is the subject.
- Five system roles are fixed: `ADMIN`, `MANAGER`, `ACCOUNTANT`, `AUTHORITY`, `RESIDENT`. `POST /roles` cannot create roles, `ADMIN` keeps the whole catalog, `AUTHORITY` is restricted to read-only residence permissions.
- Passwords are BCrypt(cost 12) applied over a SHA-256 prehash (`IdentityService.hashPassword`) so long Unicode passwords are not truncated; login is rate-limited per IP+username. The bootstrap admin is created only when `app_user` is empty and `BOOTSTRAP_ADMIN_PASSWORD` is set.
- All mutations happen inside one `TransactionTemplate`, after `DomainStore.lockWrites()` takes the single `business_lock` row — services assume they are serialized and can read-modify-write freely.
- JSON snapshots (receipt, audit `beforeData`/`afterData`) are stored as `TEXT` for PostgreSQL/H2 portability, and secrets/`identityNo` are redacted before auditing.

## Frontend architecture

`App.jsx` uses `useState` for tab navigation — there is no router. `ErrorBoundary` wraps `AuthProvider`, which wraps the authenticated shell; `useAuth()` (`src/hooks/useAuth.js`, from `src/context/AuthContext.js`) exposes the current user, roles, permissions, household IDs and loading state. Startup validates a stored token against `GET /auth/me`.

All feature API modules (`src/api/apartments.js`, `fees.js`, `users.js`, `auth.js`) must go through the shared `api` Axios instance in `src/api/client.js`: it injects `Authorization: Bearer <token>` from `localStorage['bluemoon_access_token']` and clears the session on any 401 that is not `/auth/login` via `registerUnauthorizedCallback`. Bypassing it loses token handling and auto-logout.

Styling mixes legacy component CSS (`App.css`) with **Tailwind v4** through `@tailwindcss/vite`. `src/index.css` imports only `tailwindcss/theme.css` and `tailwindcss/utilities.css` **without Preflight** to keep the existing reset. Legacy unlayered CSS beats layered Tailwind utilities for the same property — remove the conflicting legacy rule when converting a component instead of expecting utilities to win.

Form validation lives in pure helpers under `src/utils/` (`apartmentValidation.js`, `feeValidation.js`) with `node:test` unit tests beside them; keep user-facing validation messages in Vietnamese and mirror the backend contract limits (e.g. `code` ≤ 20 chars, `areaM2` scaled to 2 decimals).

Permission checks in the UI only hide navigation/actions; the backend remains authoritative.

### UI completion review

Before considering any frontend UI task complete, inspect the rendered interface in a browser at desktop and mobile widths where practical. Do not rely on code/build checks alone. Review alignment and spacing across rows, columns, tables, and controls; clipping, overflow, wrapping, and density; whether every area is intentionally designed and its layout is appropriate; redundant content or actions (for example, avoid adding another password-change entry when one already exists unless there is a clear user-flow reason); consistency and suitability of icons; Vietnamese typography; visible focus and legibility; and loading, empty, error, and permission states relevant to the change. Verify interactive states/dialogs without performing destructive live actions. Compare the actual rendered UI with the intended design, correct defects within the requested scope, then re-check the changed screens. Preserve existing navigation, authentication, permissions, business behavior, and API contracts unless the request explicitly calls for changes. Report any states or viewports that could not be checked rather than claiming a complete visual review.

## Environment notes

- Linux/macOS: `backend/mvnw` must be executable. If git checkout produced mode `100644`, run `chmod +x backend/mvnw`.
- PDF receipts (`POST /receipts/{id}/pdf`) need a Unicode TTF. `ReceiptPdf` hardcodes `C:/Windows/Fonts/arial.ttf`, `/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf` and `/usr/share/fonts/truetype/liberation2/...`; on distros that place fonts elsewhere (e.g. Arch uses `/usr/share/fonts/TTF/`), set `PDF_FONT_PATH` in `.env` or the endpoint returns 503. Note the error message says `APP_PDF_FONT`, but the real property is `app.pdf.font` / `PDF_FONT_PATH`.
- Dirs moved since the README was written: current diagrams are `docs/BlueMoon_ERD.drawio` and `docs/BlueMoon_ERD_Overview.drawio`; `docs/BlueMoon_UML.drawio`, `docs/diagrams.md` and `docs/sprint-1-hiep.md` referenced by older docs do not exist.

## Tests

Backend tests are HTTP-level integration tests: `SprintOneTests` boots the app on a random port against H2 in `MODE=PostgreSQL` with a fixed bootstrap admin, then drives flows (`home()`, `draft()`, `payment()`, `user()`) through the real API. `BackendApplicationTests` covers hello/health/CORS, `HealthServiceTests` asserts a DB outage yields 503 and `database=DOWN`, `FiveRoleMigrationTests` pins the role migration behavior. Prefer extending these fixtures over mocking services, because validation, permissions and idempotency only exist at the HTTP boundary.

Frontend has no component test runner. Only the pure validators are covered: `npm test` runs `node --test src/utils/*.test.js` (`apartmentValidation.test.js`, `feeValidation.test.js`). Put new validation logic in `src/utils/` so it stays unit-testable.

Git history follows Conventional Commits with a scope (`feat(backup):`, `test(sprint):`, `docs(api):`, `fix(erd):`).
