import type { LicensePreset } from "../story/license-presets";

import type { Ports } from "./ports";
import type { AssetStore, LabelInput } from "./store";

/** Everything a stage handler needs. Injected so handlers stay I/O-pure. */
export interface StageDeps {
  store: AssetStore;
  ports: Ports;
  /** Vault owner / operator address. */
  owner: `0x${string}`;
  /** Clock, injected so tests are deterministic. */
  now: () => Date;
  /** Labels proposed for an asset in stage 2. */
  proposeLabels: (params: {
    assetId: string;
    mediaType: string;
    filename: string | null;
  }) => Promise<LabelInput[]>;
  /** Ask price for a listing, in wei. */
  quotePriceWei: (params: { assetId: string; licensePreset: LicensePreset }) => Promise<bigint>;
  /** Counterparty of the phase-1 settlement exercise. */
  buyer: { anonId: string; receiver?: `0x${string}` };
  /** Fallback preset when an asset carries no `wtr:license_preset` label. */
  defaultLicensePreset: LicensePreset;
}
