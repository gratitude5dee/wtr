---
name: verifying-wtr-pipeline
description: How to verify the WTR Story Protocol data-licensing pipeline locally — static gates, Postgres migrations from empty, schema-invariant probes, Aeneid address verification, and the log redaction scrubber. Use when testing or validating changes to this repo.
---

# Verifying the WTR pipeline locally

This repo is a Story Protocol (Aeneid testnet, chain id 1315) data-licensing pipeline. Phases before
the UI work ship **no user-facing UI** — the only Next.js route may be the default create-next-app
page. Check `src/app/page.tsx` before planning any browser testing; if it is still the scaffold, this
is a script + library verification job and you should **not** start a screen recording (there is
nothing visual to show — collect command output as text/rendered-image evidence instead).

## Static gates

```bash
npm install
npm run typecheck   # tsc --noEmit
npm run lint        # eslint (flat config, no args)
npm test            # vitest run — check the test count matches what the PR claims
npm run build       # next build
```
All four should exit 0. `npm install` emitting `npm audit` advisories is normal and not a failure.

## Postgres

Postgres 14 is installed but is **not running after a snapshot boot**:

```bash
sudo pg_ctlcluster 14 main start
```
A local-dev role/database `wtr`/`wtr` exists: `postgres://wtr:wtr@127.0.0.1:5432/wtr`.

To test migrations honestly, **do not reuse the existing `wtr` database** — it usually already has the
schema applied, so a migration run there proves nothing. Create a fresh one:

```bash
export PGPASSWORD=wtr
psql -h 127.0.0.1 -U wtr -d postgres -c "DROP DATABASE IF EXISTS wtr_fresh_test;" \
  -c "CREATE DATABASE wtr_fresh_test OWNER wtr;"
# prove it starts empty
psql -h 127.0.0.1 -U wtr -d wtr_fresh_test -c "select count(*) from pg_tables where schemaname='public';"
DATABASE_URL=postgres://wtr:wtr@127.0.0.1:5432/wtr_fresh_test npm run db:migrate
```
Expect `applied 0001_init.sql`, then `no pending migrations` on a second run (the runner records
applied filenames in `schema_migration`). Cross-check the created object set against the migration
file itself rather than eyeballing it — `grep -c '^CREATE TABLE' db/migrations/*.sql` and compare to
`pg_tables` (there will be one extra: `schema_migration`). Also assert the non-table objects, which a
table-only check would miss: `pg_type` for the `asset_stage` enum, `pg_proc`/`pg_trigger` for the
duplicate-claim trigger, and `pg_rules` for the append-only rules.

