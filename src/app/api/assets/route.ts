import { NextResponse } from "next/server";

import { hasCurrentConsent } from "@/lib/consent/service";
import { getCurrentCreator } from "@/lib/dashboard/queries";
import { log } from "@/lib/log";
import { modalityForFilename } from "@/lib/upload/modality";
import { registerAsset } from "@/lib/upload/register-asset";

export async function POST(request: Request): Promise<NextResponse> {
  const creator = await getCurrentCreator();
  if (!creator) {
    return NextResponse.json({ error: "no creator account" }, { status: 401 });
  }
  if (!(await hasCurrentConsent(creator.id))) {
    // P0-1: uploads are impossible without an active consent record.
    return NextResponse.json({ error: "consent required" }, { status: 403 });
  }

  const body: unknown = await request.json().catch(() => null);
  if (typeof body !== "object" || body === null) {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }
  const { filename, byteSize, mimeType, contentSha256 } = body as Record<string, unknown>;
  if (
    typeof filename !== "string" ||
    typeof byteSize !== "number" ||
    typeof mimeType !== "string" ||
    typeof contentSha256 !== "string"
  ) {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }

  const modality = modalityForFilename(filename);
  if (!modality) {
    return NextResponse.json({ error: "unsupported file type" }, { status: 415 });
  }

  try {
    const result = await registerAsset({
      creatorId: creator.id,
      filename,
      byteSize,
      mimeType,
      modality,
      contentSha256,
    });
    return NextResponse.json(result, { status: result.existing ? 200 : 201 });
  } catch (error) {
    const failure = error as Error;
    log.error("asset registration failed", { error: failure.message });
    return NextResponse.json({ error: failure.message }, { status: 400 });
  }
}
