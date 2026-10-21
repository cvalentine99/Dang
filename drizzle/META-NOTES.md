# drizzle/meta

Snapshots 0000–0015 are the original drizzle-kit chain. Migrations 0016–0022 were
hand-written and never had snapshots, so the chain was dead and `drizzle-kit generate`
would have emitted destructive SQL (CODE_REVIEW_2026-10-21.md C17).

`0022_snapshot.json` is an introspection of the live database after 0022 was applied
(`drizzle-kit pull` on a restored copy, 2026-10-21), with two representation-only
normalizations so it matches how drizzle serializes `schema.ts`: tinyint(1) columns
declared `boolean()` are recorded as `boolean`, and `defaultNow()` as `(now())`.

Not represented anywhere (drizzle cannot express it): the multi-valued index
`lcs_linked_corr_ids_mvi` on `living_case_state` from 0016. Because it is in neither
the snapshot nor `schema.ts`, `generate` never touches it.

From 0023 onward the chain is live again: add a column to `schema.ts`, run
`pnpm db:generate`, review the SQL, commit the SQL + snapshot together.
