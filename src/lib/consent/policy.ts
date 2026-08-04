/**
 * WTR's active provider policy (goal.md P0-1 acceptance): the version served
 * by `GET /providers/wtr/policy` must match what the UI displays, so both are
 * derived from the same CURRENT_* constants — there is no second copy to
 * drift. The same document is what gets pushed to Trace via
 * `PUT /webhook/v1/data-audit/provider-policy`.
 */
import { CURRENT_PRIVACY, CURRENT_SCOPES, CURRENT_TOS, documentSha256 } from "./documents";

export interface ProviderPolicy {
  provider: "wtr";
  tos: { version: string; sha256: string; uri: string };
  privacy: { version: string; sha256: string; uri: string };
  scopes: typeof CURRENT_SCOPES;
}

export async function activeProviderPolicy(): Promise<ProviderPolicy> {
  const [tosSha, privacySha] = await Promise.all([
    documentSha256(CURRENT_TOS),
    documentSha256(CURRENT_PRIVACY),
  ]);
  return {
    provider: "wtr",
    tos: { version: CURRENT_TOS.version, sha256: tosSha, uri: CURRENT_TOS.uri },
    privacy: { version: CURRENT_PRIVACY.version, sha256: privacySha, uri: CURRENT_PRIVACY.uri },
    scopes: CURRENT_SCOPES,
  };
}
