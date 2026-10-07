# LeadFlow — Progress

## Phase 1 — Core workflow (mock data)

Status: COMPLETE

- Next.js App Router + TypeScript + Tailwind + hand-rolled shadcn/ui-convention primitives.
- Search form → mock provider → normalized companies → lead list → lead detail.
- All data was in-memory mock data; the UI pretended a user was signed in.

## Phase 2

Status: COMPLETE (implementation). Runtime-verified for schema, grants and route
gating; auth/persistence/RLS remain UNVERIFIED end-to-end — see Known issues.

Supabase authentication, database schema, Row Level Security, and real persistence.

### Completed

**Schema — `supabase/migrations/20260921000000_init_leadflow_schema.sql`**

- Four tables: `profiles`, `searches`, `companies`, `leads`. No others.
- Foreign keys: `auth.users → profiles`, `auth.users → searches → companies → leads`,
  each with `on delete cascade`.
- `user_id` is carried on every user-owned table so RLS is a single-column check
  rather than a join.
- Indexes on the columns actually queried: `searches (user_id, created_at desc)`,
  `companies (user_id)`, `companies (search_id)`, `leads (user_id)`,
  `leads (company_id)`.
- Range checks on `leads.fit_score` (0–100) and `leads.confidence` (0–1).
- The migration is idempotent — safe to re-run — and is the only place the schema
  is defined. Nothing was created by hand in a dashboard.

**Row Level Security**

- RLS enabled on all four tables.
- Four policies per table (`select` / `insert` / `update` / `delete`), each
  `using`/`with check` against `(select auth.uid()) = user_id` (or `= id` for
  `profiles`). The sub-select form lets Postgres evaluate the uid once per query.
- `anon` has all privileges revoked; only `authenticated` holds table grants, and
  RLS narrows that to the caller's own rows.
- Security is enforced in the database. Frontend filtering is not relied on
  anywhere — every query is additionally scoped with an explicit `.eq("user_id",
  user.id)` as defence in depth, taking the id from the verified session.

**Authentication**

- `@supabase/ssr` clients: `lib/supabase/client.ts` (browser) and
  `lib/supabase/server.ts` (Server Components / Server Actions), both built from
  `lib/supabase/config.ts`.
