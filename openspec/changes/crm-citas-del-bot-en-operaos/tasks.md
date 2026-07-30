# Tasks

## Block A — reader

- [x] **A1.** `back/src/lib/bookings/agent-bookings.ts`: resolve the business's `tenant_id`
      and read `aa.cita` joined to `aa.servicio_agente` / `aa.agente`, filtered by date
      range and status. Returns `[]` without querying when `tenant_id` is null.
      *Test:* `agent-bookings-mapping.test.ts` — null tenant issues no `aa.cita` query.
- [x] **A2.** Map each row to the castellano shape, `id` prefixed `aa:`, `origen: "agente"`.
      *Test:* every status maps; missing name falls back to email then to a literal.

## Block B — route

- [x] **B1.** `GET /bookings` merges both sources, sorts by start, paginates the merged
      set, and returns the summed total.
      *Test:* `agent-bookings-mapping.test.ts` — `fusionarCitas`: both origins present, ordered, paginated over the merged set.
- [x] **B2.** `GET /bookings/stats` counts agent bookings in its aggregates.
      *Test:* `agent-bookings-mapping.test.ts` — `resumirCitas`: total equals CRM rows + agent rows.
- [x] **B3.** Tenancy: the anchor is the active business's tenant, never the request.
      *Test:* `agent-bookings-mapping.test.ts` — the WHERE is anchored on the business's tenant, passed as a parameter and never interpolated.

## Block C — panel

- [x] **C1.** Front hides edit and delete on `origen === "agente"` rows and labels them.
      *Test:* `citas-origen-agente.spec.ts` — no action buttons on an agent row.

## Block D — production

- [x] **D1.** Typecheck clean (back and front) and back suite green: 998/998. Front units
      115/118 files green; the three red files predate this change — see
      `validation.md` § Known gaps. Playwright: `citas-origen-agente.spec.ts` green.
- [x] **D2.** Verify against production data: the four sectoral mocks show their bookings
      in OperaOS, counted per business.
- [x] **D3.** Deploy and confirm on `operaos.vercel.app`. Confirmed visually by the owner.

## Block E — timezone of the agent's rows

- [x] **E1.** Translate `aa.cita.inicio` from a UTC instant to the business's wall clock
      using `aa.horario_agente.zona_horaria`, and compare the date range against the
      translated value.
      *Test:* `agent-bookings-mapping.test.ts` — the query translates before returning and
      filters on the translated column.
      *Production check:* Brasserie Lafayette, 17 bookings in August 2026, every one inside
      its opening hours (lunch 13:00-16:00, dinner 19:30-23:00/23:30, Sunday 11:30-16:30).

## Block F — dead credentials in the e2e suite

- [x] **F1.** `front/e2e/_auth.ts`: single login helper reading `E2E_EMAIL` / `E2E_PASSWORD`,
      skipping with an explicit reason when they are absent. Eight specs stopped carrying
      `owner@estudiolua.com` / `demo1234Seed!` (a user that no longer exists in auth) and
      two of them stopped carrying a real password in the repository.
      *Test:* the suite skips without credentials and `citas-origen-agente.spec.ts` passes
      with them.
- [x] **F2.** `back/src/seed.ts` takes `SEED_EMAIL` / `SEED_PASSWORD` from the environment
      and refuses to run without them; it creates a real ADMIN in the same Supabase that
      serves production. `back/scripts/transfer-ownership.mjs` deleted: a one-shot script,
      already applied, whose `OLD_EMAIL` no longer exists.

## Verification

A task is done only when its test is green.