Useful: `select tablename, rulename from pg_rules where schemaname='public';`
(`pg_rules` has no `ev_type` column — don't try to select it.)

## Schema invariants worth probing directly in psql

The unit tests run against an in-memory fake store, so **Postgres-level guarantees are only proven by
real SQL**. The high-value ones:

- `asset_event` is append-only via `DO INSTEAD NOTHING` rules: `UPDATE`/`DELETE` report
  `UPDATE 0`/`DELETE 0`. Always re-SELECT to confirm the row is unchanged — a silent no-op and a
  successful mutation both "succeed" at the psql prompt. Note `UPDATE ... RETURNING` raises
  `cannot perform UPDATE RETURNING on relation` instead of no-oping, so avoid `RETURNING` in code
  that writes to `asset_event`.
- `(creator_id, content_sha256)` UNIQUE blocks the *same* creator re-claiming bytes.
- The *cross-creator* collision must NOT be rejected: the `asset_flag_duplicate_claim` BEFORE INSERT
  trigger sets `duplicate_claim_flag = TRUE` on **both/all** colliding rows. Test with a third
  creator too, and include a control row with different bytes to prove the trigger isn't over-flagging.
- `asset_event`'s CHECK ties `promoted_to_trace` and `trace_seq` together: assert all four
  combinations, not just the failing ones.

## Aeneid address verification

```bash
npm run verify:addresses
```
`testnet.rpc.story.foundation` (the `config/chain.ts` default) **often does not resolve** from Devin
environments. The failure is fast (~2s, exit 1) and now names the host and points at `WTR_RPC_URL`;
confirm the cause with `getent hosts testnet.rpc.story.foundation`. Use the alternate endpoint:

```bash
WTR_RPC_URL=https://aeneid.storyrpc.io npm run verify:addresses
```
Expect `chain id 1315 (Aeneid)` and five `ok` lines with non-zero bytecode. Adversarial check worth
doing: point `WTR_RPC_URL` at a mainnet RPC (e.g. `https://ethereum-rpc.publicnode.com`) and confirm
it refuses with a chain-mismatch error — otherwise the chain-id guard is untested.

## Log redaction (`src/lib/log.ts`)

Hard requirement: no plaintext media bytes, decryption keys or private keys in logs. Three
independent mechanisms:

1. any `ArrayBuffer` view (`Uint8Array`, `Buffer`, `DataView`, typed arrays) becomes
   `[bytes len=N]` regardless of field name;
2. `SECRET_KEY_PATTERN` redacts key-ish **field names**;
3. every other string is scrubbed **by shape** (`SECRET_VALUE_PATTERN`: ≥32-byte hex or long base64),
   including the `message` argument and `Error.message`, *unless* its field name is on the
   `READABLE_KEY_PATTERN` allowlist.

Mechanism 3 is the one that carries the guarantee — field names are open-ended — so when reviewing a
change here, the question is not "is this name in the pattern" but "can a secret reach a string that
isn't shape-scrubbed". The allowlist exists because a tx hash and a 32-byte private key are
indistinguishable by shape; anything added to it is deliberately readable, so add only identifiers
(`txHash`, `*_root`, `content_sha256`, uuids, `ipId`, `cid`).

Regression-test the four historical leak classes (pinned in `src/lib/__tests__/log.test.ts`):
`private_key`/`WTR_WALLET_PRIVATE_KEY`, short/unusual names (`k`, `sk`, `pk`, `keyMaterial`,
`wrappedDek`, `blob`, `raw`), a secret inside third-party error text (stage handlers log
`{ error: failure.message }`), and the `message` argument.

Probe method that works: a throwaway `tmp-*.ts` at the repo root importing `./src/lib/log`, run with
`npx tsx` and `WTR_LOG_LEVEL=debug`, embedding a unique sentinel string in every field, then
`grep -c SENTINEL` the captured output. Cover nested, array-wrapped, class-with-getter/`toJSON`,
`Map`/`Set`, depth > 6, and the negative cases that must stay visible: `tokenId`/`tokenIds` (the
pattern has a `token(?!ids?$)` lookahead) plus a `txHash` and an `ipId`. Delete the probe file
afterwards.

Import by absolute path (`/home/ubuntu/repos/WTR/src/lib/log`) if the probe lives in `/tmp` —
a relative `./src/lib/log` resolves against the probe's own directory, not the cwd.

Also grep for sinks that bypass the logger and assess each argument:
`grep -rn "console\.\(log\|error\|warn\)" src scripts config --include=*.ts | grep -v __tests__`.
`src/lib/log.ts` is the legitimate sink; every script prints `error.message` rather than the raw error
object, deliberately — a raw SDK error can carry request state that never passed through the scrubber,
so a `console.error(error)` reintroduced anywhere is a finding.

## Scripts that need secrets

`npm run e2e` and `npm run bootstrap` require `WTR_WALLET_PRIVATE_KEY` and a Trace staging API key,
which are typically unavailable. Do not request them speculatively. You can still verify fail-fast:
`npm run e2e` with no args prints the one-line usage; with any path it prints
`Missing required environment variable WTR_WALLET_PRIVATE_KEY` (env is validated in `createClients()`
*before* the file is read, so a bogus path surfaces the env error first). `config/env.ts` `required()`
produces these messages, so any missing variable is named explicitly.

Without those secrets the real 3a→3b→3c→3d ordering, CDR read path, IPFS upload, mint and settlement
are **unproven at runtime** — say so explicitly in any report rather than leaning on the vitest suite.

## Rendering shell evidence as images

Reports need inline visuals but there is no UI here. ImageMagick's policy blocks `label:@file`; use
PIL instead — read a captured `.txt` of command output and draw it line by line with
`DejaVuSansMono.ttf`, colouring PASS lines green and ERROR/LEAK lines red.

## Devin Secrets Needed

- `WTR_WALLET_PRIVATE_KEY` — Aeneid testnet operator key; required for `npm run bootstrap` and
  `npm run e2e`. Never a mainnet key.
- `WTR_TRACE_API_KEY` — Trace staging API key (plus a `wtr` provider scope); required for `npm run e2e`.

None are needed for typecheck/lint/test/build, migrations, schema probes, `verify:addresses`, or the
redaction probe.
