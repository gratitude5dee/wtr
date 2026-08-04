import { NextRequest, NextResponse } from "next/server";

import { getCurrentCreator } from "@/lib/dashboard/queries";
import { log } from "@/lib/log";
import {
  appendChunk,
  beginUpload,
  CiphertextError,
  uploadStatus,
} from "@/lib/upload/ciphertext-store";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

/** Resume point: the client asks where to continue after a tab close or drop. */
export async function GET(_request: NextRequest, context: Context): Promise<NextResponse> {
  const { id } = await context.params;
  const creator = await getCurrentCreator();
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
  const creator = await getCurrentCreator();
  if (!creator) return NextResponse.json({ error: "no creator account" }, { status: 401 });

  try {
    const offset = Number(request.headers.get("x-upload-offset") ?? "");
    if (!Number.isInteger(offset) || offset < 0) {
      throw new CiphertextError("x-upload-offset header required");
    }

    if (offset === 0) {
      const totalBytes = Number(request.headers.get("x-upload-total-bytes") ?? "");
      const chunkBytes = Number(request.headers.get("x-upload-chunk-bytes") ?? "");
      const ivBase = request.headers.get("x-upload-iv-base") ?? "";
      await beginUpload(creator.id, id, { totalBytes, chunkBytes, ivBase });
    }

    const body = new Uint8Array(await request.arrayBuffer());
    const status = await appendChunk(creator.id, id, offset, body);
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
