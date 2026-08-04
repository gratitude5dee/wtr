/**
 * CDR condition encodings.
 *
 * The read gate for a licensed asset is `LICENSE_READ_CONDITION` with
 * `readConditionData = abi.encode(LICENSE_TOKEN, ipId)` (goal.md §5.2) — which
 * is why stage 3c (`registerIpAsset`, produces `ipId`) MUST complete before
 * stage 3d can allocate the vault.
 */
import { encodeAbiParameters } from "viem";

import { LICENSE_TOKEN } from "../../../config/chain";

/** `abi.encode(address owner)` — the owner allowed to write to the vault. */
export function encodeOwnerWriteConditionData(owner: `0x${string}`): `0x${string}` {
  return encodeAbiParameters([{ type: "address" }], [owner]);
}

/** `abi.encode(address licenseToken, address ipId)` — read allowed to license holders of `ipId`. */
export function encodeLicenseReadConditionData(ipId: `0x${string}`): `0x${string}` {
  return encodeAbiParameters(
    [{ type: "address" }, { type: "address" }],
    [LICENSE_TOKEN, ipId],
  );
}

/** `abi.encode(uint256[] licenseTokenIds)` — the tokens a reader presents at access time. */
export function encodeLicenseAccessAuxData(licenseTokenIds: readonly bigint[]): `0x${string}` {
  return encodeAbiParameters([{ type: "uint256[]" }], [[...licenseTokenIds]]);
}
