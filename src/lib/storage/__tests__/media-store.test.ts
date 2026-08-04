import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { FsMediaStore, mediaStoreBackend } from "../media-store";

const ASSET = "11111111-2222-4333-8444-555555555555";

describe("mediaStoreBackend", () => {
  afterEach(() => {
    delete process.env.WTR_MEDIA_STORE;
    delete process.env.BLOB_READ_WRITE_TOKEN;
  });

  it("defaults to fs without a blob token", () => {
    expect(mediaStoreBackend()).toBe("fs");
  });

  it("selects blob when a token is present", () => {
    process.env.BLOB_READ_WRITE_TOKEN = "vercel_blob_rw_test";
    expect(mediaStoreBackend()).toBe("blob");
  });

  it("honors an explicit override", () => {
    process.env.BLOB_READ_WRITE_TOKEN = "vercel_blob_rw_test";
    process.env.WTR_MEDIA_STORE = "fs";
    expect(mediaStoreBackend()).toBe("fs");
  });
});

describe("FsMediaStore", () => {
  let dir: string;
  let previous: string | undefined;

  beforeAll(() => {
    dir = mkdtempSync(path.join(tmpdir(), "wtr-media-"));
    previous = process.env.WTR_MEDIA_DIR;
    process.env.WTR_MEDIA_DIR = dir;
  });

  afterAll(() => {
    if (previous === undefined) delete process.env.WTR_MEDIA_DIR;
    else process.env.WTR_MEDIA_DIR = previous;
    rmSync(dir, { recursive: true, force: true });
  });

  it("writes chunks at exact offsets and reads the whole ciphertext back", async () => {
    const store = new FsMediaStore();
    await store.writeCiphertextChunk(ASSET, 0, new Uint8Array([1, 2, 3]));
    await store.writeCiphertextChunk(ASSET, 3, new Uint8Array([4, 5]));
    expect(await store.readCiphertext(ASSET, 5)).toEqual(new Uint8Array([1, 2, 3, 4, 5]));
  });

  it("rejects a read whose length does not match the declared total", async () => {
    const store = new FsMediaStore();
    await expect(store.readCiphertext(ASSET, 4)).rejects.toThrow(/incomplete/);
  });

  it("heals by truncating bytes beyond the recorded offset", async () => {
    const store = new FsMediaStore();
    await store.truncateCiphertext(ASSET, 3);
    await store.writeCiphertextChunk(ASSET, 3, new Uint8Array([9, 9]));
    expect(await store.readCiphertext(ASSET, 5)).toEqual(new Uint8Array([1, 2, 3, 9, 9]));
  });

  it("refuses a write past the end of the stored bytes", async () => {
    const store = new FsMediaStore();
    await expect(store.writeCiphertextChunk(ASSET, 99, new Uint8Array([1]))).rejects.toThrow(
      /out of sync/,
    );
  });

  it("round-trips previews and reports missing ones as null", async () => {
    const store = new FsMediaStore();
    expect(await store.readPreview(ASSET)).toBeNull();
    await store.writePreview(ASSET, new Uint8Array([0xff, 0xd8, 0xff]));
    expect(await store.readPreview(ASSET)).toEqual(new Uint8Array([0xff, 0xd8, 0xff]));
  });
});
