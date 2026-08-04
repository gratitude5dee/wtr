import { after, NextRequest, NextResponse } from "next/server";

import { getCurrentCreator } from "@/lib/dashboard/queries";
import { enqueueTier2, runTier2Job } from "@/lib/labels/tier2";
import { log } from "@/lib/log";
import { PreviewError, readPreview, storePreview } from "@/lib/upload/preview-store";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

/** The public, deliberately degraded preview. */
export async function GET(_request: NextRequest, context: Context): Promise<Response> {
  const { id } = await context.params;
  const preview = await readPreview(id);
  if (!preview) return NextResponse.json({ error: "no preview" }, { status: 404 });
  return new Response(new Uint8Array(preview.bytes), {
    headers: { "Content-Type": preview.mime, "Cache-Control": "public, max-age=3600" },
  });
}

export async function PUT(request: NextRequest, context: Context): Promise<NextResponse> {
  const { id } = await context.params;
  const creator = await getCurrentCreator();
  if (!creator) return NextResponse.json({ error: "no creator account" }, { status: 401 });
  try {
    const bytes = new Uint8Array(await request.arrayBuffer());
    const previewUrl = await storePreview(creator.id, id, bytes);
    // Tier-2 labeling is queued off the preview and runs after the response
    // is sent — the upload flow never blocks on (or fails because of) it.
    try {
      const state = await enqueueTier2(id);
      if (state === "queued") after(() => runTier2Job(id));
    } catch (error) {
      log.warn("tier-2 enqueue failed", { assetId: id, error: (error as Error).message });
    }
    return NextResponse.json({ previewUrl });
  } catch (error) {
    if (error instanceof PreviewError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    log.error("preview store failed", { error: (error as Error).message });
    return NextResponse.json({ error: "preview failed — try again" }, { status: 500 });
  }
}
