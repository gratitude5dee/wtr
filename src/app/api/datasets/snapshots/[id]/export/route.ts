import { NextRequest, NextResponse } from "next/server";

import { getActingCreator } from "@/lib/dashboard/queries";
import { exportSnapshot } from "@/lib/datasets/export";
import { DatasetError, getDataset, getSnapshot } from "@/lib/datasets/service";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

/**
 * Downloads one export template for a snapshot: `?part=data` (default) yields
 * the JSONL, `?part=card` the provenance-backed dataset card. Only the
 * dataset's owner may export it.
 */
export async function GET(request: NextRequest, context: Context): Promise<Response> {
  const { id } = await context.params;
  const creator = await getActingCreator();
  if (!creator) return NextResponse.json({ error: "no creator account" }, { status: 401 });

  const template = request.nextUrl.searchParams.get("template") ?? "sft_jsonl";
  const part = request.nextUrl.searchParams.get("part") === "card" ? "card" : "data";

  const snapshot = await getSnapshot(id);
  if (!snapshot) return NextResponse.json({ error: "unknown snapshot" }, { status: 404 });
  const dataset = await getDataset(snapshot.datasetId);
  if (!dataset || dataset.ownerCreatorId !== creator.id) {
    return NextResponse.json({ error: "unknown snapshot" }, { status: 404 });
  }

  try {
    const result = await exportSnapshot(id, template);
    const body = part === "card" ? result.card : result.body;
    const filename =
      part === "card" ? result.filename.replace(/\.jsonl$/, "-card.md") : result.filename;
    return new Response(body, {
      headers: {
        "Content-Type": part === "card" ? "text/markdown; charset=utf-8" : result.contentType,
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    if (error instanceof DatasetError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    throw error;
  }
}
