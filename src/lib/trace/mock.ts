/**
 * MOCK Trace transport, for demonstrating the pipeline while WTR is on the
 * DATA Foundation waitlist and holds no provider API key.
 *
 * It is a `fetch`-shaped stand-in that implements the documented behavior of
 * the three write endpoints — never a fake blockchain or a fake audit trail:
 *  - `data_id`s are deterministic per provider + `source_record_id`, exactly
 *    as the real service guarantees;
 *  - duplicate vs. conflict semantics of `/records:batch` are honored;
 *  - `seq` bounds and conflict-on-different-content of
 *    `/metadata-updates:batch` are honored.
 *
 * Every mock response is marked `"mock": true` and every call logs loudly, so
 * a demo can never be mistaken for a real Trace registration.
 */
import { sha256Canonical, stripHexPrefix } from "../crypto/canonical";
import { log } from "../log";

interface RecordItem {
  source_record_id?: string;
  initial_metadata_root?: string;
  initial_metadata_json?: unknown;
  occurred_at?: string;
}

interface UpdateItem {
  data_id?: string;
  seq?: number;
  prev_metadata_root?: string;
  metadata_root?: string;
  metadata_json?: unknown;
  occurred_at?: string;
}

interface StoredRecord {
  dataId: string;
  payloadHash: string;
  updates: Map<number, string>;
}

/** Deterministic UUID-v4-shaped id from provider + source_record_id. */
async function deterministicDataId(provider: string, sourceRecordId: string): Promise<string> {
  const hex = stripHexPrefix(await sha256Canonical({ provider, source_record_id: sourceRecordId }));
  return (
    `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-` +
    `8${hex.slice(17, 20)}-${hex.slice(20, 32)}`
  );
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/**
 * Builds a `fetch` implementation that simulates the Trace write API
 * in-process. State lives for the lifetime of the transport instance.
 */
export function createMockTraceFetch(): typeof fetch {
  const records = new Map<string, StoredRecord>();

  return async (input, init) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const path = new URL(url).pathname;
    const method = init?.method ?? "GET";
    const provider =
      (init?.headers as Record<string, string> | undefined)?.["X-Provider"] ?? "unknown";
    const body = init?.body ? (JSON.parse(String(init.body)) as unknown) : undefined;

    log.warn("TRACE MOCK: simulating Trace API call — NOT a real registration", {
      path,
      method,
    });

    if (method === "PUT" && path === "/webhook/v1/data-audit/provider-policy") {
      return jsonResponse(200, { mock: true, status: "stored" });
    }

    if (method === "POST" && path === "/webhook/v1/data-audit/records:batch") {
      const items = (body as RecordItem[]) ?? [];
      const out = [];
      let conflicts = 0;
      for (const item of items) {
        const sourceRecordId = item.source_record_id ?? "";
        const key = `${provider}:${sourceRecordId}`;
        const dataId = await deterministicDataId(provider, sourceRecordId);
        const payloadHash = stripHexPrefix(
          await sha256Canonical({ root: item.initial_metadata_root, json: item.initial_metadata_json }),
        );
        const existing = records.get(key);
        let status: "accepted" | "duplicate" | "conflict";
        if (!existing) {
          // An update may have arrived before this registration (at-least-once
          // delivery); adopt its record so the seq history it accumulated
          // keeps deduping and conflicting correctly.
          const preRegistered = records.get(`data_id:${dataId}`);
          if (preRegistered) {
            preRegistered.payloadHash = payloadHash;
            records.set(key, preRegistered);
            records.delete(`data_id:${dataId}`);
          } else {
            records.set(key, { dataId, payloadHash, updates: new Map() });
          }
          status = "accepted";
        } else if (existing.payloadHash === payloadHash) {
          status = "duplicate";
        } else {
          status = "conflict";
          conflicts += 1;
        }
        out.push({ source_record_id: sourceRecordId, data_id: dataId, status });
      }
      return jsonResponse(conflicts > 0 ? 409 : 202, {
        mock: true,
        provider,
        records: items.length,
        conflicts,
        items: out,
      });
    }

    if (method === "POST" && path === "/webhook/v1/data-audit/metadata-updates:batch") {
      const items = (body as UpdateItem[]) ?? [];
      const byDataId = new Map(
        [...records.values()].map((record) => [record.dataId, record] as const),
      );
      const out = [];
      let conflicts = 0;
      for (const item of items) {
        const dataId = item.data_id ?? "";
        const seq = item.seq ?? 0;
        if (seq < 1 || seq > 100) {
          return jsonResponse(400, { mock: true, error: "seq must be 1-100" });
        }
        // Updates may arrive before registration (documented at-least-once
        // semantics), so an unknown data_id is still accepted — its history is
        // persisted under a synthetic key so later resends dedupe correctly.
        let record = byDataId.get(dataId);
        if (!record) {
          const syntheticKey = `data_id:${dataId}`;
          record = records.get(syntheticKey);
          if (!record) {
            record = { dataId, payloadHash: "", updates: new Map<number, string>() };
            records.set(syntheticKey, record);
          }
          byDataId.set(dataId, record);
        }
        const eventHash = stripHexPrefix(
          await sha256Canonical({
            prev: item.prev_metadata_root,
            root: item.metadata_root,
            json: item.metadata_json,
          }),
        );
        const existing = record.updates.get(seq);
        let status: "accepted" | "duplicate" | "conflict";
        if (existing === undefined) {
          record.updates.set(seq, eventHash);
          status = "accepted";
        } else if (existing === eventHash) {
          status = "duplicate";
        } else {
          status = "conflict";
          conflicts += 1;
        }
        out.push({ data_id: dataId, seq, status });
      }
      return jsonResponse(conflicts > 0 ? 409 : 202, {
        mock: true,
        provider,
        records: items.length,
        conflicts,
        items: out,
      });
    }

    return jsonResponse(404, { mock: true, error: `no mock for ${method} ${path}` });
  };
}
