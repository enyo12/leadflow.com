# LeadFlow

B2B lead intelligence for freelancers, agencies, and small sales teams.

Enter an industry, a location, and a company size. LeadFlow retrieves matching
businesses, stores them in your workspace, and produces an AI analysis of how
well each one fits — a fit score, the signals behind it, a recommended next
action, and an explicit list of what the data could *not* establish.

## Status: Phase 5 complete

The application foundation, UI, authentication, database persistence, a real
external lead provider, AI lead analysis, and CSV export are built.

| Capability | State |
| --- | --- |
| Authentication (email + password) | Built — Supabase Auth |
| Database + Row Level Security | Built — see `supabase/migrations/` |
| Persistence | Built — searches and companies survive a refresh |
| Lead search + results | Working, served by OpenStreetMap (server-side) |
| Dashboard metrics | Working, computed from your stored rows |
| Real lead provider | Built — Phase 3 |
| AI lead analysis | Built — Phase 4 |
| CSV export | **Built — Phase 5** |

Company size is **not** filtered: the provider publishes no employee counts, so
the UI says the size was not applied rather than pretending otherwise. See
"Lead data provider" below.

## Stack

Next.js 16 (App Router, Turbopack) · TypeScript · React 19 · Tailwind CSS v4 ·
shadcn/ui conventions · Supabase (auth + Postgres + RLS) · OpenStreetMap
(Nominatim + Overpass) · Anthropic Claude · Zod · Vercel

## Getting started

```bash
npm install
cp .env.local.example .env.local   # then fill in the two Supabase values
npm run dev                        # http://localhost:3000
npm run build
npm run lint
```

Without the Supabase environment variables the app redirects every route to
`/setup`, which names the variables that are missing and where to find them.
The app needs no other configuration — the lead provider requires no key.

### Environment variables

| Variable | Required | Where to get it |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | Supabase → Project Settings → API → Project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes | Same page → publishable / anon key |
| `LEAD_PROVIDER_OVERPASS_URL` | No | Overpass mirror; defaults to `overpass-api.de` |
| `LEAD_PROVIDER_NOMINATIM_URL` | No | Nominatim base; defaults to the OSM instance |
| `LEAD_PROVIDER_USER_AGENT` | No | Identifying User-Agent sent to both OSM services |
| `ANTHROPIC_API_KEY` | For AI analysis | Anthropic Console → API keys |
| `ANTHROPIC_MODEL` | No | Model id; defaults to `claude-haiku-4-5-20251001` |

The two Supabase values are public and ship to the browser; security comes from
RLS. Never place a service-role key in a `NEXT_PUBLIC_` variable.

`ANTHROPIC_API_KEY` **is a real secret** — it bills to your account. Never give
it a `NEXT_PUBLIC_` prefix (that inlines it into the browser bundle and
publishes it to every visitor), never commit it, and on a host set it in the
project's environment settings rather than a file. Without it the Analyze button
is replaced by a "not configured" notice; nothing else in the app is affected.

The three provider variables are not secrets — there is no provider API key in
this project. `.env*` is gitignored; only `.env.local.example` is committed.

### Applying the schema

Run both migrations against your project — paste them into the SQL editor in
filename order, or use `supabase db push` with the CLI. Both are idempotent.

```
supabase/migrations/20260921000000_init_leadflow_schema.sql
supabase/migrations/20260923000000_add_lead_fit_label.sql
```

The second adds `leads.fit_label`, which AI analysis writes. **Analysis cannot
be saved until it has been applied.**

### AI lead analysis

Analysis runs on Claude, server-side, and only when you press **Analyze**.

- **Nothing triggers it automatically.** Searching, loading a lead, and
  refreshing all cost nothing.
- **One analysis per lead.** Pressing Analyze on an already-analyzed lead
  returns the stored result without calling the API. **Re-analyze** is a
  separate, explicit action that overwrites the previous result.
- **No retries, no batch, no background work.** A failed analysis is re-run by
  the user, not by the app.
- **Structured output.** The model returns JSON matching a fixed schema, and the
  response is validated with Zod before anything is stored. Output that fails
  validation is discarded, never saved.
- **Nothing is invented.** The model may not produce revenue, funding,
  headcount, buying intent, budget, pain points, technologies, or any contact
  detail. Anything it reasons to rather than reads off a supplied field must be
  marked `Inferred: ` — the UI renders those in a separate list from the
  evidence, and unknowns in a third.
