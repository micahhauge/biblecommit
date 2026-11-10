# biblecommit — v1 Spec

Commit the Scripture you read. Type it in plain language; watch your year and the whole canon fill in like pigment on paper.

v1 is two screens, **Today** and **Canon**, plus what they need to work: accounts, a parser, storage, and an API that future mobile apps can use.

Prototype: `prototype/index.html` (static, fake data, not production code).

---

## 1. Scope

### In v1
- Guest mode: use it immediately with no sign-in; sign in (Clerk) to save and sync
- **Today:** commit input with live parse preview, personal streak, this week, year heatmap, recent commits with undo/delete
- **Canon:** coverage %, whole-Bible chapter grid, book sheet (chapters), chapter → verse detail
- Settings: mode (system / dark / light). Palette is fixed to iron gall (not user-selectable in v1).
- Responsive web: mobile and desktop, bottom tab bar on mobile, top nav on desktop

### Not in v1 (designed for, not built)
Friends & friend streaks · groups · badges/plates · public profiles · notifications · Bible text/reader · year-in-review share image · native apps

---

## 2. Product rules

### Canon
- Protestant 66 books, standard English (KJV-lineage) versification as the only scheme.
- 1,189 chapters, 31,102 verses. Every verse has a sequential integer ID `1..31102` in canonical order, so any passage is a contiguous ID range.
- Canon data (books, chapters, verse counts) lives in `packages/core` and is seeded into Postgres. Verse counts come from a public-domain KJV text and are checked by tests against 66 books / 1,189 chapters / 31,102 verses.

### Committing a reading
- A **commit** is one submission of the input: the raw text, the date it counts for, and one or more verse ranges.
- A whole chapter expands to all its verses; a whole book (`Ruth`) expands to every chapter.
- Repeat reads: the same verse read twice in one day counts **2 reads** for heatmap intensity and **1** for coverage.
- **Overlaps within a commit are merged** (`gen 1, gen 1` counts once). Repeats across separate commits do count.
- **Dates:** a commit counts for whatever day its `read_on` says, for streak, heatmap, and coverage alike. No backdating limit. Future dates are rejected.
- Commits can be deleted. After committing, an "undo" toast stays up for ~6s or until the next commit. Deleting from the recent list uses an inline confirm (× → "delete?" yes/no in place). There is no edit; delete and recommit instead.

### Parser (deterministic, `packages/core`)
Must handle:
| Input | Result |
|---|---|
| `today I read 2 Samuel 21` | 2 Samuel 21 (whole chapter) · today |
| `1 Kings 1:5-9` | 1 Kings 1:5–9 |
| `gen 1-3` | Genesis 1–3 |
| `jn 3:16-4:2` | John 3:16–4:2 (cross-chapter) |
| `ps 1, 3, 5` | Psalms 1, 3, 5 (list inherits book) |
| `john 3:16, 18` | John 3:16, 3:18 (list inherits chapter) |
| `romans 8 and 1 cor 13` | two books |
| `jude 3-5` | single-chapter books take verse numbers |
| `i kings 2`, `2 samuel chapter 21` | Roman numerals, filler words |
| `yesterday I read psalm 23` | date phrase → yesterday |
| `3 days ago gen 5` | date phrase → 3 days ago |
| `nov 7 john 1`, `november 7 john 1` | exact date → most recent past Nov 7 |
| `jude` / `jude 1` | whole book (single-chapter book) |
| `john 3:16, 4` | John 3:16, 3:4 (list inherits last level; `;` or `c:v` resets) |

Errors are specific and shown before submit: unknown book, ambiguous abbreviation (`jud` → "Judges or Jude?"), chapter/verse out of range, backwards range, unrecognized word, future date.

- **Date phrases:** only `today` (default), `yesterday`, `N days ago`, and month-day dates (`nov 7`, `november 7`; resolves to the most recent past-or-today occurrence, so `dec 25` on Nov 9 means last year). Nothing else. The date phrase can appear anywhere in the input; more than one is an error. If the text has a date, it beats the API's `readOn`.
- **Book names:** explicit alias table first (`jn`, `ps`, `1 cor`, …), then unique prefix of ≥2 letters; multiple matches → ambiguous error listing candidates.
- **Single-chapter books:** a bare `1` means the whole book; any other number or range means verses; `jude 1:1` is verse 1.
- **Filler:** a fixed list of filler words (`today`, `i`, `read`, `chapter`, `and`, `also`, `the`, `book of`, …) is dropped. Any other unrecognized word is an error, never silently ignored.

The parser returns structured segments plus a normalized display string (`2 Samuel 21 · 22 verses · today`). It ships with a table-driven test suite built from the examples above.

