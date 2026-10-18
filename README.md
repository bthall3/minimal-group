# Minimal Group Paradigm: live classroom demo

Phone-based point-allocation demo for ~200 students plus a projector dashboard. Static page (`index.html`) + Supabase (Postgres). No build step. Classroom demonstration only: no PII, no identifiers, not a study.

Files: `index.html` (student + instructor views), `schema.sql`, `INSTRUCTOR_NOTES.md`, `tests/`.

## Deploy

1. **Supabase.** Create a project, open *SQL editor*, paste and run `schema.sql`. It creates the tables, row-level security, the instructor RPCs, and a **randomly generated instructor key**.
2. **Get the instructor key** (never commit it): in the SQL editor run `select instructor_key from public.config;`
3. **Configure the page.** In `index.html`, edit `CONFIG` at the top of the `core` script: set `SUPABASE_URL` and `SUPABASE_ANON_KEY` (Project settings → API; use the anon/publishable key, **never the service-role key**).
4. **GitHub Pages.** Public repo (free plan requirement) → Settings → Pages → Deploy from branch → branch `main`, folder `/ (root)`. The site appears at `https://<user>.github.io/<repo>/`.
5. **Instructor URL:** `https://<user>.github.io/<repo>/?instructor=<KEY>`. Student URL: same without the query string (the dashboard shows it and a QR code).

## Pilot (do this before class)

- Open the student URL on a phone and on a laptop; add `?fresh=1` to discard saved state and get a new random assignment. Complete several runs.
- Open the instructor URL; click *Reveal results* and check the charts update within ~3 s.
- Optional automated checks (these call `reset_data`, so use an empty/pilot database only):
  `node tests/core.test.mjs` (no network) and
  `SUPABASE_URL=... ANON_KEY=... INSTRUCTOR_KEY=... node tests/db_test.mjs --load` (RLS, duplicates, 250 inserts over ~60 s).
- **Click *Reset data* on the dashboard before class** and confirm `n` is 0.
- Manual: iOS Safari and Android Chrome at ~380 px width, campus wifi and cellular; reload mid-task (color/codes persist); submit twice (one row).

## Security caveats

- The anon key is visible in the page source. That is normal; safety comes from RLS: anon can only `insert` into `submissions` (while submissions are open) and cannot update or delete. It has a column-level SELECT on `token` only, filtered by a policy that matches only rows created in the same transaction, which `ON CONFLICT` requires; no stored row is readable. `config` is not accessible to anon.
- The instructor key is a shared secret in the URL. It can leak via screen share, browser history, or the projected address bar. Adequate for a classroom demo, **not strong security**. If it leaks, rotate: `update public.config set instructor_key = encode(gen_random_bytes(12),'hex');`
- Anyone with the student URL can insert rows while submissions are open (the dedupe token is client-generated, so a determined person can submit many). Close submissions after the activity.
- Nothing identifying is stored by the app (no names, IPs, or user-agents; the hosting platforms keep their default logs).
- `localStorage` holds the student's random assignment and answers on their own phone only.

## Design notes

- The client stores the canonical column `c` (1..13), never the displayed position (`canonicalColumn` in `index.html`, tested). `a_lean = 7 - a_col` is computed in the database.
- The matrices are constructed for teaching in the spirit of the 1971 design; they are **not** the original booklet values (see `INSTRUCTOR_NOTES.md`).
- Dashboard polls `instructor_results` every 2 s (no websockets). Reveal/Hide is local to the instructor's browser; hidden is the default on load.
