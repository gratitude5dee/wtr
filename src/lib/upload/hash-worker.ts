/**
 * Web Worker: hashes a File off the main thread so a 2GB video never makes
 * the tab unresponsive (goal.md P0-2). Only the digest leaves the worker —
 * plaintext bytes stay inside it.
 */
import { hashBlobSha256 } from "./sha256-stream";

export interface HashRequest {
  id: string;
  file: File;
}

export type HashResponse =
  | { id: string; kind: "progress"; hashedBytes: number }
  | { id: string; kind: "done"; contentSha256: string }
  | { id: string; kind: "error"; message: string };

self.onmessage = async (event: MessageEvent<HashRequest>) => {
  const { id, file } = event.data;
  try {
    let lastReport = 0;
    const contentSha256 = await hashBlobSha256(file, (hashedBytes) => {
      // Throttle progress messages: every ~8MB is plenty for a progress bar.
      if (hashedBytes - lastReport >= 8 * 1024 * 1024 || hashedBytes === file.size) {
        lastReport = hashedBytes;
        self.postMessage({ id, kind: "progress", hashedBytes } satisfies HashResponse);
      }
    });
    self.postMessage({ id, kind: "done", contentSha256 } satisfies HashResponse);
  } catch (error) {
    self.postMessage({
      id,
      kind: "error",
      message: error instanceof Error ? error.message : String(error),
    } satisfies HashResponse);
  }
};