- **No contact enrichment.** LeadFlow never looks up decision-makers, guesses
  email addresses, or searches the web. The contact fields hold only what the
  data provider published.

Model choice defaults to Haiku: this is a bounded classification task over a
handful of fields, which is what that model is priced for. Override with
`ANTHROPIC_MODEL` if analysis quality demands a larger one — it is charged per
lead analyzed.

### Lead data provider

Lead data comes from **OpenStreetMap**, via two official OSM APIs: Nominatim
resolves the location text to a bounding box, and Overpass returns the businesses
inside it. Neither requires an API key, an account, or a signup.

What that means in practice:

- **No employee counts.** OSM has no such field, and no free keyless provider
  publishes one. The company-size filter therefore cannot run, and the search
  page states that plainly instead of showing a filter that did nothing.
- **Results are capped at 40** and only the first page is returned.
- **Searches take roughly 10 seconds** and occasionally fail. Overpass is a shared
  public instance; it rate-limits and times out under load, and it is not under
  this application's control. Failures are reported as a clear message, and no
  request is retried automatically.
- **Coverage varies by industry and region.** OSM is strongest in European cities.
  Industries outside the built-in alias table fall back to matching the business
  name, which is narrower.
- **Both services require an identifying `User-Agent`.** Set
  `LEAD_PROVIDER_USER_AGENT` to something that identifies you before any
  production use, per the OSM usage policies.

### CSV export

Select leads on the **Leads** page or in search results and press **Export CSV**.
A `leadflow-leads-YYYY-MM-DD.csv` file downloads.

- **Only what you selected.** The selection is yours; nothing exports implicitly.
- **The file is built on the server.** The browser sends lead ids and receives a
  file. It never assembles the CSV, so a name or summary cannot be fabricated
  client-side into a record.
- **Rights are checked per request.** The ids are re-read from the database scoped
  to the signed-in user, so an id belonging to someone else returns nothing — the
  same as an id that does not exist. RLS enforces the same boundary underneath.
- **What is in the file.** Contact and company fields, plus the AI analysis when
  there is one. Each row ends with a status of `Analyzed` or `Not analyzed`;
  unanalyzed rows leave the AI columns empty.
- **Exporting never costs anything.** No AI call and no provider call is made.
  Exporting an unanalyzed lead does **not** analyze it.
- **500 leads per file.** Above that the export is refused with an explanation,
  not quietly trimmed.
- **Excel-safe.** UTF-8 with a byte-order mark, RFC 4180 quoting, CRLF rows. A
  value beginning `=`, `+`, `-` or `@` is prefixed with an apostrophe so a
  spreadsheet treats it as text rather than executing it as a formula.
- **Not in the file:** internal ids, `user_id`, and raw provider payloads.

### Project structure

```
app/
  (app)/                  Authenticated shell: sidebar + page container
    layout.tsx            Session check + forces dynamic rendering
    dashboard/            Metrics, recent searches, top leads
    searches/             Search form + server action that persists results
    leads/                All leads · leads/[id] is the lead detail
    error.tsx             Recoverable read-failure state
  api/
    leads/export/         POST handler — CSV download (auth + RLS scoped)
  (auth)/                 Sign-in / sign-up routes + server actions
  setup/                  Instructions shown when env vars are missing
  layout.tsx              Root layout, fonts, metadata
  not-found.tsx           404

components/
  ui/                     shadcn/ui-convention primitives
  app-shell.tsx           Navigation shell + signed-in account
  auth-form.tsx           Shared sign-in / sign-up form
  search-form.tsx         Controlled search form
  lead-card.tsx           One lead, full or compact
  lead-list.tsx           Lead list + selection
  leads-workspace.tsx     Selection state + export bar (Leads page)
  export-csv-button.tsx   Export trigger, loading/error/partial states
  lead-detail.tsx         Lead detail + analysis panel
  dashboard-stats.tsx     Metric cards
  lead-badges.tsx         Score, status and employee-count display
  empty-state.tsx         Shared empty / error state

lib/
  supabase/
    config.ts             Env var access + `isSupabaseConfigured()`
    client.ts             Browser client
    server.ts             Server Component / Server Action client
    proxy.ts              Session refresh helper for proxy.ts
  auth.ts                 getSessionUser / requireSessionUser / getProfile
  data/                   Reads: searches, leads, dashboard stats
  csv.ts                  RFC 4180 writer + formula-injection guard
  export/
    leads.ts              Lead → export columns → CSV row (the allow-list)
    limits.ts             Shared export cap
  providers/              Lead provider boundary
    business-provider.ts  THE entry point — provider-agnostic
    overpass.ts           OpenStreetMap implementation (Nominatim + Overpass)
    dedupe.ts             Stable-id de-duplication
    normalize.ts          Provider shape → internal shape
    types.ts              Provider contract + raw payload shape
  ai/                     Anthropic integration (server-only)
    claude.ts             The only module that calls Anthropic
    lead-analysis.ts      Prompt, input building, one call, validation
    schemas.ts            Zod contract + JSON Schema + label bands
  analysis-display.ts     Evidence/inference split, label tone, confidence
  analyze-form.ts         Shared analyze-form state (client-safe)
  format.ts               Date, count and score display helpers
  navigation.ts           safeNextPath() — redirect-target validation
  auth-form.ts            Shared auth form state types
  utils.ts                cn()

proxy.ts                  Session refresh + route gate
supabase/migrations/      Versioned SQL — the only definition of the schema
types/index.ts            Domain types (mirror the Supabase schema)
```