### Streaks
- A day counts if it has at least one commit. Any amount counts.
- Days are the user's **local calendar day** (timezone stored on the user, set from the browser, updatable).
- The streak is the run of consecutive days with commits ending today, or ending yesterday if today has no commit yet (today is pending, not missed). One missed day breaks it.
- The streak is inferred from commits' `read_on` dates, not stored. The logic is a pure function in `core`, so friends/groups can reuse it later.

### Year heatmap
- Last 53 weeks, one cell per day. Color = verses read that day (with repeats).
- Intensity uses 4 quantile buckets from **the user's own** history, so light reading days still show.
- Buckets are quantiles of the nonzero days in the window; with fewer than 8 such days, use fixed thresholds (1–10 / 11–30 / 31–80 / 81+).
- On mobile it scrolls sideways and opens on the current month.

### Canon view
- Coverage = chapters with every verse read at least once ÷ 1,189.
- Grid: one row per book (wraps to the screen width), grouped by section (Law, History, Wisdom & Poetry, Major Prophets, Minor Prophets, Gospels & Acts, Epistles, Apocalypse). Depth = times the whole chapter was read, i.e. the minimum read count across its verses (1×, 2×, 3+). Partly read chapters get their own level, lighter than 1×.
- Tap a book → sheet with numbered chapter cells. Tap a chapter → verse strip showing which verses were read and how often.

---

## 3. Screens

### Today
1. Commit input: auto-focused on desktop; typing anywhere focuses it. Live preview line underneath. `enter` commit · `esc` clear · `↑` recall last. On touch devices a "commit ↵" button appears once the input parses.
2. New users see example chips (`john 1`, `psalm 23`, `gen 1-3`) instead of history.
3. Streak: number, status ("committed today" / "nothing committed yet today"), this week's dots.
4. The year heatmap. Hover (desktop) or tap (mobile) shows date · verses.
5. Recent commits: date and normalized passage, with delete (inline confirm). Last 10, then "load more".

### Canon
1. Coverage %, chapter count, "chapters read more than once".
2. Chapter grid. Hover/tap shows `Genesis 12 · read 2×`.
3. Book sheet → chapter → verse detail.

### Chrome
Wordmark `bible`*`commit`*, two tabs, a mode toggle, a settings sheet. Empty states for everything.

No sign-in required. Visitors land straight on Today as a guest (no landing page in v1). A quiet "sign in to save" link sits in the header; after a guest's first commit, one dismissible nudge appears under the streak. Nothing is gated. Mode lives in a cookie (server renders the right theme with no flash) and syncs to `mode_pref`.

---

## 4. Architecture

```
apps/web          Next.js (App Router) — UI; mounts the API at /api/*
packages/api      Hono + @hono/zod-openapi — routes, validation, OpenAPI spec
packages/core     canon data, parser, verse-ID math, streak + bucketing logic (pure TS, no deps)
packages/db       Drizzle schema, migrations, seed (books/chapters)
```
- **Hosting:** one Vercel project; Hono is mounted via `hono/vercel` in `app/api/[[...route]]/route.ts`.
- **DB:** Neon Postgres (serverless driver) + Drizzle.
- **Auth:** Clerk **or** guest. The web app uses Clerk's Next SDK; the API verifies Clerk session JWTs from the `Authorization` header (the same path native apps will use). It also accepts a guest token (see *Guest mode*).
- **Types:** Zod schemas → OpenAPI → a typed TS client for web now, Swift/Kotlin later.
- **Monorepo:** pnpm workspaces + Turborepo.
- **User rows** are created lazily (no Clerk webhook in v1): guests on their first commit, Clerk users on their first authenticated request. The client sends `PATCH /api/me {timezone}` on load when the browser timezone differs from the stored one.

### Guest mode
- Guest data lives **server-side**: a guest is a normal user row authenticated by a random secret token held by the browser. All read paths are identical for guests and signed-in users.
- The guest is created on the **first commit**, not on page load. Before that, the app shows the empty state and example chips with no API calls (the parser runs locally).
- **Sign in → claim:** the guest's commits move to the Clerk account. A new account adopts the guest row; an existing account gets the commits merged in (union; nothing dropped).
- **Sign out →** the browser starts as a fresh, empty guest. Claimed data is only reachable by signing in.
- Unclaimed guests are kept indefinitely in v1.

### Frontend
- Next.js App Router, React 19, TypeScript strict.
- **Styling:** plain CSS (global tokens + CSS Modules) ported from the prototype. No Tailwind, no component library.
- **Fonts:** `next/font` (EB Garamond, JetBrains Mono).
- **Data:** client components with TanStack Query; optimistic commit/delete. Server Components only for the shell (layout, theme cookie).
- **API client:** `openapi-typescript` types generated from `/api/openapi.json` + `openapi-fetch`, the same contract native apps will use.
- **Tests:** Vitest (`core` table-driven suites).
- The web app runs the parser locally for an instant preview; the server re-parses on commit and is the source of truth.

