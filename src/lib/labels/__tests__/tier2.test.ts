import { afterEach, describe, expect, it, vi } from "vitest";

import { labelPreviewWithModel, parseTier2Response, tier2Configured } from "../tier2";

afterEach(() => {
  vi.unstubAllEnvs();
});

function configure() {
  vi.stubEnv("WTR_TIER2_API_URL", "https://model.example/v1");
  vi.stubEnv("WTR_TIER2_API_KEY", "test-key");
  vi.stubEnv("WTR_TIER2_MODEL", "test-vision-model");
}

describe("tier2Configured", () => {
  it("is false without a key and model, true with both", () => {
    vi.stubEnv("WTR_TIER2_API_KEY", "");
    vi.stubEnv("WTR_TIER2_MODEL", "");
    expect(tier2Configured()).toBe(false);
    configure();
    expect(tier2Configured()).toBe(true);
  });
});

describe("parseTier2Response", () => {
  it("keeps only allowlisted keys with valid values and clamps confidence", () => {
    const raw = JSON.stringify({
      labels: [
        { key: "genre", value: "ambient", confidence: 0.9 },
        { key: "mood", value: "calm", confidence: 1.7 },
        { key: "not_a_key", value: "x", confidence: 0.9 },
        { key: "subject", value: "", confidence: 0.9 },
        { key: "style", value: "y".repeat(200), confidence: 0.9 },
        { key: "setting", value: "beach", confidence: "high" },
      ],
    });
    const labels = parseTier2Response(raw, "m1");
    expect(labels.map((l) => l.key)).toEqual(["genre", "mood"]);
    expect(labels[1].confidence).toBe(1);
    for (const label of labels) {
      expect(label.source).toBe("model");
      expect(label.modelId).toBe("m1");
      expect(label.namespace).toBe("wtr");
    }
  });

  it("rejects non-JSON output", () => {
    expect(() => parseTier2Response("not json", "m1")).toThrow(/invalid JSON/);
  });

  it("returns no labels for JSON without a labels array", () => {
    expect(parseTier2Response("{}", "m1")).toEqual([]);
  });
});

describe("labelPreviewWithModel", () => {
  it("sends the preview to the configured endpoint and parses the reply", async () => {
    configure();
    const calls: { url: string; init: RequestInit }[] = [];
    const fetchImpl = (async (url: unknown, init: unknown) => {
      calls.push({ url: String(url), init: init as RequestInit });
      return new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  labels: [{ key: "subject", value: "forest", confidence: 0.7 }],
                }),
              },
            },
          ],
        }),
        { status: 200 },
      );
    }) as typeof fetch;

    const labels = await labelPreviewWithModel(new Uint8Array([1, 2, 3]), fetchImpl);
    expect(labels).toEqual([
      {
        namespace: "wtr",
        key: "subject",
        value: "forest",
        source: "model",
        confidence: 0.7,
        modelId: "test-vision-model",
      },
    ]);
    expect(calls[0].url).toBe("https://model.example/v1/chat/completions");
    const body = JSON.parse(String(calls[0].init.body));
    expect(body.model).toBe("test-vision-model");
    expect(JSON.stringify(body)).toContain("data:image/jpeg;base64,AQID");
  });

  it("fails loudly on a non-2xx response", async () => {
    configure();
    const fetchImpl = (async () => new Response("nope", { status: 500 })) as typeof fetch;
    await expect(labelPreviewWithModel(new Uint8Array([1]), fetchImpl)).rejects.toThrow(/500/);
  });

  it("fails loudly when the model returns no content", async () => {
    configure();
    const fetchImpl = (async () =>
      new Response(JSON.stringify({ choices: [] }), { status: 200 })) as typeof fetch;
    await expect(labelPreviewWithModel(new Uint8Array([1]), fetchImpl)).rejects.toThrow(
      /no content/,
    );
  });
});
