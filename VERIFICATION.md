# Aeneid verification log

Re-run `npm run verify:addresses` at the start of every phase (goal.md §12): a testnet redeploy of
any condition contract would break stage 3d silently.

## 2026-08-04 — phase 1 start

DNS for `testnet.rpc.story.foundation` did not resolve from the build environment, so verification
used the alternate Aeneid endpoint `https://aeneid.storyrpc.io`. `config/chain.ts` still carries the
goal.md §5.2 URL verbatim; only the verification run used the alternate host.

| Check | Result |
| --- | --- |
| `eth_chainId` | `0x523` = `1315` (Aeneid) |
| `OWNER_WRITE_CONDITION` `0x4C9bFC96d7092b590D497A191826C3dA2277c34B` | non-empty bytecode |
| `LICENSE_READ_CONDITION` `0xC0640AD4CF2CaA9914C8e5C44234359a9102f7a3` | non-empty bytecode |
| `LICENSE_TOKEN` `0xFe3838BFb30B34170F00030B52eA4893d8aAC6bC` | non-empty bytecode |
| `allocateFee()` / `writeFee()` / `readFee()` | `0` each — **read live, never hardcoded** |
| `maxEncryptedDataSize()` | `1024` bytes — why media goes through `uploadFile`, not `uploadCDR` |

Only chain id and code presence are established. Calls to guessed
`checkWriteCondition` / `checkReadCondition` signatures reverted, so the condition contracts'
ABI shape is **not** confirmed and no semantic claim is made about them here. This is also why
`uploader.allocate()` is called with `skipConditionValidation: true` in
`src/lib/pipeline/adapters.ts` — the SDK's preflight probes those same guessed signatures.

## Trace staging

`https://staging-api.storyprotocol.net` resolves and responds, but `GET /api/v4/health` returned
`404 page not found`. That is not evidence the API is unavailable — the path is a guess. The
register/update paths in `src/lib/trace/client.ts` are likewise unconfirmed against a live
deployment because no API key was available (goal.md §11 Q1). Expect to correct them on the first
real run.
