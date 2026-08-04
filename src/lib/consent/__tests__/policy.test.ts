import { describe, expect, it, vi } from "vitest";

import { activeProviderPolicy } from "../policy";
import { CURRENT_PRIVACY, CURRENT_TOS } from "../documents";
import { TraceClient } from "../../trace/client";

describe("provider policy", () => {
  it("serves exactly the versions the UI displays", async () => {
    const policy = await activeProviderPolicy();
    expect(policy.provider).toBe("wtr");
    expect(policy.tos.version).toBe(CURRENT_TOS.version);
    expect(policy.tos.uri).toBe(CURRENT_TOS.uri);
    expect(policy.tos.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(policy.privacy.version).toBe(CURRENT_PRIVACY.version);
    expect(policy.privacy.sha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it("pushes the policy via PUT to the data-audit webhook", async () => {
    const fetchImpl = vi.fn(async () => new Response("{}", { status: 200 }));
    const client = new TraceClient({
      baseUrl: "https://staging.example",
      apiKey: "test-key",
      provider: "wtr",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    const policy = await activeProviderPolicy();
    await client.pushProviderPolicy({ policy, batchId: "batch-1" });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://staging.example/webhook/v1/data-audit/provider-policy");
    expect(init.method).toBe("PUT");
    expect(JSON.parse(init.body as string).tos.version).toBe(CURRENT_TOS.version);
  });
});