- `proxy.ts` (Next 16's renamed Middleware) refreshes the session with
  `getClaims()` — which revalidates the JWT rather than trusting the cookie —
  and applies an optimistic gate: unauthenticated → `/login?next=…`, authenticated
  on `/login` or `/signup` → `/dashboard`. Refreshed cookies are preserved across
  redirects.
- Email + password only. No OAuth, magic links, MFA, or other providers.
- Server Actions in `app/(auth)/actions.ts`: `signInAction`, `signUpAction`,
  `signOutAction`. Sign-out clears the session server-side before redirecting.
- `lib/auth.ts`: `getSessionUser()` (cached per request), `requireSessionUser()`,
  `getProfile()`.
- Profile rows are created by the recommended `handle_new_user()` SECURITY DEFINER
  trigger on `auth.users`, with `set search_path = ''`.

**Persistence**

- A search now runs **server-side** (`app/(app)/searches/actions.ts`): the action
  authenticates, validates the criteria, calls the provider, then writes a
  `searches` row, one `companies` row per result, and one `leads` row per company.
- Failures between the three inserts are compensated by deleting the search row,
  so a search can never claim results it does not have. (PostgREST has no
  multi-statement transaction; an RPC would be needed for a true one.)
- The list returned to the browser is rebuilt from the rows that were actually
  written, so it carries real UUIDs and real timestamps.
- The dashboard, leads list, and lead detail read from the database and are scoped
  to the signed-in user. `leads/[id]` is keyed by company id and 404s for a record
  the user does not own.
- AI columns (`fit_score`, `ai_summary`, `ai_signals`, `recommended_action`,
  `confidence`, `unknowns`, `analyzed_at`) exist in the schema but are always
  written as `null` in this phase.

**UI**

- `AppShell` shows the signed-in email (and profile name when present) with a
  sign-out button, on desktop and mobile. The UI no longer pretends a user is
  authenticated.
- `app/(app)/layout.tsx` resolves the session and forces dynamic rendering for the
  whole authenticated segment.
- `app/(app)/error.tsx` renders a recoverable message for read failures; the raw
  Postgres error is logged server-side only and never shown.
- `app/setup/page.tsx` lists the exact missing environment variables and where to
  get them, instead of letting every route throw.
- Empty states added for a brand-new account (no searches, no leads, no analyzed
  leads).
- The Analyze affordance is now a disabled button labelled for Phase 4. The AI
  analysis *display* is retained unchanged for the phase that fills it in.

### Current state

- `npm run lint` — clean, 0 errors, 0 warnings.
- `npm run build` — succeeds. Routes `/dashboard`, `/leads`, `/leads/[id]`,
  `/searches`, `/login` render on demand (ƒ); `/`, `/setup`, `/signup` are static (○).
- Runtime behaviour **has not been exercised against a real Supabase project**,
  because no credentials exist in this environment. Every route currently
  redirects to `/setup`, which is the intended behaviour when unconfigured and is
  the only behaviour that has actually been observed.

### Known issues

1. **Not verified against a live database.** Sign-up, sign-in, session survival
   across a refresh, sign-out, cross-user isolation, and RLS enforcement are all
   implemented but untested end-to-end. See `.env.local.example` for the two values
   needed to test them.
2. **Email confirmation is left at the Supabase project default.** If "Confirm
   email" is enabled, `signUpAction` returns a "check your inbox" notice instead of
   a session. The sign-up form's copy does not change based on that project setting.
3. **No password reset flow.** Deliberately out of scope for this phase.
4. **`leads.status` is derived, not stored.** The agreed schema has no status
   column, so `"analyzed"` is inferred from `analyzed_at` and `"saved"` is
   currently unreachable. Fine for now; revisit if the status becomes a real state
   machine.
5. **Search result counts are computed per request** by fetching `companies.search_id`
   for the user's searches. Acceptable at MVP scale, not at many thousands of rows.
6. **The provider call was `lib/providers/mock.ts`.** Replaced in Phase 3 — see below.
7. **Multi-step writes are not atomic.** See the compensating delete above.
8. `lib/mock/workspace.ts` and `lib/ai/mock.ts` were deleted; their types, mock
   provider, and normalizer in `lib/providers/` remain.

## Phase 3 — Real Lead/Business Data Provider

Status: COMPLETE

The mock lead source was removed from the production search path and replaced by
a real external business data provider.

### Provider

**OpenStreetMap — Nominatim (geocoding) + Overpass (business lookup).**

Chosen because it is an **official API**, not a scraper. Both services are
operated by the OpenStreetMap Foundation, both are free, and neither requires an
account, a key, a credit card, or a signup — which matters because the brief
forbade signing up for anything on the user's behalf. There is no other provider
that offers a free tier without registration.

- **Nominatim** turns the user's location text into a bounding box. One request
  per search, cached in-process (200 entries).
- **Overpass** returns the business records inside that box. One request per search.

**Data returned:** business name, address, website, email (only where the
business has published one on OSM), and an OSM category. Plus a stable OSM
identity (`node/123`, `way/456`) used as the de-duplication key.

**Data NOT returned: employee counts.** OpenStreetMap has no such field, and no
free keyless provider publishes one. `employee_count` is therefore **always
null**, and the company-size filter **cannot be applied**. This is disclosed in
the UI rather than hidden — see "Company size" below.

**API key:** none. There is no secret to store or leak, so no server-side key
variable was added. Two optional non-secret configuration variables exist for
pointing at a different mirror or setting a contact User-Agent:
`LEAD_PROVIDER_OVERPASS_URL`, `LEAD_PROVIDER_NOMINATIM_URL`,
`LEAD_PROVIDER_USER_AGENT`. All three have defaults and none is a credential.
Documented in `.env.local.example`, which explicitly warns against adding a
`NEXT_PUBLIC_` prefix to any of them.

**Free-tier limitations:** fair-use only. Nominatim asks for ≤1 request/second
and no bulk use; Overpass is a shared public instance with no uptime guarantee.
Both require an identifying `User-Agent`. Concurrency and volume that a paid
provider would absorb will not be absorbed here — see Known limitations.

### Implemented

- `lib/providers/business-provider.ts` — the single entry point. Everything above
  it is provider-agnostic; swapping providers touches this file and nothing else.
  Exposes `PROVIDER_NAME`, `PROVIDER_SUPPORTS_EMPLOYEE_COUNT`, `searchBusinesses`.
- `lib/providers/overpass.ts` — the implementation: geocoding, query building,
  response mapping, error classification.
- `lib/providers/dedupe.ts` — de-duplication, keyed on the provider's stable id
  (`node/123`) with a normalized domain+name+location fallback. Not fuzzy.
- `lib/providers/normalize.ts`, `types.ts` — unchanged; the existing normalizer
  already absorbed the provider's field names.
- `lib/providers/mock.ts` — **deleted.** No mock data remains in the search path.
- `app/(app)/searches/actions.ts` — calls `searchBusinesses`, persists results,
  maps provider failures to user-safe text, reports de-duplication and rejection
  counts.
- `app/(app)/searches/page.tsx` — discloses when company size was not applied and
  how many duplicates were removed.

**Pipeline:** search form → server action (auth + validation) → provider service
→ Nominatim → Overpass → normalize → validate → de-duplicate → cap at 40 →
Supabase (`searches`, then `companies`, then `leads`) → UI.

**Company size.** The provider cannot supply employee counts, so the size
selection is **not applied** and the UI says so rather than implying a filter
that did not run. Employee counts are `null`, never estimated.

**Raw provider data.** `companies.raw_data` stores only the OSM identity and its
tags — 200–600 bytes per record in testing. No credentials, no full API
envelopes. Sensitive or oversized payloads are not persisted.

**Error handling.** Provider failures are classified (`location_not_found`,
`rate_limited`, `timeout`, `unavailable`, `bad_response`, `no_provider`) and each
maps to a specific user-facing sentence. API keys, raw provider errors, stack
traces, and database internals are never shown to the user; raw errors are logged
server-side only.

**Input sanitising.** Industry and location are user input interpolated into an
Overpass QL query and a Nominatim query string. Both are stripped to
`[A-Za-z0-9 .,'&/-]` before use, so quotes, brackets, semicolons, backslashes and
parentheses cannot survive into the query. Verified deterministically against
four hostile payloads — zero metacharacters reach the query.

### Current flow

1. The signed-in user submits industry + location (+ an optional size).
2. `runSearchAction` verifies the session, validates and sanitises the input, and
   derives `user_id` from the verified session — never from the client.
3. `searchBusinesses()` geocodes the location, queries Overpass, normalizes,
   de-duplicates, and caps the result at 40.
4. The action writes one `searches` row, then one `companies` row and one `leads`
   row per company. A failure mid-write deletes the search row so a search can
   never claim results it does not have.
5. The list returned to the browser is rebuilt from the rows actually written, so
   it carries real UUIDs.

### Known limitations

1. **No employee counts, so no company-size filtering.** Structural to the
   provider, not a bug. Disclosed in the UI. Adding a size filter requires a
   different provider.
2. **The public Overpass instance is slow and intermittently unavailable.**
   Searches took 9–15s in testing. One run returned a 504 that a retry cleared;
   later runs hit `429`. Failures surface as a clear "that search took too long /
   try a smaller location" message, but a search can fail for reasons outside
   this application's control. The brief forbids automatic retries.
3. **Coverage is uneven by industry and region.** OSM is strong on European
   cities and patchy elsewhere. An industry absent from the ~30-entry alias table
   falls back to matching the business *name*, which is narrower.
4. **No pagination beyond the first page.** Capped at 40 results by design.
5. **De-duplication is deterministic, not fuzzy.** Two OSM records for the same
   real business under different ids will both survive. Matches the brief's
   instruction not to build a complicated fuzzy matcher.
6. **No runtime verification of auth, persistence, or RLS end-to-end** — see the
   Phase 2 note; email confirmation is still enabled on the project, which blocks
   creating a test session. These paths are unchanged by Phase 3.

### Next phase: Phase 4 — AI Lead Analysis & Enrichment

Not started, per the Phase 3 brief. The `leads` AI columns (`fit_score`,
`ai_summary`, `ai_signals`, `recommended_action`, `confidence`, `unknowns`,
`analyzed_at`) already exist and are currently written as `null`;
`components/lead-detail.tsx` already renders that shape. Phase 4 fills them in.
No Anthropic/Claude call was made during Phase 3.

## Phase 4 — AI Lead Analysis & Enrichment

Status: COMPLETE (implementation). Verified end-to-end against a mock API; the
live model call is UNVERIFIED — no valid API key is available. See Testing.

Claude is wired in as the intelligence layer: real company data is scored
against the user's search criteria and stored as structured lead intelligence.

### Implemented

- **Claude API integration** — `lib/ai/claude.ts`, the only module that talks to
  Anthropic. Marked `server-only`, so any client import is a build error.
- **Server-side AI analysis** — `lib/ai/lead-analysis.ts` builds the input, makes
  one call, and validates the result.
- **Structured output** — an explicit JSON Schema is handed to the model, and the
  reply is parsed as JSON (a single code fence is unwrapped if present).
- **Response validation** — Zod (`lib/ai/schemas.ts`). A response that fails is
  never stored.
- **Lead scoring** — `fit_score` 0–100 and `fit_label` across four bands.
- **Fit explanation** — `summary`, and `signals` split into evidence vs inference.
- **Recommended action** — `recommended_action`.
- **Confidence** — 0–1.
- **Unknowns** — what the supplied data could not establish.
- **AI result persistence** — written to the Phase 2 `leads` columns, plus
  `fit_label` (new column, see the migration below).
- **Cost protection** — explicit user trigger only, one analysis per lead,
  no retries, no batch, no background work.
- **UI integration** — Analyze / Re-analyze button, loading state, error state,
  and a Known / Inferred / Unknown presentation.

**Schema change.** `supabase/migrations/20260923000000_add_lead_fit_label.sql`
adds `leads.fit_label` with a check constraint limiting it to the four allowed
labels. It does not touch RLS. **It must be run before analysis can be saved** —
the update in the action writes that column.

### AI flow

Company data
→ sanitized AI input
→ Claude
→ structured JSON
→ validation
→ Supabase
→ UI

1. The user presses **Analyze** on a lead. Nothing else triggers a call.
2. `analyzeLeadAction` verifies the session, validates the company id, and looks
   the company up *within the session's own rows* — the lookup is the ownership
   check.
3. If an analysis already exists and the request is not an explicit re-analysis,
   the stored result is returned and **no API call is made**.
4. The input is assembled from the company plus the criteria of the search that
   produced it — industry, location, size.
5. One Claude call. No retries.
6. The reply is parsed and validated against the Zod schema. Invalid output is
   discarded with a controlled error.
7. The result is written to the lead row and the route is revalidated. The UI
   re-renders from the database, so what is shown is what was saved.

### No invented information

The prompt forbids the model from producing revenue, funding, headcount, buying
intent, budget, pain points, technologies, recent events, or any contact detail,
and requires anything reasoned to rather than read off a field to be marked
`Inferred: `. The UI splits signals on that marker, so evidence and inference are
rendered as separate lists, and unknowns are shown as their own set.

**Contact information is never generated.** `contact_name`, `email`, and
`email_status` are not written by this phase at all — they keep whatever the
provider supplied. No decision-maker lookup, no email guessing, no web search.

### Testing

`npm run lint` and `npm run build` both pass (see Current state).

Two verification harnesses were run and then deleted:

1. **Validation harness — 43/43 passed.** Schema acceptance and rejection
   (out-of-range and non-integer scores, unlisted labels, missing fields, empty
   and oversized strings, wrong types, oversized arrays, null and non-object
   payloads), percentage-confidence normalisation, duplicate-signal collapsing,
   label banding at every boundary, the evidence/inference split, and the
   provider-payload sanitiser (drops non-allow-listed tags, caps value length,
   returns null when nothing useful survives).
2. **Pipeline harness — 24/24 passed.** The *real* pipeline
   (`analyzeCompany` → `claude.complete` → SDK → classify → parse → Zod) driven
   against a local mock of the Anthropic API, so every branch below was
   exercised without a key or a network call:
   - a valid response produces a correct structured analysis;
   - code fences and surrounding prose are tolerated;
   - non-JSON, out-of-range, unlisted-label, empty, and refused responses are
     all rejected;
   - a label contradicting the score is corrected to match it;
   - 401/403 → auth, 429 → rate limit, 529/500 → overloaded, malformed body →
     bad response, dropped connection and refused connection → unreachable,
     missing key → not configured.

**What is NOT verified:** a live call to the real Anthropic API. The
environment has no valid `ANTHROPIC_API_KEY` (the value present in the shell is
51 characters with no `sk-ant-` prefix — not an Anthropic key format), and no
live call was made. The model's actual response quality is therefore unproven;
everything around it is not.

Auth, persistence, and RLS remain unverified end-to-end for the same Phase 2
reason — email confirmation is still enabled on the project, so no test session
can be created.

### Known limitations

1. **`fit_label` needs its migration applied.** Until
   `20260923000000_add_lead_fit_label.sql` is run, saving an analysis fails.
2. **The live model call is unverified.** See above.
3. **A non-empty but invalid `ANTHROPIC_API_KEY` reports as configured.** The
   check is presence, not validity — validating would require a paid call. The
   action maps the resulting 401 to a clear "check that ANTHROPIC_API_KEY is
   valid" message instead.
4. **Re-analysis overwrites the previous result.** There is no history, and each
   re-analysis costs a call. Deliberate: the brief asks for one analysis per lead
   by default.
5. **Concurrent identical requests can both call the model.** The duplicate
   check is a read followed by a write, not a lock. Two simultaneous presses
   could both spend a call. Single-user scale makes this unlikely; a unique
   constraint or conditional update would close it.
6. **Analysis quality is bounded by provider data.** The provider supplies no
   employee counts and often no industry, so confidence is genuinely low on many
   leads — which is correct behaviour, not a defect.
7. **No streaming.** The user waits for the full response, then the page
   refreshes.

## Phase 5 — CSV Export

Status: COMPLETE (implementation). Verified by a harness driving the real route
handler and the real CSV layer — 125/125. Auth/RLS remain UNVERIFIED end-to-end;
see Testing.

Selected leads can be exported as a CSV file. Nothing else changed.

### Implemented

- **Selection** — a checkbox per lead, a select-all control, and an explicit
  clear. The export action is disabled while nothing is selected.
- **Export action** — the leads list and the search results both export the
  current selection.
- **Server-side generation** — `app/api/leads/export/route.ts`. The browser sends
  ids and receives a file; it never builds the CSV and never sees the data
  behind it.
- **Authorization** — the request body is treated as hostile. See Export flow.
- **Field selection** — 18 columns, listed explicitly in `lib/export/leads.ts`:
  company name, industry, location, size, website, domain, contact name, email,
  email status, fit score, fit label, AI summary, AI signals, recommended action,
  confidence, unknowns, analysis date, lead status.
- **Filenames** — `leadflow-leads-YYYY-MM-DD.csv`, dated at request time in UTC.
- **CSV correctness** — `lib/csv.ts`: RFC 4180 quoting, CRLF row separators, and
  a UTF-8 byte-order mark so Excel reads accented names correctly.
- **Formula-injection guard** — a cell beginning `=`, `+`, `-`, `@`, tab or CR is
  prefixed with an apostrophe, so a company named
  `=HYPERLINK("http://evil","click")` is opened as text rather than executed.
- **Partial-export reporting** — the route returns how many leads were requested
  and how many were found, and the UI says so when they differ.
- **Export cap** — 500 leads per file, stated in the UI before it is hit.

**What is not exported:** `user_id`, internal primary keys, `raw_data`, and
anything else that is not a field of the lead itself. The column list is the
allow-list, so this holds by construction rather than by remembering to delete
fields.

### Export flow

1. The user selects leads and presses **Export CSV**.
2. The browser POSTs `{ leadIds }` to `/api/leads/export`. It sends **only ids** —
   no company names, no summaries, nothing that becomes a cell.
3. The route verifies the session. No session, no export.
4. The body is validated: must be a non-empty array of Postgres UUIDs, at most
   500, and de-duplicated.
5. `listLeadsByIds(user.id, ids)` re-reads the rows **scoped to the session's own
   user id**. `user_id` is never read from the request body.
6. Ids that are not the caller's simply do not match, so they are absent — the
   same outcome as an id that does not exist. RLS enforces the same boundary in
   the database underneath.
7. Each row is transformed explicitly (`Lead` → `Export Lead` → CSV row) and
   serialised. No AI call and no provider call is made at any point.
8. The response carries the file with `Content-Disposition: attachment`, so the
   browser downloads it.

**Why a route handler and not a Server Action:** a download needs its own
`Content-Type` and `Content-Disposition`, which an action's return value cannot
set. POST rather than GET because a select-all selection can exceed the
practical URL length a query string would impose.

### Testing

`npm run lint`, `npx tsc --noEmit` and `npm run build` all pass. The build
registers `/api/leads/export` as a dynamic route.

One verification harness was run and then deleted — **125/125 passed**. It
compiled the real route handler and the real CSV layer, and intercepted the two
server-only modules (`@/lib/auth`, `@/lib/data/leads`) at require time, standing
in a fake table for PostgREST. Covered:

- **Escaping** — commas, quotes, embedded newlines, leading and trailing
  whitespace, empty values, Unicode, and every formula-injection prefix.
- **Round-trip** — 18 hostile values escaped, then parsed back by an independent
  RFC 4180 parser, asserting the original value is recovered.
- **Structure** — CRLF separators, trailing newline, no bare LF, and a ragged row
  throwing rather than silently shifting columns.
- **Mapping** — column count and order, `null` employee count staying empty (not
  `"0"` or `"null"`), `not_found` email status staying empty, list joining, ISO
  analysis dates, and the unanalyzed case rendering `Not analyzed`.
- **Non-export** — no `user_id`, lead id, company id, or provider payload appears
  anywhere in the generated file.
- **Route** — 401 unauthenticated (with no query performed), 400 for malformed
  JSON, a missing or empty or non-array or over-cap selection, and non-UUID ids;
  404 when nothing matched; 200 with the right headers, BOM and dated filename;
  de-duplication; and a stale id exporting the rest while reporting the gap.
- **Authorization** — a body-supplied `user_id` is ignored in favour of the
  session; another user's lead id returns 404 and leaks nothing; a mixed
  selection exports only the caller's rows.
- **Failure handling** — a database error becomes a generic 500 whose body
  contains one key and none of the raw error text.
- **Cost** — the Anthropic SDK is never loaded during an export, and the route
  never touches the AI layer.

A separate scan of the built client bundles found no server symbol
(`listLeadsByIds`, `buildLeadsCsv`, `LEAD_EXPORT_COLUMNS`, `createClient`)
present. The only `ANTHROPIC_API_KEY` string in client code is inside the
user-facing "AI analysis is not configured" message.

**What is NOT verified.** The end-to-end path through a live Supabase project:
sign-in, RLS enforcement, and a real database round-trip. Email confirmation is
still enabled on the project, so no test session can be created — the same
Phase 2 blocker. What the harness proves is that the route scopes its query to
the session user and refuses to trust the body; what enforces the rest is
`.eq("user_id", …)` and RLS, both verified by reading the code rather than by
running it.

### Known limitations

1. **The 500-lead cap is a prototype limit.** Selections above it are refused
   with an explanation in the UI and an error from the route. Nothing is ever
   silently truncated, but a workspace with more than 500 leads cannot be
   exported in one file.
2. **The whole file is built in memory** before the response is sent. Fine at
   this cap; streaming would be the fix at a larger one.
3. **The lead list renders every lead the user owns.** There is no pagination,
   so select-all scales with the workspace rather than with the page.
4. **The formula-injection guard costs a literal apostrophe.** A company legitimately
   named `-5` or `@home` exports as `'-5` / `'@home`, and a negative number would
   too. Excel-compatible, technically altered. The trade is deliberate: the
   alternative is executing a company name as a formula.
5. **Analysis Date is ISO 8601 UTC**, which sorts correctly but is not
   locale-formatted. Changing it would make sorting depend on the reader's locale.
6. **Selection does not survive a page reload**, and is cleared when a new search
   runs. Selection is client state, deliberately not persisted.
7. **No export of the AI analysis on its own**, and no column selection — the
   brief asks for one reliable export, not a configurable one.
8. **Deletes between selection and export** are reported, not prevented: the file
   contains what still existed, and the UI says how many were missing.

### Next phase: Phase 6 — Testing, Security, Polish & Deployment

Not started, per the Phase 5 brief.

## Post-Phase 5 — two blocking defects found by running the app

Both were latent and only surfaced once a real session existed, which no earlier
phase had been able to create.

### 1. The Phase 4 migration had never been applied

`GET /dashboard` and `GET /leads` failed with
`listLeads failed: column leads.fit_label does not exist`. Not a code defect —
the documented prerequisite from Phase 4 was simply never run. Applying
`20260923000000_add_lead_fit_label.sql` fixed it. The error boundary behaved
correctly throughout: the raw Postgres message stayed in the server log and the
user saw only the generic sentence.

### 2. `EMPTY_SEARCH_STATE` was exported from a `"use server"` module

`POST /searches` failed with:

```
A "use server" file can only export async functions, found object.
  export {EMPTY_SEARCH_STATE as '…'} from 'ACTIONS_MODULE1'
```

`app/(app)/searches/actions.ts` carries `"use server"` but exported a plain
object, and `app/(app)/searches/page.tsx` — a Client Component — imported it as
the initial `useActionState` value. Next 16 permits only async function exports
from such a module. This is the exact failure mode `lib/analyze-form.ts` was
written to avoid in Phase 4; the search equivalent was never given the same
treatment, and it predates Phase 5.

**Fix:** `lib/search-form-state.ts` now holds `SearchActionState` and
`EMPTY_SEARCH_STATE`; `actions.ts` imports the type and exports nothing but
`runSearchAction`. The three `"use server"` modules now export only async
functions (plus one type-only export in `app/(auth)/actions.ts`, which is erased
at compile time). The production server-reference manifest went from 6 entries
to 5, and `npx tsc --noEmit`, `npm run lint` and `npm run build` all pass.

**Note for whoever picks this up:** this means search had never worked through
the UI. The Phase 3 provider was verified by calling it directly, and Phase 2's
auth was listed as UNVERIFIED — so nothing had ever exercised the two together
until now. Treat the rest of the search path as unproven for the same reason.


