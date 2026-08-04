import { describe, expect, it } from "vitest";

import { MeasuredLabelError, serverTier1Labels, validateMeasuredLabels } from "../tier1";

describe("serverTier1Labels", () => {
  it("derives modality, media type, byte size and format", () => {
    const labels = serverTier1Labels({
      filename: "take-1.WAV",
      mimeType: "audio/wav",
      modality: "audio",
      byteSize: 1234,
    });
    const byKey = Object.fromEntries(labels.map((label) => [label.key, label.value]));
    expect(byKey).toEqual({
      modality: "audio",
      media_type: "audio/wav",
      byte_size: 1234,
      format: "wav",
    });
    for (const label of labels) {
      expect(label.source).toBe("model");
      expect(label.confidence).toBe(1);
      expect(label.namespace).toBe("wtr");
    }
  });

  it("omits format when the filename has no extension", () => {
    const labels = serverTier1Labels({
      filename: "recording",
      mimeType: "audio/wav",
      modality: "audio",
      byteSize: 1,
    });
    expect(labels.find((label) => label.key === "format")).toBeUndefined();
  });
});

describe("validateMeasuredLabels", () => {
  it("accepts allowlisted numeric measurements", () => {
    const labels = validateMeasuredLabels({ duration_s: 12.3456, width: 1920, height: 1080 });
    expect(labels.map((label) => [label.key, label.value])).toEqual([
      ["duration_s", 12.346],
      ["width", 1920],
      ["height", 1080],
    ]);
  });

  it("rejects unknown keys — the allowlist is strict", () => {
    expect(() => validateMeasuredLabels({ gps_lat: 1 })).toThrow(MeasuredLabelError);
  });

  it("rejects non-finite, non-integer and out-of-range values", () => {
    expect(() => validateMeasuredLabels({ duration_s: Infinity })).toThrow(MeasuredLabelError);
    expect(() => validateMeasuredLabels({ width: 1.5 })).toThrow(MeasuredLabelError);
    expect(() => validateMeasuredLabels({ height: 0 })).toThrow(MeasuredLabelError);
    expect(() => validateMeasuredLabels({ duration_s: -1 })).toThrow(MeasuredLabelError);
    expect(() => validateMeasuredLabels({ width: "1920" })).toThrow(MeasuredLabelError);
  });

  it("rejects empty and non-object payloads", () => {
    expect(() => validateMeasuredLabels({})).toThrow(MeasuredLabelError);
    expect(() => validateMeasuredLabels(null)).toThrow(MeasuredLabelError);
    expect(() => validateMeasuredLabels([1])).toThrow(MeasuredLabelError);
  });
});
