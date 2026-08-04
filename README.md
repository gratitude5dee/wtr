# WTR

Asset marketplace / data-licensing pipeline on **Story Aeneid testnet only** (chain id `1315`).

Phase 1 goal: **one asset traverses all five pipeline stages end to end via a script, with no UI.**

```text
IN_TRAY → LABELED → REGISTERED → LISTED → SOLD/SETTLED
                        │
                        └── failure → FAILED_REGISTER (retry resumes, never restarts)
```

The Next.js App Router + Tailwind + shadcn stack is scaffolded because later phases add the
dashboard; `components.json` exists so a future `dither-kit` CLI run has something to write into.
No dither-kit in this phase, and no UI work beyond the default page.

## Layout

| Path | Purpose |
| --- | --- |
| `config/chain.ts` | **Single source of truth** for the chain and every address. No address literals anywhere else. |
| `config/env.ts` | Typed, lazily-read environment access. |
| `db/migrations/` | Forward-only SQL migrations. `asset_event` is the append-only source of truth; `asset` is a projection. |
| `src/lib/pipeline/stages/` | The five stage handlers, `(assetId) => Promise<StageResult>`. |
| `src/lib/pipeline/ports.ts` | The only network boundaries a handler may touch. |
| `src/lib/pipeline/adapters.ts` | Real SDK implementations of those ports. |
| `src/lib/trace/` | Trace provider client, `trace-v1.0` documents, promotion subset. |
| `src/lib/story/` | PIL license presets and IPA/NFT metadata documents. |
| `scripts/` | `verify-addresses`, `migrate`, `bootstrap`, `e2e`. |

## Setup

```bash
npm install
cp .env.example .env.local        # fill in DATABASE_URL + WTR_WALLET_PRIVATE_KEY
npm run db:migrate
npm run verify:addresses          # do this at the start of every phase
npm run bootstrap                 # once: SPG collection + 3 licenseTermsIds
npm run e2e -- ./path/to/audio.wav
```

`npm run verify:addresses` asserts the RPC really is Aeneid and that all three CDR condition
contracts from goal.md §5.2 still have deployed bytecode. A testnet redeploy would otherwise break
stage 3d silently.

## Stage 3 ordering

Stage 3 is four sub-steps in a **strict** order, each guarded by its own event:

1. **3a** encrypt client-side + `uploader.uploadFile()` → IPFS cid + owner-gated vault.
   `uploadCDR()` is never used for media — on-chain vault payloads are capped at 1024 bytes.
2. **3b** Trace register → `data_id` + `initial_metadata_root` (deterministic SHA-256 over the
   canonical trace-v1.0 document).
3. **3c** `client.ipAsset.registerIpAsset(...)` → `ipId`.
4. **3d** allocate the CDR vault with `readConditionData = abi.encode(LICENSE_TOKEN, ipId)`.

3c must precede 3d — 3d's read condition *contains* `ipId`, so they are never parallelised. Any
failure records the completed sub-steps and leaves the asset in `FAILED_REGISTER`; the retry picks
up exactly where it stopped.

## Non-negotiables enforced in code

- **No plaintext, keys or secrets in logs.** `src/lib/log.ts` scrubs every field it is given: byte
  arrays become `[bytes len=N]`, key-shaped fields become `[redacted]`. Tested.
- **Money is `bigint` wei end to end**, stored as `NUMERIC(78,0)`, formatted only at a render
  boundary (`src/lib/money.ts`).
- **No hardcoded fees.** Allocate/write/read fees are live SDK reads; the license minting fee comes
  from `predictMintingLicenseFee`.
- **No PII in Trace.** Contributors appear as `contributor.anon_id`; `assertNoPii` fails the request
  if a PII-shaped key sneaks into a payload.
- **Trace metadata updates are full-state**, chained `prev_metadata_root → metadata_root`, and only
  the promoted subset (consent, KYC, license, takedown, `payment_credited_at`) is sent, to stay
  inside Trace's 100-updates-per-`data_id` cap.
- **Failure path first.** Every stage handler has a test that drops the connection mid-transaction
  and asserts the resulting state and the resuming retry.

## Blocked (external decisions, not resolvable in code)

- **Q1** — WTR needs a Trace provider scope + staging API key. Without `WTR_TRACE_API_KEY`, stage 3b
  and therefore `npm run e2e` cannot run against Trace staging.
- **Q7** — confirmation that a testnet-only launch is acceptable. Everything here is Aeneid-only by
  construction; mainnet is not configurable.

## Commands

```bash
npm test          # vitest
npm run typecheck # tsc --noEmit
npm run lint      # eslint
npm run build     # next build
```