## Notes for the next phases

- **Provider boundary.** `lib/providers/business-provider.ts` is the only module
  that knows which provider is in use. `overpass.ts` is the only place that knows
  provider field names, and `normalize.ts` is the only place that translates
  them. Swapping providers means rewriting `overpass.ts`; nothing else changes,
  because every call already happens server-side.
- **Provider failures are typed.** `ProviderError.kind` enumerates the failure
  modes, and `app/(app)/searches/actions.ts` maps each to user-safe text. New
  failure modes need a new message there; raw provider errors must never reach
  the UI.
- **AI boundary.** `lib/ai/claude.ts` is the only module that talks to Anthropic
  and is marked `server-only`. `lib/ai/lead-analysis.ts` owns the prompt and the
  validation. `app/(app)/leads/actions.ts` is the only caller. Nothing else may
  import these from a Client Component — `server-only` makes that a build error
  rather than a leaked key.
- **Client-safe shared state.** `lib/analyze-form.ts` exists because importing a
  non-action value from a `"use server"` module drags server-only imports into
  the browser bundle. The same applies to `lib/auth-form.ts`. Put shared types
  and constants in their own module.
- **The analysis contract is the schema.** `lib/ai/schemas.ts` holds the Zod
  schema, the JSON Schema handed to the model, and the label bands. Change one
  and you must change all three — plus the `fit_label` check constraint in the
  migration.
- **Never invent facts.** A field the provider does not supply is `null`, and a
  filter the provider cannot apply is disclosed as not applied. The same rule
  binds the prompt: return null / an `unknowns` entry rather than guessing at
  revenue, funding, tech stack, budget, or buying intent.
- **Known vs inferred.** Provider facts and AI inference are rendered in
  separate, labelled cards, and inferred signals in a separate list from
  evidence. Keep that separation.
- **Security model.** RLS is the only security boundary. `proxy.ts` and
  `requireSessionUser()` are conveniences on top of it. Any new table needs its
  own policies, and any new query needs the session-derived `user_id` — never
  one supplied by the client.
- **Untrusted input reaching a query language.** The Overpass QL query is built
  from user text. `sanitizeQueryText()` in `overpass.ts` is what makes that safe;
  keep any new interpolation behind it.
- **Export is an allow-list, not a filter.** `lib/export/leads.ts` names every
  column and how it is derived. A field is exported because it is listed there,
  so adding a column to the `leads` table cannot leak into a file by default.
  Add columns deliberately, and never export `user_id`, internal keys, or
  `raw_data`.
- **The browser sends ids, never rows.** `app/api/leads/export/route.ts` treats
  its body as hostile and re-reads everything from the database under the
  session's own `user_id`. Keep it that way — accepting row data from the client
  would let a caller write arbitrary content into someone's spreadsheet.
- **Everything written to a CSV is untrusted text.** Company names come from a
  public provider and summaries from a language model. `escapeCsvField()` in
  `lib/csv.ts` is the only path into a cell; do not concatenate CSV by hand.
- **Date formatting is pinned to UTC** in `lib/format.ts` to keep server and
  browser output identical. Revisit if per-user timezones are ever needed.
