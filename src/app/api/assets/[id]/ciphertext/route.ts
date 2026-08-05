import { NextRequest, NextResponse } from "next/server";

import { getActingCreator } from "@/lib/dashboard/queries";
import { log } from "@/lib/log";
import {
  appendChunk,
  beginUpload,
  CiphertextError,
  MAX_CHUNK_BYTES,
  uploadStatus,
} from "@/lib/upload/ciphertext-store";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

/** Resume point: the client asks where to continue after a tab close or drop. */
export async function GET(_request: NextRequest, context: Context): Promise<NextResponse> {
  const { id } = await context.params;
  const creator = await getActingCreator();
  if (!creator) return NextResponse.json({ error: "no creator account" }, { status: 401 });
  try {
    return NextResponse.json(await uploadStatus(creator.id, id));
  } catch (error) {
    return handleError(error);
  }
}

/**
 * One ciphertext chunk, strictly in order. The first chunk carries the upload
 * shape in headers; every chunk states its offset so a stale retry can never
 * corrupt the file.
 */
export async function PUT(request: NextRequest, context: Context): Promise<NextResponse> {
  const { id } = await context.params;
  const creator = await getActingCreator();
  if (!creator) return NextResponse.json({ error: "no creator account" }, { status: 401 });

  try {
    const offset = Number(request.headers.get("x-upload-offset") ?? "");
    if (!Number.isInteger(offset) || offset < 0) {
      throw new CiphertextError("x-upload-offset header required");
    }
    const ivBase = request.headers.get("x-upload-iv-base") ?? "";

    // Refuse to buffer an oversized body: the declared length is checked
    // before a single byte is read into memory.
    const declaredLength = Number(request.headers.get("content-length") ?? "");
    if (!Number.isInteger(declaredLength) || declaredLength <= 0) {
      throw new CiphertextError("content-length header required");
    }
    if (declaredLength > MAX_CHUNK_BYTES) throw new CiphertextError("chunk too large", 413);

    if (offset === 0) {
      const totalBytes = Number(request.headers.get("x-upload-total-bytes") ?? "");
      const chunkBytes = Number(request.headers.get("x-upload-chunk-bytes") ?? "");
      await beginUpload(creator.id, id, { totalBytes, chunkBytes, ivBase });
    }

    const body = new Uint8Array(await request.arrayBuffer());
    const status = await appendChunk(creator.id, id, offset, body, ivBase);
    return NextResponse.json(status);
  } catch (error) {
    return handleError(error);
  }
}

function handleError(error: unknown): NextResponse {
  if (error instanceof CiphertextError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }
  log.error("ciphertext upload failed", { error: (error as Error).message });
  return NextResponse.json({ error: "upload failed — try again" }, { status: 500 });
}