### Data model

```
users
  id                uuid pk            -- internal, stable; everything FKs to this
  clerk_user_id     text unique null   -- set once signed in / claimed
  guest_token_hash  text unique null   -- sha256 of guest token; raw token never stored
  timezone        text not null    -- IANA, e.g. America/Chicago
  mode_pref       text default 'system'
  created_at      timestamptz

books             (seeded) id smallint pk, name, short_name, section, chapter_count, first_verse_id, last_verse_id
chapters          (seeded) id smallint pk, book_id, number, verse_count, first_verse_id, last_verse_id

commits
  id              uuid pk
  user_id         uuid fk → users
  read_on         date not null     -- user's local date it counts for
  raw_input       text not null
  display         text not null     -- normalized, e.g. "2 Samuel 21"
  created_at      timestamptz
  deleted_at      timestamptz null  -- soft delete
  index (user_id, read_on)

commit_ranges
  commit_id       uuid fk → commits
  start_verse_id  int not null
  end_verse_id    int not null      -- inclusive
  index (commit_id)
```
Heatmap, coverage, and streak are derived by query. If it gets slow, add a `user_chapter_reads` rollup later.

### API (v1)
| Method | Path | Purpose |
|---|---|---|
| POST | `/api/parse` | `{text}` → segments, display, verse count, date (no write) |
| POST | `/api/commits` | `{text, readOn?}` → created commit (server re-parses) |
| GET | `/api/commits?cursor=` | recent commits, paginated |
| DELETE | `/api/commits/:id` | soft delete (powers undo) |
| GET | `/api/me` | profile, timezone, prefs |
| PATCH | `/api/me` | timezone, mode_pref |
| GET | `/api/me/today` | streak, this week, today's commits |
| GET | `/api/me/year?end=` | 371 daily verse totals + bucket thresholds |
| GET | `/api/me/canon` | per-chapter read counts (1,189) + coverage |
| GET | `/api/me/canon/:bookId` | per-verse read counts for that book |
| POST | `/api/guests` | `{timezone}` → `{token}` (no auth; called once, right before the first commit) |
| POST | `/api/me/claim` | Clerk JWT + `{guestToken}` → move guest data to the account (idempotent) |
| GET | `/api/openapi.json` | spec |

**Auth headers:** `Authorization: Bearer <clerk jwt>` or `Authorization: Guest <token>`. The web app keeps the guest token in localStorage (native: Keychain).

**Claim rules:** no row for this Clerk id → the guest row adopts it (`clerk_user_id` set, `guest_token_hash` cleared). A row exists → guest commits are reassigned to it and the guest row is deleted; the existing account's timezone/prefs win. Unknown or already-claimed token → 204 no-op. The client calls claim right after sign-in when it holds a guest token, then drops the token.

---

## 5. Look & feel
- Minimal and keyboard-first (MonkeyType) meets moody watercolor: paper grain, soft pigment blooms, heatmap cells with watercolor "wash" edges (SVG turbulence/displacement).
- Serif for Scripture and numbers, mono for UI chrome and the input.
- Dark and light both supported. Mode defaults to **system**; if the device states no preference, use **dark**.

### Decided
- **Palette: iron gall.** Blue-black manuscript ink. EB Garamond (serif) + JetBrains Mono (mono).
  - Dark: paper `#0f1115`, ink `#d9d4c7`, pigment `rgb(127 152 209)`
  - Light: paper `#f2ede3`, ink `#1c1a17`, pigment `rgb(36 54 95)`
- **Cells: wash.** Watercolor edges and grain on heatmap and canon cells.
- **Canon layout: rows.** One row per book, wrapping to the screen width.

### Open
- [x] Verse-count data source: public-domain KJV text (verse counts only), verified 66 / 1,189 / 31,102
- [x] Domain: biblecommit.com

---

## 6. Later (keep the door open)
- **Friends:** 1:1, invite link, friend streak = both read on the same local day; they see *that* you read, *what* is opt-in. Separate tables from groups.
- **Groups:** separate construct, with a completion rule (all members / threshold). Reuses the `core` streak function.
- **Badges:** scripture milestones (The Law, Every Psalm, The Gospels, The Twelve, Forty Days, Whole Counsel), shown as plates with Roman numerals.
- Purge unclaimed guests inactive 90+ days.
- Public profile (`/@handle`, opt-in), notifications, a BSB/WEB reader pane, a year-in-review image, native apps (Expo or Swift/Kotlin against the OpenAPI spec).
